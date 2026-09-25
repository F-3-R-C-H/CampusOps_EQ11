import type {
  AuthEvent,
  JsonObject,
  ParseResult,
  PermissionEvent,
  RemoteResponse,
  SyncRecord,
} from './contracts';
import type { IncidentLocation } from '../campusops/contracts';

function pending(name: string): never {
  throw new Error(`${name} must be implemented in the assigned week`);
}

/**
 * Semana 4 — Auditoría de seguridad y privacidad.
 *
 * Ocultar un dato en la UI no equivale a protegerlo: si un objeto de
 * sesión, perfil o incidente se envía tal cual a logs/telemetría, un
 * token, un correo o una ubicación quedan expuestos igual.
 *
 * Esta función recorre el objeto recursivamente y sustituye por
 * '[REDACTED]' cualquier campo cuyo nombre corresponda a información
 * sensible, sin alterar el resto del contexto técnico (ids, códigos de
 * error, intentos, etc.) que sí sirve para depurar.
 */
const SENSITIVE_KEYS = new Set([
  'authorization',
  'accesstoken',
  'refreshtoken',
  'token',
  'password',
  'secret',
  'email',
  'displayname',
  'location',
  'photos',
  'photo',
  'internalcomments',
  'phone',
  'phonenumber',
  'address',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => (isPlainObject(item) ? redactObject(item) : item));
  }
  if (isPlainObject(value)) {
    return redactObject(value);
  }
  return value;
}

function redactObject(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    output[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : redactValue(value);
  }
  return output;
}

export function redactForTelemetry(input: unknown): unknown {
  return isPlainObject(input) ? redactObject(input) : input;
}

export function parseRemoteResource(_input: unknown): ParseResult {
  return pending('parseRemoteResource');
}

export function coordinateRefresh(_events: readonly AuthEvent[]): Readonly<{
  status: 'anonymous' | 'authenticated';
  activeGeneration: number | null;
  refreshCalls: number;
  retriedRequestIds: readonly string[];
  persistedToken: string | null;
}> {
  return pending('coordinateRefresh');
}

export function resolveSync(
  _base: SyncRecord,
  _local: SyncRecord,
  _remote: SyncRecord,
): Readonly<{ kind: 'merged'; fields: JsonObject } | { kind: 'conflict'; fields: readonly string[] }> {
  return pending('resolveSync');
}

export function deduplicateOperations<T extends Readonly<{ operationId: string }>>(
  _operations: readonly T[],
): readonly T[] {
  return pending('deduplicateOperations');
}

export function planRetry(_input: Readonly<{
  method: 'GET' | 'POST';
  status: number | 'timeout';
  attempt: number;
  retryAfterMs?: number;
  idempotencyKey?: string;
}>): Readonly<{ retry: boolean; delayMs: number; requiresStableIdempotencyKey: boolean }> {
  return pending('planRetry');
}

export function reduceRemoteResponses(_input: Readonly<{
  activeRequestId: string;
  responses: readonly RemoteResponse[];
}>): Readonly<{ state: 'success' | 'error' | 'loading'; value?: unknown; error?: string }> {
  return pending('reduceRemoteResponses');
}

export function reducePermissionLifecycle(
  _events: readonly PermissionEvent[],
): Readonly<{ status: 'available' | 'denied' | 'blocked'; resourceActive: boolean }> {
  return pending('reducePermissionLifecycle');
}

/** Week 09: see docs/CAMPUSOPS_API.md; this is not a completed solution. */
export function selectIncidentLocation(_provider: unknown, _manualLabel: string): IncidentLocation {
  return pending('selectIncidentLocation');
}
