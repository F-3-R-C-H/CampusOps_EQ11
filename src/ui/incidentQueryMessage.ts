import type { IncidentQueryError } from '../domain/ports/IIncidenciaRepository';

export function incidentQueryMessage(error: IncidentQueryError): string {
  switch (error.kind) {
    case 'timeout':
      return 'La consulta tardó demasiado. Intenta nuevamente.';
    case 'network':
      return 'No fue posible conectar con el backend.';
    case 'invalid_json':
    case 'contract':
      return 'El backend devolvió datos no válidos.';
    case 'http':
      if (error.status === 403) return 'No tienes acceso a esta incidencia.';
      if (error.status === 404) return 'Incidencia no encontrada.';
      return `El backend respondió con error (${error.status}).`;
  }
}
