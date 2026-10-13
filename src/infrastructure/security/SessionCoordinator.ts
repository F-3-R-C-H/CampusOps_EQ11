/**
 * Infrastructure: SessionCoordinator
 *
 * Administrador de sesión y coordinador de renovación concurrente (Single-Flight).
 * Semana 06 — DMI EQ-11 (Fernando).
 *
 * Responsabilidades:
 *  1. Single-Flight Mutex: cuando múltiples peticiones concurrentes reciben un 401,
 *     únicamente la primera dispara la llamada a `/v1/session/refresh`. Todas las demás
 *     esperan la misma promesa compartida (coalescing) y reintentan con el nuevo token.
 *  2. Prevención de bucles infinitos: si una petición reintentada vuelve a recibir 401,
 *     no se vuelve a renovar (máximo 1 reintento por petición).
 *  3. Limpieza segura en fallo: si el refresh es rechazado (token expirado/revocado),
 *     se eliminan inmediatamente los tokens de SecureStore mediante clearSecureSession().
 *  4. Sanitización estricta: nunca se exponen tokens, contraseñas ni cabeceras en logs.
 */

import {
  clearSecureSession as defaultClearSecureSession,
  getRefreshToken as defaultGetRefreshToken,
  getSessionToken as defaultGetSessionToken,
  saveRefreshToken as defaultSaveRefreshToken,
  saveSessionToken as defaultSaveSessionToken,
} from './secureStorage';
import { logWarn } from '../logging/secureLogger';
import type { FetchLike, TechnicalLogger } from '../http/CourseHttpClient';

export type RefreshOutcome =
  | Readonly<{ ok: true; activeGeneration: number; coalesced: boolean }>
  | Readonly<{ ok: false; status: number; code?: string; coalesced: boolean }>;

export type RefreshExecutionResult =
  | Readonly<{ ok: true; accessToken: string; refreshToken?: string }>
  | Readonly<{ ok: false; status: number; code?: string }>;

export type RefreshEndpointCall = (refreshToken: string) => Promise<RefreshExecutionResult>;

export interface SecureStorageAccess {
  getSessionToken(): Promise<string | null>;
  getRefreshToken(): Promise<string | null>;
  saveSessionToken(token: string): Promise<void>;
  saveRefreshToken(token: string): Promise<void>;
  clearSecureSession(): Promise<void>;
}

export type SessionCoordinatorOptions = Readonly<{
  baseUrl?: string;
  fetchImpl?: FetchLike;
  storage?: SecureStorageAccess;
  refreshCall?: RefreshEndpointCall;
  logger?: TechnicalLogger;
  fallbackToken?: string;
}>;

const DEFAULT_STORAGE: SecureStorageAccess = {
  getSessionToken: defaultGetSessionToken,
  getRefreshToken: defaultGetRefreshToken,
  saveSessionToken: defaultSaveSessionToken,
  saveRefreshToken: defaultSaveRefreshToken,
  clearSecureSession: defaultClearSecureSession,
};

async function defaultRemoteRefresh(
  baseUrl: string,
  fetchImpl: FetchLike,
  refreshToken: string,
): Promise<RefreshExecutionResult> {
  const url = `${baseUrl.replace(/\/$/, '')}/v1/session/refresh`;
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      let code: string | undefined;
      try {
        const text = await response.text();
        const parsed = JSON.parse(text);
        if (typeof parsed === 'object' && parsed !== null && typeof parsed.code === 'string') {
          code = parsed.code;
        }
      } catch {
        // Ignorar fallo de parseo de error
      }
      return { ok: false, status: response.status, ...(code !== undefined ? { code } : {}) };
    }

    const payload = await response.json();
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'accessToken' in payload &&
      typeof payload.accessToken === 'string'
    ) {
      return {
        ok: true,
        accessToken: payload.accessToken,
        ...(typeof payload.refreshToken === 'string' ? { refreshToken: payload.refreshToken } : {}),
      };
    }
    return { ok: false, status: 502, code: 'invalid_refresh_payload' };
  } catch {
    return { ok: false, status: 0, code: 'refresh_network_error' };
  }
}

export class SessionCoordinator {
  private activeGeneration = 0;
  private inFlightRefresh: Promise<RefreshOutcome> | null = null;
  private refreshCallsCount = 0;

  private readonly storage: SecureStorageAccess;
  private readonly refreshCall: RefreshEndpointCall;
  private readonly logger: TechnicalLogger;
  private readonly fallbackToken: string;

