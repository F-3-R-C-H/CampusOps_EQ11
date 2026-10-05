import type {
  CreateIncidentError,
  CreateIncidentResult,
} from '../../domain/ports/IIncidenciaRepository';
import type { HttpTransportError } from '../http/CourseHttpClient';
import { mapRemoteIncident } from './incidentMapper';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Traduce un error de transporte a un error de creación.
 * timeout / red / JSON ilegible en una escritura son INCIERTOS: el servidor
 * pudo haber confirmado antes de que se perdiera la respuesta.
 */
export function mapCreateTransportError(error: HttpTransportError): CreateIncidentError {
  switch (error.kind) {
    case 'timeout':
      return { kind: 'uncertain', cause: 'timeout' };
    case 'network':
      return { kind: 'uncertain', cause: 'network' };
    case 'invalid_json':
      return { kind: 'uncertain', cause: 'invalid_json' };
    case 'http':
      if (error.status === 409) return { kind: 'idempotency_conflict' };
      return {
        kind: 'http',
        status: error.status,
        ...(error.code !== undefined ? { code: error.code } : {}),
      };
  }
}

/**
 * Valida el sobre de respuesta de `POST /v1/incidents`:
 * `{ incident, operationId, duplicate }` con estado 201 (duplicate false)
 * o 200 (duplicate true). El recurso `incident` pasa por el mismo mapper
 * que las consultas y no puede venir con payload nulo.
 */
export function interpretCreateResponse(
  status: number,
  data: unknown,
  expectedOperationId: string,
): CreateIncidentResult {
  if (status !== 200 && status !== 201) {
    return { ok: false, error: { kind: 'contract', reason: 'unexpected_status' } };
  }
  if (!isObject(data) || !isNonEmptyText(data.operationId) || typeof data.duplicate !== 'boolean') {
    return { ok: false, error: { kind: 'contract', reason: 'creation_envelope' } };
  }
  // 201 sólo es coherente con duplicate:false y 200 sólo con duplicate:true.
  if ((status === 201) === data.duplicate) {
    return { ok: false, error: { kind: 'contract', reason: 'creation_envelope' } };
  }

  const mapped = mapRemoteIncident(data.incident);
  if (!mapped.ok) {
    return { ok: false, error: { kind: 'contract', reason: mapped.reason } };
  }
  if (mapped.kind === 'absent') {
    return { ok: false, error: { kind: 'contract', reason: 'incident_payload' } };
  }
  if (data.operationId !== expectedOperationId) {
    return { ok: false, error: { kind: 'contract', reason: 'operation_mismatch' } };
  }

  return {
    ok: true,
    kind: status === 201 ? 'created' : 'replayed',
    incident: mapped.incident,
    operationId: data.operationId,
  };
}
