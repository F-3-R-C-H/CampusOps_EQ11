/**
 * Domain Model: Incidencia
 *
 * Entidad pura del dominio. No importa UI, Expo, HTTP ni storage.
 * Define la estructura de una incidencia del campus.
 */

import type { IncidentStatus, IncidentCategory } from '../../campusops/contracts';

export interface Incidencia {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: IncidentCategory;
  readonly status: IncidentStatus;
  readonly reporterId: string;
  readonly assignedTechnicianId: string | null;
  readonly location: string;
  readonly createdAt: string;
}
