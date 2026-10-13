/**
 * Domain Model: Session
 *
 * Modelo puro de la sesión CampusOps (semana 06). No importa UI, Expo, HTTP
 * ni storage: sólo describe quién inició sesión, con qué perfil y en qué
 * estado del ciclo de vida se encuentra.
 *
 * Regla de seguridad: los tokens viven únicamente en `SessionCredentials`
 * (que se persiste en expo-secure-store). Cualquier vista que vaya a logs,
 * UI o telemetría debe construirse con `toSafeSessionView`, que nunca los copia.
 */

import type { CampusRole } from '../../campusops/contracts';

export type { CampusRole };

/** Perfiles válidos de CampusOps, en el mismo orden que el contrato público. */
export const CAMPUS_ROLES: readonly CampusRole[] = ['reporter', 'technician', 'coordinator'];

/** Ciclo de vida observable de la sesión. */
export type SessionStatus =
  | 'anonymous' // sin sesión o sesión cerrada
  | 'authenticated' // credenciales vigentes
  | 'refreshing'; // renovación coordinada (single-flight) en curso

export type SessionCredentials = Readonly<{
  accessToken: string;
  refreshToken: string;
}>;

export type Session = Readonly<{
  status: SessionStatus;
  /** Identificador sintético del actor (p. ej. `technician-1`). */
  actorId: string | null;
  /** Perfil activo; `null` mientras la sesión es anónima. */
  role: CampusRole | null;
  /** Generación de credenciales activas (se incrementa en cada refresh). */
  generation: number;
  credentials: SessionCredentials | null;
}>;

/** Vista sin secretos, segura para logs y pantallas. */
export type SafeSessionView = Readonly<{
  status: SessionStatus;
  role: CampusRole | null;
  generation: number;
  hasCredentials: boolean;
}>;

export const ANONYMOUS_SESSION: Session = Object.freeze({
  status: 'anonymous',
  actorId: null,
  role: null,
  generation: 0,
  credentials: null,
});

export function isCampusRole(value: unknown): value is CampusRole {
  return typeof value === 'string' && (CAMPUS_ROLES as readonly string[]).includes(value);
}

export type CreateSessionInput = Readonly<{
  actorId: string;
  role: unknown;
  accessToken: string;
  refreshToken: string;
}>;

/**
 * Crea una sesión autenticada. Rechaza perfiles desconocidos y valores vacíos
 * sin incluir el contenido de los tokens en el mensaje de error.
 */
export function createSession(input: CreateSessionInput): Session {
  if (!isCampusRole(input.role)) {
    throw new Error('Perfil de sesión no válido');
  }
  if (input.actorId.trim().length === 0) {
    throw new Error('actorId no puede estar vacío');
  }
  if (input.accessToken.trim().length === 0 || input.refreshToken.trim().length === 0) {
    throw new Error('Las credenciales de sesión no pueden estar vacías');
  }
  return {
    status: 'authenticated',
    actorId: input.actorId,
    role: input.role,
    generation: 0,
    credentials: { accessToken: input.accessToken, refreshToken: input.refreshToken },
  };
}

/** Marca el inicio de una renovación; conserva el perfil para no perder contexto. */
export function beginRefresh(session: Session): Session {
  if (session.status !== 'authenticated') return session;
  return { ...session, status: 'refreshing' };
}

/** Aplica el resultado exitoso de una renovación y sube la generación. */
export function completeRefresh(session: Session, credentials: SessionCredentials): Session {
  if (session.status === 'anonymous') return session;
  return {
    ...session,
    status: 'authenticated',
    generation: session.generation + 1,
    credentials,
  };
}

/** Fallo de renovación o logout: vuelve a anónimo y descarta todo secreto. */
export function endSession(): Session {
  return ANONYMOUS_SESSION;
}

export function toSafeSessionView(session: Session): SafeSessionView {
  return {
    status: session.status,
    role: session.role,
    generation: session.generation,
    hasCredentials: session.credentials !== null,
  };
}
