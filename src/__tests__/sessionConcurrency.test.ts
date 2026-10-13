/**
 * Pruebas de concurrencia de sesión y Single-Flight Mutex — Semana 06.
 * Autor: Fernando (EQ-11)
 *
 * Verifica:
 *  1. Coalescing (Single-Flight): N peticiones concurrentes con 401 disparan exactamente 1 refresh.
 *  2. Prevención de bucles infinitos: máximo 1 reintento por petición cuando el token sigue siendo rechazado.
 *  3. Fallo de refresh: limpia credenciales de almacenamiento seguro y aborta peticiones en espera.
 *  4. Peticiones con generación obsoleta se reintentan inmediatamente sin llamada adicional de refresh.
 *  5. Sanitización de logs: nunca se exponen tokens ni credenciales en la traza técnica.
 */

import { CourseHttpClient, type FetchLike } from '../infrastructure/http/CourseHttpClient';
import {
  SessionCoordinator,
  type SecureStorageAccess,
  type RefreshExecutionResult,
} from '../infrastructure/security/SessionCoordinator';

function fakeResponse(status: number, body: string, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn().mockResolvedValue(body),
    json: jest.fn().mockResolvedValue(body.length > 0 ? JSON.parse(body) : null),
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    } as unknown as Headers,
  } as unknown as Response;
}

function createInMemoryStorage(initialTokens: { sessionToken?: string; refreshToken?: string } = {}): SecureStorageAccess & {
  store: Map<string, string>;
  clearedCount: number;
} {
  const store = new Map<string, string>();
  if (initialTokens.sessionToken) store.set('sessionToken', initialTokens.sessionToken);
  if (initialTokens.refreshToken) store.set('refreshToken', initialTokens.refreshToken);

  let clearedCount = 0;

  return {
    store,
    get clearedCount() {
      return clearedCount;
    },
    async getSessionToken() {
      return store.get('sessionToken') ?? null;
    },
    async getRefreshToken() {
      return store.get('refreshToken') ?? null;
    },
    async saveSessionToken(token: string) {
      store.set('sessionToken', token);
    },
    async saveRefreshToken(token: string) {
      store.set('refreshToken', token);
    },
    async clearSecureSession() {
      clearedCount += 1;
      store.clear();
    },
  };
}

