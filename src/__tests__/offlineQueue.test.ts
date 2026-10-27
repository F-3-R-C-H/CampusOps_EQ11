import { OFFLINE_QUEUE_KEY, OfflineQueue, OfflineQueueError } from '../infrastructure/persistence/OfflineQueue';
import type { PendingOperation } from '../infrastructure/persistence/OfflineQueue';

const mockStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStore.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => void mockStore.set(key, value)),
    removeItem: jest.fn(async (key: string) => void mockStore.delete(key)),
  },
}));

const startOp: PendingOperation = {
  operationId: 'op-start-001',
  incidentId: 'campus-inc-001',
  actorId: 'technician-1',
  baseVersion: 1,
  action: 'start',
  payload: {},
  createdAt: '2026-10-20T15:00:00.000Z',
};

const commentOp: PendingOperation = {
  operationId: 'op-comment-001',
  incidentId: 'campus-inc-001',
  actorId: 'technician-1',
  baseVersion: 1,
  action: 'comment',
  payload: { text: 'Revisión del tablero eléctrico del sector B' },
  createdAt: '2026-10-20T15:01:00.000Z',
};

const photoOp: PendingOperation = {
  operationId: 'op-photo-001',
  incidentId: 'campus-inc-001',
  actorId: 'technician-1',
  baseVersion: 1,
  action: 'add_evidence',
  // Referencia a un recurso local pendiente de subir; no es una imagen ya cargada.
  payload: { localUri: 'file:///cache/pending/photo-001.jpg' },
  createdAt: '2026-10-20T15:02:00.000Z',
};

/** Simula cerrar y abrir la app: se descarta el módulo, el almacenamiento persiste. */
async function restartApp(): Promise<typeof import('../infrastructure/persistence/OfflineQueue')> {
  jest.resetModules();
  return jest.requireActual('../infrastructure/persistence/OfflineQueue');
}

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
});

