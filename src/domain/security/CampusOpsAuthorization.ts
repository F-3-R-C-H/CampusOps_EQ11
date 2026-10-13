/**
 * Autorización por perfil de CampusOps (semana 06).
 *
 * Fuente de verdad: docs/CAMPUSOPS.md (sección "Perfiles"), reflejada por el
 * backend didáctico (course-backend/campusops.mjs). Esta capa sirve para
 * decidir en el cliente qué se puede intentar, pero NO sustituye al servicio:
 * ocultar un botón no es una medida de seguridad y el servidor responde 403.
 *
 * Dominio puro: sin UI, Expo, HTTP ni storage.
 */

import type { CampusRole } from '../models/Session';
import { isCampusRole } from '../models/Session';

export type CampusAction =
  | 'create' // crear una incidencia
  | 'comment' // agregar nota
  | 'add_evidence' // agregar evidencia
  | 'start' // iniciar atención
  | 'resolve' // marcar resuelta
  | 'assign' // asignar/reasignar técnico
  | 'prioritize' // cambiar prioridad
  | 'close' // cerrar una resolución
  | 'reopen'; // reabrir un caso resuelto/cerrado

export const CAMPUS_ACTIONS: readonly CampusAction[] = [
  'create',
  'comment',
  'add_evidence',
  'start',
  'resolve',
  'assign',
  'prioritize',
  'close',
  'reopen',
];

/** Matriz estática perfil → acciones permitidas. */
export const ROLE_PERMISSIONS: Readonly<Record<CampusRole, readonly CampusAction[]>> = {
  reporter: ['create', 'comment', 'add_evidence'],
  technician: ['comment', 'add_evidence', 'start', 'resolve'],
  coordinator: ['comment', 'add_evidence', 'assign', 'prioritize', 'close', 'reopen'],
};

export function isCampusAction(value: unknown): value is CampusAction {
  return typeof value === 'string' && (CAMPUS_ACTIONS as readonly string[]).includes(value);
}

/**
 * ¿Puede este perfil realizar la acción? Cualquier valor desconocido
 * (rol o acción) se niega: política "deny by default".
 */
export function canPerformAction(role: unknown, action: unknown): boolean {
  if (!isCampusRole(role) || !isCampusAction(action)) return false;
  return ROLE_PERMISSIONS[role].includes(action);
}

/** Datos mínimos de una incidencia para decidir permisos por propiedad. */
export type IncidentAccessTarget = Readonly<{
  reporterId: string;
  assignedTechnicianId: string | null;
}>;

export type Actor = Readonly<{ actorId: string; role: CampusRole }>;

/** Misma regla de visibilidad que el servicio didáctico. */
export function canViewIncident(actor: Actor, incident: IncidentAccessTarget): boolean {
  switch (actor.role) {
    case 'coordinator':
      return true;
    case 'reporter':
      return incident.reporterId === actor.actorId;
    case 'technician':
      return incident.assignedTechnicianId === actor.actorId;
  }
}

/**
 * Autorización completa sobre una incidencia concreta: el perfil debe poder
 * hacer la acción y, salvo `create`/acciones de coordinación, el actor debe
 * ver la incidencia (un técnico no modifica una incidencia reasignada a otra
 * persona).
 */
export function canActOnIncident(
  actor: Actor,
  action: unknown,
  incident?: IncidentAccessTarget,
): boolean {
  if (!canPerformAction(actor.role, action)) return false;
  if (action === 'create') return true;
  if (actor.role === 'coordinator') return true;
  return incident !== undefined && canViewIncident(actor, incident);
}

export const FORBIDDEN_STATUS = 403 as const;

export type AuthorizationResult =
  | Readonly<{ allowed: true }>
  | Readonly<{ allowed: false; status: typeof FORBIDDEN_STATUS; code: 'forbidden' }>;

/** Versión que devuelve el resultado con el código HTTP que usaría el servicio. */
export function authorizeAction(
  actor: Actor,
  action: unknown,
  incident?: IncidentAccessTarget,
): AuthorizationResult {
  return canActOnIncident(actor, action, incident)
    ? { allowed: true }
    : { allowed: false, status: FORBIDDEN_STATUS, code: 'forbidden' };
}

/** Error de acceso denegado. El mensaje es fijo: no filtra rol, id ni tokens. */
export class AccessDeniedError extends Error {
  readonly status = FORBIDDEN_STATUS;
  readonly code = 'forbidden' as const;

  constructor() {
    super('Acceso denegado');
    this.name = 'AccessDeniedError';
  }
}

/** Lanza `AccessDeniedError` (403) si el actor no está autorizado. */
export function assertCanActOnIncident(
  actor: Actor,
  action: unknown,
  incident?: IncidentAccessTarget,
): void {
  if (!canActOnIncident(actor, action, incident)) {
    throw new AccessDeniedError();
  }
}
