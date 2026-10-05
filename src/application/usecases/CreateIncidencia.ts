/**
 * Application Use Case: CreateIncidencia
 *
 * Orquesta la creación de una incidencia y decide el ciclo de vida de la
 * clave de idempotencia:
 *
 *  - una operación NUEVA (contenido distinto) genera una clave nueva;
 *  - reintentar la MISMA operación (mismo contenido) conserva la clave
 *    mientras el resultado siga incierto (timeout, red, 5xx, respuesta
 *    inválida), de modo que el servidor responda con un replay y no duplique;
 *  - la clave se descarta cuando hay resultado definitivo: éxito (201/200) o
 *    rechazo del servidor (400/403/422/409...), donde nada se confirmó.
 *
 * Un timeout NO confirma que el servidor rechazara la creación: puede haber
 * guardado la incidencia y perdido la respuesta. Por eso no se libera la clave.
 *
 * La clave vive en memoria durante el ciclo de reintento; no se persiste tras
 * reiniciar la app (no es un requisito confirmado por los materiales).
 */

import { validateNewIncident, type NewIncidentField, type NewIncidentInput } from '../../domain/models/NewIncident';
import type {
  CreateIncidentError,
  CreateIncidentResult,
  IIncidenciaRepository,
} from '../../domain/ports/IIncidenciaRepository';

export type IdempotencyKeyGenerator = () => string;

/** Clave de al menos 8 caracteres (mínimo del backend), única por operación. */
export function defaultIdempotencyKey(): string {
  const random = Math.random().toString(36).slice(2, 12).padEnd(6, '0');
  return `inc-${Date.now().toString(36)}-${random}`;
}

/**
 * true cuando el resultado de la operación sigue sin conocerse o pudo haberse
 * confirmado en el servidor: se debe reintentar con la MISMA clave.
 */
export function holdsIdempotencyKey(error: CreateIncidentError): boolean {
  switch (error.kind) {
    case 'uncertain':
    case 'contract':
      return true;
    case 'http':
      return error.status >= 500 || error.status === 408 || error.status === 429;
    case 'validation':
    case 'busy':
    case 'idempotency_conflict':
      return false;
  }
}

type PendingOperation = Readonly<{ key: string; fingerprint: string }>;
type InFlight = Readonly<{ fingerprint: string; promise: Promise<CreateIncidentResult> }>;

function fingerprintOf(input: NewIncidentInput): string {
  return JSON.stringify([input.category, input.description, input.location]);
}

export class CreateIncidencia {
  private readonly repository: IIncidenciaRepository;
  private readonly generateKey: IdempotencyKeyGenerator;
  private pending: PendingOperation | null = null;
  private inFlight: InFlight | null = null;

  constructor(repository: IIncidenciaRepository, generateKey: IdempotencyKeyGenerator = defaultIdempotencyKey) {
    this.repository = repository;
    this.generateKey = generateKey;
  }

  /** true si hay una operación con resultado incierto que conviene reintentar tal cual. */
  get hasPendingOperation(): boolean {
    return this.pending !== null;
  }

  /** Abandona la operación incierta: el próximo envío será una operación nueva. */
  discardPending(): void {
    if (this.inFlight === null) this.pending = null;
  }

  submit(draft: Readonly<{ category: unknown; description: unknown; location: unknown }>): Promise<CreateIncidentResult> {
    const validation = validateNewIncident(draft);
    if (!validation.ok) {
      const fields = Object.keys(validation.errors) as NewIncidentField[];
      return Promise.resolve({ ok: false, error: { kind: 'validation', fields } });
    }

    const input = validation.value;
    const fingerprint = fingerprintOf(input);

    // Envío simultáneo: la misma operación comparte el resultado en curso;
    // una distinta se rechaza para no mezclar claves.
    if (this.inFlight !== null) {
      return this.inFlight.fingerprint === fingerprint
        ? this.inFlight.promise
        : Promise.resolve({ ok: false, error: { kind: 'busy' } });
    }

    if (this.pending === null || this.pending.fingerprint !== fingerprint) {
      this.pending = { key: this.generateKey(), fingerprint };
    }

    const promise = this.run(input, this.pending).finally(() => {
      this.inFlight = null;
    });
    this.inFlight = { fingerprint, promise };
    return promise;
  }

  private async run(input: NewIncidentInput, operation: PendingOperation): Promise<CreateIncidentResult> {
    let result: CreateIncidentResult;
    try {
      result = await this.repository.create(input, operation.key);
    } catch {
      // Un repositorio no debería rechazar; si lo hace, el resultado es incierto.
      result = { ok: false, error: { kind: 'uncertain', cause: 'network' } };
    }
    if (result.ok || !holdsIdempotencyKey(result.error)) this.pending = null;
    return result;
  }
}
