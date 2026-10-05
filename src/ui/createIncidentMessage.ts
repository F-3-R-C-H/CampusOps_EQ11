import type { CreateIncidentError } from '../domain/ports/IIncidenciaRepository';

/** Mensajes de presentación; no forman parte del DTO ni vienen del servidor. */
export function createIncidentMessage(error: CreateIncidentError): string {
  switch (error.kind) {
    case 'validation':
      return 'Revisa los campos marcados antes de enviar.';
    case 'busy':
      return 'Ya hay un envío en curso.';
    case 'uncertain':
      return 'No pudimos confirmar si la incidencia se creó. Reintenta el envío: se usará la misma operación y no se duplicará.';
    case 'idempotency_conflict':
      return 'Esta operación ya se registró con otro contenido. Descarta el envío y crea una nueva incidencia.';
    case 'contract':
      return 'El backend devolvió una respuesta no válida. Reintenta el envío para confirmar el resultado.';
    case 'http':
      if (error.status === 403) return 'Tu perfil no puede crear incidencias.';
      if (error.status === 422) return 'El backend rechazó los datos de la incidencia.';
      if (error.status === 400) return 'No se pudo identificar la operación de envío.';
      if (error.status >= 500) return `El backend respondió con error (${error.status}). Puedes reintentar el envío.`;
      return `El backend respondió con error (${error.status}).`;
  }
}