describe('OfflineQueue', () => {
  it('enqueue → getAll devuelve la misma operación', async () => {
    await expect(OfflineQueue.enqueue(startOp)).resolves.toBe('enqueued');
    await expect(OfflineQueue.getAll()).resolves.toEqual([startOp]);
  });

  it('no muta la operación recibida', async () => {
    const before = JSON.stringify(startOp);
    await OfflineQueue.enqueue(startOp);
    expect(JSON.stringify(startOp)).toBe(before);
  });

  it('conserva el orden de llegada (FIFO)', async () => {
    await OfflineQueue.enqueue(startOp);
    await OfflineQueue.enqueue(commentOp);
    await OfflineQueue.enqueue(photoOp);
    const ids = (await OfflineQueue.getAll()).map((op) => op.operationId);
    expect(ids).toEqual(['op-start-001', 'op-comment-001', 'op-photo-001']);
  });

  it('un reintento con el mismo operationId y contenido no se agrega dos veces', async () => {
    await OfflineQueue.enqueue(startOp);
    await expect(OfflineQueue.enqueue({ ...startOp })).resolves.toBe('duplicate');
    await expect(OfflineQueue.getAll()).resolves.toEqual([startOp]);
  });

  it('el orden de las claves del payload no cuenta como contenido distinto', async () => {
    const a: PendingOperation = { ...photoOp, payload: { localUri: 'file:///cache/p.jpg', note: 'x' } };
    const b: PendingOperation = { ...photoOp, payload: { note: 'x', localUri: 'file:///cache/p.jpg' } };
    await OfflineQueue.enqueue(a);
    await expect(OfflineQueue.enqueue(b)).resolves.toBe('duplicate');
    await expect(OfflineQueue.getAll()).resolves.toHaveLength(1);
  });

  it('reutilizar un operationId con contenido distinto es error y no altera la cola', async () => {
    await OfflineQueue.enqueue(commentOp);
    const reused = { ...commentOp, payload: { text: 'Otro texto distinto' } };
    await expect(OfflineQueue.enqueue(reused)).rejects.toMatchObject({ code: 'operation_id_reused' });
    await expect(OfflineQueue.getAll()).resolves.toEqual([commentOp]);
  });

  it('rechaza operaciones incompletas', async () => {
    const incomplete = { ...startOp, actorId: '' } as PendingOperation;
    await expect(OfflineQueue.enqueue(incomplete)).rejects.toBeInstanceOf(OfflineQueueError);
    await expect(OfflineQueue.getAll()).resolves.toEqual([]);
  });

  it('remove(operationId) elimina sólo esa operación', async () => {
    await OfflineQueue.enqueue(startOp);
    await OfflineQueue.enqueue(commentOp);
    await OfflineQueue.remove('op-start-001');
    await expect(OfflineQueue.getAll()).resolves.toEqual([commentOp]);
  });

  it('reinicio simulado: la cola conserva identidad y contenido', async () => {
    await OfflineQueue.enqueue(startOp);
    await OfflineQueue.enqueue(commentOp);
    await OfflineQueue.enqueue(photoOp);

    const reopened = await restartApp();
    const recovered = await reopened.OfflineQueue.getAll();

    expect(recovered).toEqual([startOp, commentOp, photoOp]);
    expect(recovered.map((op) => op.operationId)).toEqual(['op-start-001', 'op-comment-001', 'op-photo-001']);
  });

  it('la referencia de foto permanece en la cola hasta que el servidor confirme', async () => {
    await OfflineQueue.enqueue(photoOp);

    // Intento de envío sin confirmación (timeout/error): nadie llama a remove.
    const reopened = await restartApp();
    await expect(reopened.OfflineQueue.getAll()).resolves.toEqual([photoOp]);

    // Confirmación del servidor → ahora sí se retira.
    await reopened.OfflineQueue.remove('op-photo-001');
    await expect(reopened.OfflineQueue.getAll()).resolves.toEqual([]);
  });

  it('un conflicto conserva la operación, ordena los campos y la excluye del envío', async () => {
    await OfflineQueue.enqueue(startOp);
    await OfflineQueue.enqueue(commentOp);

    await expect(OfflineQueue.markConflict('op-start-001', ['work', 'priority'])).resolves.toBe(true);
    await expect(OfflineQueue.markConflict('op-inexistente', ['work'])).resolves.toBe(false);

    const reopened = await restartApp();
    const all = await reopened.OfflineQueue.getAll();
    expect(all).toHaveLength(2);
    expect(all[0]).toMatchObject({ operationId: 'op-start-001', action: 'start', status: 'conflict', conflictFields: ['priority', 'work'] });
    expect((await reopened.OfflineQueue.getSendable()).map((op) => op.operationId)).toEqual(['op-comment-001']);
  });

  it('operaciones simultáneas no se pierden entre sí', async () => {
    const ops = Array.from({ length: 20 }, (_, i) => ({ ...commentOp, operationId: `op-bulk-${i}`, payload: { text: `nota ${i}` } }));
    await Promise.all(ops.map((op) => OfflineQueue.enqueue(op)));
    const stored = await OfflineQueue.getAll();
    expect(stored).toHaveLength(20);
    expect(new Set(stored.map((op) => op.operationId)).size).toBe(20);
  });

  it('una cola corrupta falla de forma explícita y no se sobrescribe', async () => {
    mockStore.set(OFFLINE_QUEUE_KEY, '{ no es json');
    await expect(OfflineQueue.getAll()).rejects.toMatchObject({ code: 'corrupt_queue' });
    await expect(OfflineQueue.enqueue(startOp)).rejects.toMatchObject({ code: 'corrupt_queue' });
    expect(mockStore.get(OFFLINE_QUEUE_KEY)).toBe('{ no es json');
  });

  it('clear() vacía la cola', async () => {
    await OfflineQueue.enqueue(startOp);
    await OfflineQueue.clear();
    await expect(OfflineQueue.getAll()).resolves.toEqual([]);
  });
});