describe('Session Concurrency & Single-Flight Mutex (Semana 06 — Fernando)', () => {
  test('coalesces 3 concurrent 401s into exactly one refresh call and retries all requests', async () => {
    const storage = createInMemoryStorage({
      sessionToken: 'expired-access-token',
      refreshToken: 'valid-refresh-token',
    });

    let refreshEndpointCalls = 0;
    const refreshCall = jest.fn(async (_rt: string): Promise<RefreshExecutionResult> => {
      refreshEndpointCalls += 1;
      // Simular latencia de red para que las 3 peticiones coincidan en vuelo
      await new Promise((resolve) => setTimeout(resolve, 50));
      return {
        ok: true,
        accessToken: 'fresh-valid-token-v2',
        refreshToken: 'fresh-refresh-token-v2',
      };
    });

    const coordinator = new SessionCoordinator({
      storage,
      refreshCall,
    });

    // Mock fetch: responde 401 con 'expired-access-token', pero 200 con 'fresh-valid-token-v2'
    const fetchImpl = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>(async (_url, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const auth = headers.Authorization;

      if (auth === 'Bearer expired-access-token') {
        return fakeResponse(401, '{"code":"unauthorized"}');
      }

      if (auth === 'Bearer fresh-valid-token-v2') {
        return fakeResponse(200, '{"ok":true,"data":"payload"}');
      }

      return fakeResponse(400, '{"code":"unexpected"}');
    });

    const client = new CourseHttpClient({
      baseUrl: 'http://local.test',
      actorId: 'technician-1',
      fetchImpl,
      sessionCoordinator: coordinator,
    });

    // Lanzar 3 peticiones concurrentes con Promise.all
    const [resA, resB, resC] = await Promise.all([
      client.requestJson({ method: 'GET', path: '/v1/incidents/INC-1' }),
      client.requestJson({ method: 'GET', path: '/v1/incidents/INC-2' }),
      client.requestJson({ method: 'GET', path: '/v1/incidents/INC-3' }),
    ]);

    // Las 3 solicitudes deben reintentar y culminar en éxito (200)
    expect(resA).toMatchObject({ ok: true, status: 200, data: { ok: true } });
    expect(resB).toMatchObject({ ok: true, status: 200, data: { ok: true } });
    expect(resC).toMatchObject({ ok: true, status: 200, data: { ok: true } });

    // Verificación central de concurrencia: exactamente 1 llamada al endpoint de refresh
    expect(refreshEndpointCalls).toBe(1);
    expect(refreshCall).toHaveBeenCalledTimes(1);
    expect(coordinator.getRefreshCallsCount()).toBe(1);
    expect(coordinator.getActiveGeneration()).toBe(1);

    // Los tokens actualizados deben estar guardados en almacenamiento seguro
    expect(await storage.getSessionToken()).toBe('fresh-valid-token-v2');
    expect(await storage.getRefreshToken()).toBe('fresh-refresh-token-v2');
  });

  test('prevents infinite loops by bounding retries when the new token also returns 401', async () => {
    const storage = createInMemoryStorage({
      sessionToken: 'bad-token-1',
      refreshToken: 'refresh-token',
    });

    const refreshCall = jest.fn(async (): Promise<RefreshExecutionResult> => ({
      ok: true,
      accessToken: 'still-invalid-token-2',
    }));

    const coordinator = new SessionCoordinator({
      storage,
      refreshCall,
    });

    // Servidor devuelve 401 SIEMPRE, incluso tras refresh
    const fetchImpl = jest.fn().mockResolvedValue(fakeResponse(401, '{"code":"unauthorized"}')) as FetchLike;
    const loggerMock = jest.fn();

    const client = new CourseHttpClient({
      baseUrl: 'http://local.test',
      actorId: 'reporter-1',
      fetchImpl,
      sessionCoordinator: coordinator,
      logger: loggerMock,
      maxRetries: 1,
    });

    const result = await client.requestJson({ method: 'GET', path: '/v1/incidents' });

    // La petición debe terminar en 401 y no ciclarse
    expect(result).toMatchObject({ ok: false, error: { kind: 'http', status: 401 } });

    // Solo se reintentó 1 vez (2 llamadas fetch en total: inicial + 1 reintento)
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    // Se registró la cancelación por límite de reintentos
    expect(loggerMock).toHaveBeenCalledWith(
      'course_http_retry_aborted',
      expect.objectContaining({
        reason: 'max_retries_exceeded',
        attempt: 1,
      }),
    );
  });

  test('clears secure storage and aborts pending requests when refresh fails', async () => {
    const storage = createInMemoryStorage({
      sessionToken: 'expired-access-token',
      refreshToken: 'revoked-refresh-token',
    });

    // El servidor rechaza la renovación con 401 invalid_grant
    const refreshCall = jest.fn(async (): Promise<RefreshExecutionResult> => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return { ok: false, status: 401, code: 'invalid_grant' };
    });

    const coordinator = new SessionCoordinator({
      storage,
      refreshCall,
    });

    const fetchImpl = jest.fn().mockResolvedValue(fakeResponse(401, '{"code":"unauthorized"}')) as FetchLike;

    const client = new CourseHttpClient({
      baseUrl: 'http://local.test',
      actorId: 'coordinator-1',
      fetchImpl,
      sessionCoordinator: coordinator,
    });

    // 2 peticiones concurrentes
    const [resA, resB] = await Promise.all([
      client.requestJson({ method: 'GET', path: '/v1/incidents' }),
      client.requestJson({ method: 'GET', path: '/v1/incidents/campus-inc-001' }),
    ]);

    // Ambas deben recibir error 401
    expect(resA).toMatchObject({ ok: false, error: { kind: 'http', status: 401 } });
    expect(resB).toMatchObject({ ok: false, error: { kind: 'http', status: 401 } });

    // El refresh solo se intentó 1 vez
    expect(refreshCall).toHaveBeenCalledTimes(1);

    // Al fallar el refresh, la sesión se limpia completamente
    expect(storage.clearedCount).toBeGreaterThanOrEqual(1);
    expect(await storage.getSessionToken()).toBeNull();
    expect(await storage.getRefreshToken()).toBeNull();
  });

  test('a request made with an older generation retries immediately without another refresh call', async () => {
    const storage = createInMemoryStorage({
      sessionToken: 'token-v1',
      refreshToken: 'refresh-v1',
    });

    const refreshCall = jest.fn(async (): Promise<RefreshExecutionResult> => ({
      ok: true,
      accessToken: 'token-v2',
    }));

    const coordinator = new SessionCoordinator({
      storage,
      refreshCall,
    });

    // Primera llamada de refresh avanza a generación 1
    const firstOutcome = await coordinator.coordinateRefresh(0);
    expect(firstOutcome).toMatchObject({ ok: true, activeGeneration: 1, coalesced: false });
    expect(coordinator.getRefreshCallsCount()).toBe(1);

    // Una petición que llega tarde reportando fallo con generación 0 (obsoleta)
    const lateOutcome = await coordinator.coordinateRefresh(0);

    // Debe ser coalesced=true y NO incrementar las llamadas a refresh
    expect(lateOutcome).toMatchObject({ ok: true, activeGeneration: 1, coalesced: true });
    expect(coordinator.getRefreshCallsCount()).toBe(1);
    expect(refreshCall).toHaveBeenCalledTimes(1);
  });

  test('explicit logout cleans active session and sets generation to 0', async () => {
    const storage = createInMemoryStorage({
      sessionToken: 'valid-token',
      refreshToken: 'valid-refresh',
    });

    const coordinator = new SessionCoordinator({ storage });
    expect(await storage.getSessionToken()).toBe('valid-token');

    await coordinator.logout();

    expect(storage.clearedCount).toBe(1);
    expect(await storage.getSessionToken()).toBeNull();
    expect(await storage.getRefreshToken()).toBeNull();
    expect(coordinator.getActiveGeneration()).toBe(0);
  });

  test('sanitizes logs and does not leak raw tokens or credentials', async () => {
    const loggerMock = jest.fn();
    const storage = createInMemoryStorage({
      sessionToken: 'secret-token-12345',
      refreshToken: 'secret-refresh-67890',
    });

    const refreshCall = jest.fn(async (): Promise<RefreshExecutionResult> => ({
      ok: true,
      accessToken: 'new-secret-token-99999',
    }));

    const coordinator = new SessionCoordinator({
      storage,
      refreshCall,
      logger: loggerMock,
    });

    await coordinator.coordinateRefresh(0);

    // Revisar todas las llamadas al logger
    for (const call of loggerMock.mock.calls) {
      const serialized = JSON.stringify(call);
      expect(serialized).not.toContain('secret-token-12345');
      expect(serialized).not.toContain('secret-refresh-67890');
      expect(serialized).not.toContain('new-secret-token-99999');
    }
  });
});
