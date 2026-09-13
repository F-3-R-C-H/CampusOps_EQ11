/**
 * Infrastructure: IncidenciaMemoryRepo
 *
 * Fake determinista en memoria que implementa el contrato IIncidenciaRepository.
 * Usado en Semana 2 para desarrollo y pruebas sin backend real.
 * En Semana 5 se sustituirá por un adaptador API REST sin tocar UI ni Application.
 */

import type { Incidencia } from '../../domain/models/Incidencia';
import type { IIncidenciaRepository } from '../../domain/ports/IIncidenciaRepository';

const SEED_DATA: Incidencia[] = [
  {
    id: 'INC-001',
    title: 'Fuga de agua en edificio A',
    description: 'Se detectó una fuga de agua en el baño del segundo piso del edificio A. El agua escurre por la pared.',
    category: 'water',
    status: 'open',
    reporterId: 'USR-001',
    assignedTechnicianId: null,
    location: 'Edificio A, Piso 2, Baño',
    createdAt: '2026-09-10T08:30:00Z',
  },
  {
    id: 'INC-002',
    title: 'Falla eléctrica en laboratorio 3',
    description: 'Los contactos del muro norte del laboratorio 3 no suministran corriente. Afecta a 6 estaciones de trabajo.',
    category: 'electrical',
    status: 'assigned',
    reporterId: 'USR-002',
    assignedTechnicianId: 'TEC-001',
    location: 'Laboratorio 3, Muro Norte',
    createdAt: '2026-09-10T09:15:00Z',
  },
  {
    id: 'INC-003',
    title: 'Red WiFi intermitente en biblioteca',
    description: 'La conexión WiFi se pierde cada 5-10 minutos en el área de estudio del primer piso de la biblioteca.',
    category: 'connectivity',
    status: 'in_progress',
    reporterId: 'USR-003',
    assignedTechnicianId: 'TEC-002',
    location: 'Biblioteca, Piso 1, Área de estudio',
    createdAt: '2026-09-09T14:00:00Z',
  },
  {
    id: 'INC-004',
    title: 'Proyector dañado en aula 201',
    description: 'El proyector del aula 201 muestra líneas horizontales y se apaga intermitentemente durante las clases.',
    category: 'equipment',
    status: 'resolved',
    reporterId: 'USR-001',
    assignedTechnicianId: 'TEC-001',
    location: 'Aula 201, Edificio B',
    createdAt: '2026-09-08T11:00:00Z',
  },
  {
    id: 'INC-005',
    title: 'Puerta de emergencia bloqueada',
    description: 'La puerta de emergencia del ala este del edificio C no abre desde adentro. Riesgo de seguridad.',
    category: 'safety',
    status: 'open',
    reporterId: 'USR-004',
    assignedTechnicianId: null,
    location: 'Edificio C, Ala Este, Planta Baja',
    createdAt: '2026-09-11T07:45:00Z',
  },
  {
    id: 'INC-006',
    title: 'Aire acondicionado sin funcionar en sala de cómputo',
    description: 'El sistema de aire acondicionado de la sala de cómputo del edificio D dejó de funcionar. Temperatura excesiva para los equipos.',
    category: 'maintenance',
    status: 'assigned',
    reporterId: 'USR-005',
    assignedTechnicianId: 'TEC-003',
    location: 'Edificio D, Sala de Cómputo',
    createdAt: '2026-09-11T10:30:00Z',
  },
  {
    id: 'INC-007',
    title: 'Microscopio descalibrado en laboratorio de biología',
    description: 'El microscopio óptico #4 del laboratorio de biología muestra imágenes borrosas en todos los aumentos.',
    category: 'laboratory',
    status: 'closed',
    reporterId: 'USR-006',
    assignedTechnicianId: 'TEC-002',
    location: 'Laboratorio de Biología, Mesa 4',
    createdAt: '2026-09-07T16:20:00Z',
  },
];

export class IncidenciaMemoryRepo implements IIncidenciaRepository {
  private readonly data: Incidencia[] = [...SEED_DATA];

  async getAll(): Promise<Incidencia[]> {
    return [...this.data];
  }

  async getById(id: string): Promise<Incidencia | null> {
    return this.data.find((inc) => inc.id === id) ?? null;
  }
}
