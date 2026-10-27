import type {
  AuthEvent,
  JsonObject,
  ParseResult,
  PermissionEvent,
  RemoteResponse,
  SyncRecord,
} from './contracts';
import type { IncidentLocation } from '../campusops/contracts';
import { summarizeSessionEvents } from '../application/session/sessionStateMachine';
import { parseRemoteResource as parseRemoteResourceContract } from '../domain/remote/RemoteResource';

function pending(name: string): never {
  throw new Error(`${name} must be implemented in the assigned week`);
}

const REDACTED = '[REDACTED]';

const SENSITIVE_KEYS = new Set<string>([
  'authorization',
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'email',
  'displayname',
  'name',
  'userid',
  'reporterid',
  'technicianid',
  'assignedtechnicianid',
  'location',
  'latitude',
  'longitude',
  'photos',
  'evidence',
  'internalcomments',
  'assignmenthistory',
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = SENSITIVE_KEYS.has(normalizeKey(key)) ? REDACTED : redactValue(item);
  }
  return result;
}

export function redactForTelemetry(input: unknown): unknown {
  return redactValue(input);
}

export function parseRemoteResource(input: unknown): ParseResult {
  return parseRemoteResourceContract(input);
}

export function coordinateRefresh(events: readonly AuthEvent[]): Readonly<{
  status: 'anonymous' | 'authenticated';
  activeGeneration: number | null;
  refreshCalls: number;
  retriedRequestIds: readonly string[];
  persistedToken: string | null;
}> {
  return summarizeSessionEvents(events);
}

function canonicalJson(val: unknown): string {
  if (val === undefined) return '__undefined__';
  if (val === null || typeof val !== 'object') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return '[' + val.map(canonicalJson).join(',') + ']';
  }
  const obj = val as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
}

export function resolveSync(
  base: SyncRecord,
  local: SyncRecord,
  remote: SyncRecord,
): Readonly<{ kind: 'merged'; fields: JsonObject } | { kind: 'conflict'; fields: readonly string[] }> {
  const conflictFields: string[] = [];
  const merged: Record<string, unknown> = {};

  const allKeys = new Set([
    ...Object.keys(base.fields ?? {}),
    ...Object.keys(local.fields ?? {}),
    ...Object.keys(remote.fields ?? {}),
  ]);

  for (const key of Array.from(allKeys).sort()) {
    const baseVal = (base.fields as JsonObject)[key];
    const localVal = (local.fields as JsonObject)[key];
    const remoteVal = (remote.fields as JsonObject)[key];

    const localChanged = canonicalJson(localVal) !== canonicalJson(baseVal);
    const remoteChanged = canonicalJson(remoteVal) !== canonicalJson(baseVal);

    if (localChanged && remoteChanged) {
      if (canonicalJson(localVal) !== canonicalJson(remoteVal)) {
        conflictFields.push(key);
      } else if (localVal !== undefined) {
        merged[key] = localVal;
      }
    } else if (localChanged) {
      if (localVal !== undefined) {
        merged[key] = localVal;
      }
    } else if (remoteVal !== undefined) {
      merged[key] = remoteVal;
    }
  }

  if (conflictFields.length > 0) {
    return { kind: 'conflict', fields: conflictFields };
  }
  return { kind: 'merged', fields: merged };
}

export function deduplicateOperations<T extends Readonly<{ operationId: string }>>(
  _operations: readonly T[],
): readonly T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const op of _operations) {
    if (!seen.has(op.operationId)) {
      seen.add(op.operationId);
      result.push(op);
    }
  }
  return result;
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
