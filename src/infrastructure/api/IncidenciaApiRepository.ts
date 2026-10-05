import type {
  IIncidenciaRepository,
  IncidentDetailResult,
  IncidentListResult,
  IncidentQueryError,
  IncidentResourceMetadata,
} from '../../domain/ports/IIncidenciaRepository';
import { mapRemoteIncident } from './incidentMapper';
import type { HttpRequest, HttpResult } from '../http/CourseHttpClient';

export interface JsonTransport {
  requestJson(request: HttpRequest): Promise<HttpResult>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function metadata(resource: Readonly<{ id: string; version: number; status: string }>): IncidentResourceMetadata {
  return { id: resource.id, version: resource.version, status: resource.status };
}

function transportError(result: Extract<HttpResult, { ok: false }>): IncidentQueryError {
  return result.error;
}

export class IncidenciaApiRepository implements IIncidenciaRepository {
  constructor(private readonly transport: JsonTransport) {}

  async getAll(): Promise<IncidentListResult> {
    const response = await this.transport.requestJson({ method: 'GET', path: '/v1/incidents' });
    if (!response.ok) return { ok: false, error: transportError(response) };
    if (!isObject(response.data) || !Array.isArray(response.data.items)) {
      return { ok: false, error: { kind: 'contract', reason: 'list_container' } };
    }
    if (response.data.items.length === 0) {
      return { ok: true, kind: 'empty', incidents: [], unavailable: [] };
    }

    const incidents = [];
    const unavailable: IncidentResourceMetadata[] = [];
    for (const item of response.data.items) {
      const mapped = mapRemoteIncident(item);
      if (!mapped.ok) {
        return { ok: false, error: { kind: 'contract', reason: mapped.reason } };
      }
      if (mapped.kind === 'absent') unavailable.push(metadata(mapped.resource));
      else incidents.push(mapped.incident);
    }

    if (incidents.length === 0) {
      return { ok: true, kind: 'payload_absent', incidents: [], unavailable };
    }
    return { ok: true, kind: 'data', incidents, unavailable };
  }

  async getById(id: string): Promise<IncidentDetailResult> {
    const response = await this.transport.requestJson({
      method: 'GET',
      path: `/v1/incidents/${encodeURIComponent(id)}`,
    });
    if (!response.ok) return { ok: false, error: transportError(response) };

    const mapped = mapRemoteIncident(response.data);
    if (!mapped.ok) {
      return { ok: false, error: { kind: 'contract', reason: mapped.reason } };
    }
    return mapped.kind === 'absent'
      ? { ok: true, kind: 'payload_absent', resource: metadata(mapped.resource) }
      : { ok: true, kind: 'data', incident: mapped.incident };
  }
}
