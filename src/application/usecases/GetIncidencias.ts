/**
 * Application Use Case: GetIncidencias
 *
 * Orquesta la obtención de incidencias a través del contrato del dominio.
 * No conoce la implementación concreta (memory, API, etc.).
 */

import type {
  IIncidenciaRepository,
  IncidentDetailResult,
  IncidentListResult,
} from '../../domain/ports/IIncidenciaRepository';

export class GetIncidencias {
  constructor(private readonly repository: IIncidenciaRepository) {}

  async execute(): Promise<IncidentListResult> {
    return this.repository.getAll();
  }

  async executeById(id: string): Promise<IncidentDetailResult> {
    return this.repository.getById(id);
  }
}
