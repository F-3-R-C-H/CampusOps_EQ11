/**
 * Domain Port: IIncidenciaRepository
 *
 * Contrato/interfaz que define qué operaciones necesita la aplicación
 * para acceder a incidencias. Las implementaciones concretas viven
 * en infrastructure/, nunca en domain/ ni ui/.
 */

import type { Incidencia } from '../models/Incidencia';

export interface IIncidenciaRepository {
  getAll(): Promise<Incidencia[]>;
  getById(id: string): Promise<Incidencia | null>;
}
