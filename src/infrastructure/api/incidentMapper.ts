import type { IncidentCategory, IncidentPriority, IncidentStatus } from '../../campusops/contracts';
import type {
  Incidencia,
  IncidentEvidence,
  IncidentHistoryEntry,
  IncidentNote,
} from '../../domain/models/Incidencia';
import {
  parseRemoteResource,
  type RemoteResource,
} from '../../domain/remote/RemoteResource';

const CATEGORIES = new Set<IncidentCategory>([
  'electrical',
  'laboratory',
  'water',
  'connectivity',
  'equipment',
  'safety',
  'maintenance',
]);
const STATUSES = new Set<IncidentStatus>(['open', 'assigned', 'in_progress', 'resolved', 'closed']);
const PRIORITIES = new Set<IncidentPriority>(['low', 'medium', 'high']);

export type IncidentPayloadDto = Readonly<{
  category: IncidentCategory;
  description: string;
  location: string;
  reporterId: string;
  assignedTechnicianId: string | null;
  priority: IncidentPriority;
  notes: readonly IncidentNote[];
  evidence: readonly IncidentEvidence[];
  history: readonly IncidentHistoryEntry[];
  diagnosis?: string;
}>;

export type IncidentPayloadParseResult =
  | Readonly<{ ok: true; value: IncidentPayloadDto }>
  | Readonly<{ ok: false; error: 'incident_payload' }>;

export type RemoteIncidentMapResult =
  | Readonly<{ ok: true; kind: 'incident'; resource: RemoteResource; incident: Incidencia }>
  | Readonly<{ ok: true; kind: 'absent'; resource: RemoteResource & Readonly<{ payload: null }> }>
  | Readonly<{
      ok: false;
      kind: 'invalid';
      reason: 'resource_contract' | 'incident_status' | 'incident_payload';
    }>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isCategory(value: unknown): value is IncidentCategory {
  return typeof value === 'string' && CATEGORIES.has(value as IncidentCategory);
}

function isPriority(value: unknown): value is IncidentPriority {
  return typeof value === 'string' && PRIORITIES.has(value as IncidentPriority);
}

function parseNotes(value: unknown): readonly IncidentNote[] | null {
  if (!Array.isArray(value)) return null;
  const notes: IncidentNote[] = [];
  for (const item of value) {
    if (!isObject(item) || !isNonEmptyText(item.actorId) || !isNonEmptyText(item.text)) return null;
    notes.push({ actorId: item.actorId, text: item.text });
  }
  return notes;
}

function parseEvidence(value: unknown): readonly IncidentEvidence[] | null {
  if (!Array.isArray(value)) return null;
  const evidence: IncidentEvidence[] = [];
  for (const item of value) {
    if (!isObject(item) || !isNonEmptyText(item.actorId) || !isNonEmptyText(item.evidenceId)) return null;
    evidence.push({ actorId: item.actorId, evidenceId: item.evidenceId });
  }
  return evidence;
}

function parseHistory(value: unknown): readonly IncidentHistoryEntry[] | null {
  if (!Array.isArray(value)) return null;
  const history: IncidentHistoryEntry[] = [];
  for (const item of value) {
    if (
      !isObject(item)
      || !isNonEmptyText(item.operationId)
      || !isNonEmptyText(item.actorId)
      || !isNonEmptyText(item.action)
      || !Number.isInteger(item.version)
      || (item.version as number) < 0
    ) {
      return null;
    }
    history.push({
      operationId: item.operationId,
      actorId: item.actorId,
      action: item.action,
      version: item.version as number,
    });
  }
  return history;
}

/** Validates and projects the incident payload emitted by the teaching backend. */
export function parseIncidentPayload(input: unknown): IncidentPayloadParseResult {
  if (!isObject(input)) return { ok: false, error: 'incident_payload' };

  const notes = parseNotes(input.notes);
  const evidence = parseEvidence(input.evidence);
  const history = parseHistory(input.history);
  if (
    !isCategory(input.category)
    || !isNonEmptyText(input.description)
    || !isNonEmptyText(input.location)
    || !isNonEmptyText(input.reporterId)
    || !(input.assignedTechnicianId === null || isNonEmptyText(input.assignedTechnicianId))
    || !isPriority(input.priority)
    || notes === null
    || evidence === null
    || history === null
    || !(input.diagnosis === undefined || isNonEmptyText(input.diagnosis))
  ) {
    return { ok: false, error: 'incident_payload' };
  }

  return {
    ok: true,
    value: {
      category: input.category,
      description: input.description,
      location: input.location,
      reporterId: input.reporterId,
      assignedTechnicianId: input.assignedTechnicianId,
      priority: input.priority,
      notes,
      evidence,
      history,
      ...(input.diagnosis !== undefined ? { diagnosis: input.diagnosis } : {}),
    },
  };
}

/** Maps an unknown remote value without conflating null payloads with invalid data. */
export function mapRemoteIncident(input: unknown): RemoteIncidentMapResult {
  const parsedResource = parseRemoteResource(input);
  if (!parsedResource.ok) {
    return { ok: false, kind: 'invalid', reason: 'resource_contract' };
  }

  const resource = parsedResource.value;
  if (resource.payload === null) {
    return {
      ok: true,
      kind: 'absent',
      resource: { ...resource, payload: null },
    };
  }
  if (!STATUSES.has(resource.status as IncidentStatus)) {
    return { ok: false, kind: 'invalid', reason: 'incident_status' };
  }

  const parsedPayload = parseIncidentPayload(resource.payload);
  if (!parsedPayload.ok) {
    return { ok: false, kind: 'invalid', reason: 'incident_payload' };
  }

  const payload = parsedPayload.value;
  return {
    ok: true,
    kind: 'incident',
    resource,
    incident: {
      id: resource.id,
      version: resource.version,
      status: resource.status as IncidentStatus,
      category: payload.category,
      description: payload.description,
      location: payload.location,
      reporterId: payload.reporterId,
      assignedTechnicianId: payload.assignedTechnicianId,
      priority: payload.priority,
      notes: payload.notes,
      evidence: payload.evidence,
      history: payload.history,
      ...(payload.diagnosis !== undefined ? { diagnosis: payload.diagnosis } : {}),
    },
  };
}