  constructor(options: SessionCoordinatorOptions = {}) {
    const baseUrl = options.baseUrl ?? 'http://127.0.0.1:4310';
    const fetchImpl = options.fetchImpl ?? fetch;
    this.storage = options.storage ?? DEFAULT_STORAGE;
    this.refreshCall = options.refreshCall ?? ((rt) => defaultRemoteRefresh(baseUrl, fetchImpl, rt));
    this.logger = options.logger ?? logWarn;
    this.fallbackToken = options.fallbackToken ?? 'course-valid-token';
  }

  getActiveGeneration(): number {
    return this.activeGeneration;
  }

  getRefreshCallsCount(): number {
    return this.refreshCallsCount;
  }

  isRefreshInFlight(): boolean {
    return this.inFlightRefresh !== null;
  }

  /**
   * Obtiene la cabecera Authorization correspondiente al token activo de sesión.
   * Si no hay token en SecureStore, utiliza el fallback configurable.
   */
  async getAuthorizationHeader(): Promise<string> {
    const token = await this.storage.getSessionToken().catch(() => null);
    const effectiveToken = token && token.trim().length > 0 ? token : this.fallbackToken;
    return `Bearer ${effectiveToken}`;
  }

  /**
   * Coordina la renovación ante un 401 recibido por una solicitud.
   *
   * @param requestGeneration La generación con la que se disparó la solicitud original.
   * Si `requestGeneration < this.activeGeneration`, la sesión ya fue renovada previamente
   * por otra solicitud concurrente, por lo que no se realiza otra llamada a refresh.
   */
  async coordinateRefresh(requestGeneration: number): Promise<RefreshOutcome> {
    // Si la solicitud falló con una generación anterior a la actual,
    // significa que el refresh ya ocurrió mientras esta petición volaba.
    if (requestGeneration < this.activeGeneration) {
      this.logger('session_refresh_coalesced_already_completed', {
        requestGeneration,
        activeGeneration: this.activeGeneration,
      });
      return { ok: true, activeGeneration: this.activeGeneration, coalesced: true };
    }

    // Si ya existe una renovación en vuelo, esperar esa misma promesa (Single-Flight).
    if (this.inFlightRefresh !== null) {
      this.logger('session_refresh_coalesced_in_flight', {
        requestGeneration,
        activeGeneration: this.activeGeneration,
      });
      return this.inFlightRefresh;
    }

    // Si no hay renovación en curso, iniciar la operación compartida.
    this.inFlightRefresh = this.executeSingleFlightRefresh(requestGeneration).finally(() => {
      this.inFlightRefresh = null;
    });

    return this.inFlightRefresh;
  }

  private async executeSingleFlightRefresh(requestGeneration: number): Promise<RefreshOutcome> {
    this.refreshCallsCount += 1;
    this.logger('session_refresh_started', {
      attemptGeneration: requestGeneration,
      totalRefreshCalls: this.refreshCallsCount,
    });

    const refreshToken = await this.storage.getRefreshToken().catch(() => null);
    if (!refreshToken || refreshToken.trim().length === 0) {
      this.logger('session_refresh_failed_no_token', {
        status: 401,
        code: 'missing_refresh_token',
      });
      await this.storage.clearSecureSession().catch(() => {});
      return { ok: false, status: 401, code: 'missing_refresh_token', coalesced: false };
    }

    const outcome = await this.refreshCall(refreshToken);

    if (outcome.ok) {
      this.activeGeneration += 1;
      await this.storage.saveSessionToken(outcome.accessToken);
      if (outcome.refreshToken) {
        await this.storage.saveRefreshToken(outcome.refreshToken);
      }

      this.logger('session_refresh_succeeded', {
        newGeneration: this.activeGeneration,
      });

      return {
        ok: true,
        activeGeneration: this.activeGeneration,
        coalesced: false,
      };
    }

    // Si la renovación falló, se eliminan las credenciales persistidas (logout forzado).
    await this.storage.clearSecureSession().catch(() => {});
    this.logger('session_refresh_failed', {
      status: outcome.status,
      ...(outcome.code ? { code: outcome.code } : {}),
    });

    return {
      ok: false,
      status: outcome.status,
      ...(outcome.code ? { code: outcome.code } : {}),
      coalesced: false,
    };
  }

  /**
   * Cierra la sesión activa limpiando el almacenamiento seguro y reseteando la generación.
   */
  async logout(): Promise<void> {
    await this.storage.clearSecureSession().catch(() => {});
    this.activeGeneration = 0;
    this.logger('session_logout_completed', {
      activeGeneration: 0,
    });
  }
}
