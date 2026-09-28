/**
 * Sanitizador reutilizable (Semana 04 — Seguridad y Privacidad).
 *
 * Puede ser consumido por cualquier capa (presentación, casos de uso o
 * infraestructura). Es puro: nunca muta la entrada y siempre devuelve
 * estructuras nuevas.
 */

export const REDACTED = '[REDACTED]';

/** Claves sensibles YA normalizadas (minúsculas y sin `_` ni `-`). */
export const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  // Autenticación
  'authorization',
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  // Identidad personal
  'email',
  'displayname',
  'name',
  'userid',
  'reporterid',
  // Asignaciones de personal
  'technicianid',
  'assignedtechnicianid',
  'assignmenthistory',
  // Ubicación
  'location',
  'latitude',
  'longitude',
  // Contenido e incidentes
  'photos',
  'evidence',
  'internalcomments',
]);

/** Normaliza una clave: minúsculas y sin separadores `_` / `-`. */
export function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

/** Indica si una clave (en cualquier formato) es sensible. */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(normalizeKey(key));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function sanitizeInner(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') {
    return value; // primitivos (string, number, boolean, undefined, ...)
  }

  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  // Protección contra referencias circulares.
  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map((item) => sanitizeInner(item, seen));
    }

    if (value instanceof Error) {
      // name/message/stack no son enumerables: se copian de forma explícita.
      const out: Record<string, unknown> = {
        name: value.name,
        message: value.message,
      };
      for (const [key, inner] of Object.entries(value)) {
        out[key] = isSensitiveKey(key) ? REDACTED : sanitizeInner(inner, seen);
      }
      // `name` de un Error es el tipo de error (p. ej. "TypeError"), no PII:
      // se conserva a propósito para poder diagnosticar fallas.
      out.name = value.name;
      return out;
    }

    if (isPlainObject(value)) {
      const out: Record<string, unknown> = {};
      for (const [key, inner] of Object.entries(value)) {
        out[key] = isSensitiveKey(key) ? REDACTED : sanitizeInner(inner, seen);
      }
      return out;
    }

    // Instancias de otras clases (Map, Set, etc.): no se vuelcan.
    return `[${value.constructor?.name ?? 'Object'}]`;
  } finally {
    seen.delete(value); // solo detecta ciclos, no objetos repetidos
  }
}

/**
 * Devuelve una copia profunda de `input` donde el valor completo de cada
 * clave sensible se sustituye por "[REDACTED]". No muta la entrada.
 */
export function sanitize(input: unknown): unknown {
  return sanitizeInner(input, new WeakSet<object>());
}
