/**
 * Domain Model: NewIncident
 *
 * Entrada de creación de una incidencia (categoría, descripción y ubicación)
 * y su validación previa al envío. Es lógica pura: no importa UI, HTTP ni
 * storage. El servidor sigue validando como frontera adicional.
 */

import type { IncidentCategory } from '../../campusops/contracts';

export const INCIDENT_CATEGORIES: readonly IncidentCategory[] = [
  'electrical',
  'laboratory',
  'water',
  'connectivity',
  'equipment',
  'safety',
  'maintenance',
];

/** Entrada ya validada y normalizada: es lo único que se envía al backend. */
export type NewIncidentInput = Readonly<{
  category: IncidentCategory;
  description: string;
  location: string;
}>;

export type NewIncidentField = 'category' | 'description' | 'location';
export type NewIncidentFieldError = 'required' | 'invalid_category';

export type NewIncidentValidation =
  | Readonly<{ ok: true; value: NewIncidentInput }>
  | Readonly<{ ok: false; errors: Readonly<Partial<Record<NewIncidentField, NewIncidentFieldError>>> }>;

function isCategory(value: unknown): value is IncidentCategory {
  return typeof value === 'string' && (INCIDENT_CATEGORIES as readonly string[]).includes(value);
}

function nonEmptyText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Valida un borrador del formulario. Recibe `unknown` por campo porque viene
 * de la interfaz; los textos se recortan para que "  agua  " y "agua" sean
 * la misma operación.
 */
export function validateNewIncident(
  draft: Readonly<{ category: unknown; description: unknown; location: unknown }>,
): NewIncidentValidation {
  const errors: { category?: NewIncidentFieldError; description?: NewIncidentFieldError; location?: NewIncidentFieldError } = {};

  if (draft.category === undefined || draft.category === null || draft.category === '') {
    errors.category = 'required';
  } else if (!isCategory(draft.category)) {
    errors.category = 'invalid_category';
  }

  const description = nonEmptyText(draft.description);
  if (description === null) errors.description = 'required';

  const location = nonEmptyText(draft.location);
  if (location === null) errors.location = 'required';

  if (errors.category !== undefined || description === null || location === null) {
    return { ok: false, errors };
  }
  // isCategory ya se comprobó arriba: no hay error de categoría en este punto.
  return {
    ok: true,
    value: { category: draft.category as IncidentCategory, description, location },
  };
}
