/**
 * Application Use Case: GetIncidencias
 *
 * Orquesta la obtención de incidencias a través del contrato del dominio.
 * No conoce la implementación concreta (memory, API, etc.).
 */

import type { Incidencia } from '../../domain/models/Incidencia';
import type { IIncidenciaRepository } from '../../domain/ports/IIncidenciaRepository';

export class GetIncidencias {
  constructor(private readonly repository: IIncidenciaRepository) {}

  async execute(): Promise<Incidencia[]> {
    return this.repository.getAll();
  }

  async executeById(id: string): Promise<Incidencia | null> {
    return this.repository.getById(id);
  }
}
