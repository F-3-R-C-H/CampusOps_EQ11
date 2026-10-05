/**
 * Domain Model: Incidencia
 *
 * Entidad pura del dominio. No importa UI, Expo, HTTP ni storage.
 * Define la estructura de una incidencia del campus.
 */

import type { IncidentStatus, IncidentCategory, IncidentPriority } from '../../campusops/contracts';

export interface IncidentNote {
  readonly actorId: string;
  readonly text: string;
}

export interface IncidentEvidence {
  readonly actorId: string;
  readonly evidenceId: string;
}

export interface IncidentHistoryEntry {
  readonly operationId: string;
  readonly actorId: string;
  readonly action: string;
  readonly version: number;
}

export interface Incidencia {
  readonly id: string;
  readonly version: number;
  readonly description: string;
  readonly category: IncidentCategory;
  readonly status: IncidentStatus;
  readonly reporterId: string;
  readonly assignedTechnicianId: string | null;
  readonly location: string;
  readonly priority: IncidentPriority;
  readonly notes: readonly IncidentNote[];
  readonly evidence: readonly IncidentEvidence[];
  readonly history: readonly IncidentHistoryEntry[];
  readonly diagnosis?: string;

  /** Optional metadata from local sources; the remote mapper never invents it. */
  readonly title?: string;
  readonly createdAt?: string;
}
