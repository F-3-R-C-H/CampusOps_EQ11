/**
 * Cola persistente de operaciones pendientes de CampusOps (semana 8).
 *
 * - Se guarda en AsyncStorage (no sólo en memoria): sobrevive al reinicio de la app.
 * - Cada operación conserva su `operationId` estable, incidencia, autor,
 *   versión base y contenido. Un reintento NUNCA cambia el `operationId`.
 * - Sólo se retira una operación con `remove`, y únicamente cuando el servidor
 *   confirmó (200/201). Un error, un timeout o un conflicto la dejan en la cola.
 * - No escribe en logs: el payload puede contener referencias a fotos y notas.
 *
 * Formato en disco: arreglo JSON bajo `campusops:offline_queue` (mismo que
 * documenta `docs/data-model.md`, compatible con el snapshot de MigrationManager).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PendingIncidentOperation } from '../../campusops/contracts';

export const OFFLINE_QUEUE_KEY = 'campusops:offline_queue';

export type PendingOperationStatus = 'pending' | 'conflict';

export type PendingOperation = PendingIncidentOperation &
  Readonly<{
    /** ISO 8601, asignado al crear la operación; no cambia en reintentos. */
    createdAt: string;
    /** Ausente = 'pending'. 'conflict' bloquea el envío hasta resolución. */
    status?: PendingOperationStatus;
    /** Campos en conflicto (orden alfabético) cuando status = 'conflict'. */
    conflictFields?: readonly string[];
  }>;

export type EnqueueResult = 'enqueued' | 'duplicate';

export type OfflineQueueErrorCode = 'corrupt_queue' | 'operation_id_reused' | 'invalid_operation';

export class OfflineQueueError extends Error {
  readonly code: OfflineQueueErrorCode;

  constructor(code: OfflineQueueErrorCode, message: string) {
    super(message);
    this.name = 'OfflineQueueError';
    this.code = code;
  }
}

/* ---------- utilidades internas ---------- */

function canonicalJson(value: unknown): string {
  if (value === undefined) return '__undefined__';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const obj = value as Record<string, unknown>;
  return (
    '{' +
    Object.keys(obj)
      .sort()
      .map((key) => JSON.stringify(key) + ':' + canonicalJson(obj[key]))
      .join(',') +
    '}'
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isOperation(value: unknown): value is PendingOperation {
  if (value === null || typeof value !== 'object') return false;
  const op = value as Record<string, unknown>;
  return (
    isNonEmptyString(op.operationId) &&
    isNonEmptyString(op.incidentId) &&
    isNonEmptyString(op.actorId) &&
    isNonEmptyString(op.action) &&
    isNonEmptyString(op.createdAt) &&
    typeof op.baseVersion === 'number' &&
    Number.isInteger(op.baseVersion) &&
    op.baseVersion >= 0 &&
    op.payload !== null &&
    typeof op.payload === 'object' &&
    !Array.isArray(op.payload)
  );
}

/** Contenido que define la identidad de una operación (excluye metadatos de estado). */
function identityOf(op: PendingOperation): string {
  return canonicalJson({
    operationId: op.operationId,
    incidentId: op.incidentId,
    actorId: op.actorId,
    baseVersion: op.baseVersion,
    action: op.action,
    payload: op.payload,
  });
}

/* ---------- acceso serializado al almacenamiento ---------- */

// Todas las operaciones leen-modifican-escriben; se encadenan para que dos
// llamadas simultáneas no se pisen y pierdan una operación.
let lock: Promise<unknown> = Promise.resolve();

function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = lock.then(task);
  lock = run.catch(() => undefined);
  return run;
}

async function readQueue(): Promise<PendingOperation[]> {
  const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new OfflineQueueError('corrupt_queue', 'La cola guardada no es JSON válido; no se sobrescribe.');
  }
  if (!Array.isArray(parsed) || !parsed.every(isOperation)) {
    throw new OfflineQueueError('corrupt_queue', 'La cola guardada tiene un formato inválido; no se sobrescribe.');
  }
  return parsed;
}

async function writeQueue(queue: readonly PendingOperation[]): Promise<void> {
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

/* ---------- API pública ---------- */

export const OfflineQueue = {
  /**
   * Agrega una operación al final (orden FIFO).
   * - Mismo `operationId` y mismo contenido (reintento) → 'duplicate', no se agrega dos veces.
   * - Mismo `operationId` con contenido distinto → error (el servidor respondería 409).
   */
  enqueue(op: PendingOperation): Promise<EnqueueResult> {
    return exclusive(async () => {
      if (!isOperation(op)) {
        throw new OfflineQueueError('invalid_operation', 'Operación incompleta: falta identidad, autor, versión base o contenido.');
      }
      const queue = await readQueue();
      const existing = queue.find((item) => item.operationId === op.operationId);
      if (existing) {
        if (identityOf(existing) !== identityOf(op)) {
          throw new OfflineQueueError('operation_id_reused', 'El operationId ya existe con contenido distinto.');
        }
        return 'duplicate';
      }
      await writeQueue([...queue, op]);
      return 'enqueued';
    });
  },

  /** Todas las operaciones, en orden de llegada (incluye las marcadas en conflicto). */
  getAll(): Promise<PendingOperation[]> {
    return exclusive(readQueue);
  },

  /** Operaciones listas para enviar (excluye las que esperan resolución de conflicto). */
  getSendable(): Promise<PendingOperation[]> {
    return exclusive(async () => (await readQueue()).filter((op) => op.status !== 'conflict'));
  },

  /**
   * Marca una operación como conflictiva SIN descartarla: se conserva la intención
   * local hasta que alguien con autorización resuelva. Devuelve false si no existe.
   */
  markConflict(operationId: string, fields: readonly string[]): Promise<boolean> {
    return exclusive(async () => {
      const queue = await readQueue();
      if (!queue.some((op) => op.operationId === operationId)) return false;
      const conflictFields = [...fields].sort();
      await writeQueue(
        queue.map((op) => (op.operationId === operationId ? { ...op, status: 'conflict' as const, conflictFields } : op)),
      );
      return true;
    });
  },

  /**
   * Retira UNA operación. Llamar sólo tras confirmación del servidor (200/201).
   * Un error, timeout o conflicto NO justifican llamar a este método.
   */
  remove(operationId: string): Promise<void> {
    return exclusive(async () => {
      const queue = await readQueue();
      await writeQueue(queue.filter((op) => op.operationId !== operationId));
    });
  },

  /** Vacía la cola (uso de pruebas y cierre de sesión explícito). */
  clear(): Promise<void> {
    return exclusive(() => AsyncStorage.removeItem(OFFLINE_QUEUE_KEY));
  },
};
