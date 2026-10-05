/**
 * Domain Port: IIncidenciaRepository
 *
 * Contrato/interfaz que define qué operaciones necesita la aplicación
 * para acceder a incidencias. Las implementaciones concretas viven
 * en infrastructure/, nunca en domain/ ni ui/.
 */

import type { Incidencia } from '../models/Incidencia';

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

export interface IIncidenciaRepository {
  getAll(): Promise<IncidentListResult>;
  getById(id: string): Promise<IncidentDetailResult>;
}
