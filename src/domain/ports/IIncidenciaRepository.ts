/**
 * Domain Port: IIncidenciaRepository
 *
 * Contrato/interfaz que define qué operaciones necesita la aplicación
 * para acceder a incidencias. Las implementaciones concretas viven
 * en infrastructure/, nunca en domain/ ni ui/.
 */

import type { Incidencia } from '../models/Incidencia';
import type { NewIncidentField, NewIncidentInput } from '../models/NewIncident';

export type IncidentResourceMetadata = Readonly<{
  id: string;
  version: number;
  status: string;
}>;

export type IncidentQueryError =
  | Readonly<{ kind: 'timeout' }>
  | Readonly<{ kind: 'network' }>
  | Readonly<{ kind: 'invalid_json' }>
  | Readonly<{ kind: 'http'; status: number; code?: string }>
  | Readonly<{ kind: 'contract'; reason: 'list_container' | 'resource_contract' | 'incident_status' | 'incident_payload' }>;

export type IncidentListResult =
  | Readonly<{ ok: true; kind: 'data'; incidents: readonly Incidencia[]; unavailable: readonly IncidentResourceMetadata[] }>
  | Readonly<{ ok: true; kind: 'empty'; incidents: readonly []; unavailable: readonly [] }>
  | Readonly<{ ok: true; kind: 'payload_absent'; incidents: readonly []; unavailable: readonly IncidentResourceMetadata[] }>
  | Readonly<{ ok: false; error: IncidentQueryError }>;

export type IncidentDetailResult =
  | Readonly<{ ok: true; kind: 'data'; incident: Incidencia }>
  | Readonly<{ ok: true; kind: 'payload_absent'; resource: IncidentResourceMetadata }>
  | Readonly<{ ok: false; error: IncidentQueryError }>;

/**
 * Errores de creación. `uncertain` significa que el resultado NO se conoce
 * (timeout, red o respuesta ilegible): el servidor pudo haber guardado la
 * incidencia, así que no equivale a un rechazo.
 */
export type CreateIncidentContractReason =
  | 'creation_envelope'
  | 'operation_mismatch'
  | 'unexpected_status'
  | 'resource_contract'
  | 'incident_status'
  | 'incident_payload';

export type CreateIncidentError =
  | Readonly<{ kind: 'validation'; fields: readonly NewIncidentField[] }>
  | Readonly<{ kind: 'busy' }>
  | Readonly<{ kind: 'uncertain'; cause: 'timeout' | 'network' | 'invalid_json' }>
  | Readonly<{ kind: 'idempotency_conflict' }>
  | Readonly<{ kind: 'http'; status: number; code?: string }>
  | Readonly<{ kind: 'contract'; reason: CreateIncidentContractReason }>;

export type CreateIncidentResult =
  | Readonly<{
      ok: true;
      /** `created` = 201 (primera ejecución); `replayed` = 200 (misma clave y contenido). */
      kind: 'created' | 'replayed';
      incident: Incidencia;
      operationId: string;
    }>
  | Readonly<{ ok: false; error: CreateIncidentError }>;

export interface IIncidenciaRepository {
  getAll(): Promise<IncidentListResult>;
  getById(id: string): Promise<IncidentDetailResult>;
  /**
   * Crea una incidencia. `idempotencyKey` la decide el caso de uso y se
   * conserva entre reintentos de la misma operación; el repositorio nunca
   * la sustituye.
   */
  create(input: NewIncidentInput, idempotencyKey: string): Promise<CreateIncidentResult>;
}
