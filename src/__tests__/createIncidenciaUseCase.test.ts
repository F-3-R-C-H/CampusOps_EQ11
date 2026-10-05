import { CreateIncidencia, holdsIdempotencyKey } from '../application/usecases/CreateIncidencia';
import type { Incidencia } from '../domain/models/Incidencia';
import type {
  CreateIncidentError,
  CreateIncidentResult,
  IIncidenciaRepository,
} from '../domain/ports/IIncidenciaRepository';

const incident: Incidencia = {
  id: 'campus-inc-101',
  version: 1,
  description: 'Fuga simulada',
  category: 'water',
  status: 'open',
  reporterId: 'reporter-1',
  assignedTechnicianId: null,
  location: 'Zona manual ficticia',
  priority: 'medium',
  notes: [],
  evidence: [],
  history: [],
};

const draft = { category: 'water', description: 'Fuga simulada', location: 'Zona manual ficticia' };
const created: CreateIncidentResult = { ok: true, kind: 'created', incident, operationId: 'k' };
const uncertain: CreateIncidentResult = { ok: false, error: { kind: 'uncertain', cause: 'timeout' } };

function setup(create: jest.Mock<Promise<CreateIncidentResult>, [unknown, string]>) {
  const repository: IIncidenciaRepository = {
    getAll: jest.fn(),
    getById: jest.fn(),
    create,
  };
  let counter = 0;
  const generateKey = jest.fn(() => `key-${String(++counter).padStart(8, '0')}`);
  return { useCase: new CreateIncidencia(repository, generateKey), generateKey, create };
}

describe('CreateIncidencia', () => {
  test('rejects invalid input without calling the repository or generating a key', async () => {
    const { useCase, create, generateKey } = setup(jest.fn());
    await expect(useCase.submit({ category: 'x', description: '', location: ' ' })).resolves.toEqual({
      ok: false,
      error: { kind: 'validation', fields: ['category', 'description', 'location'] },
    });
    expect(create).not.toHaveBeenCalled();
    expect(generateKey).not.toHaveBeenCalled();
  });

  test('sends the normalized input with a generated key', async () => {
    const { useCase, create } = setup(jest.fn().mockResolvedValue(created));
    await useCase.submit({ ...draft, description: '  Fuga simulada  ' });
    expect(create).toHaveBeenCalledWith(draft, 'key-00000001');
  });

  test('keeps the same key when retrying the same operation after an uncertain timeout', async () => {
    const { useCase, create, generateKey } = setup(
      jest.fn().mockResolvedValueOnce(uncertain).mockResolvedValueOnce({ ok: true, kind: 'replayed', incident, operationId: 'k' }),
    );
    await expect(useCase.submit(draft)).resolves.toEqual(uncertain);
    expect(useCase.hasPendingOperation).toBe(true);

    await expect(useCase.submit(draft)).resolves.toMatchObject({ ok: true, kind: 'replayed' });
    expect(create.mock.calls.map((call) => call[1])).toEqual(['key-00000001', 'key-00000001']);
    expect(generateKey).toHaveBeenCalledTimes(1);
    expect(useCase.hasPendingOperation).toBe(false);
  });

  test('also treats trimmed-equal content as the same operation', async () => {
    const { useCase, create } = setup(jest.fn().mockResolvedValueOnce(uncertain).mockResolvedValueOnce(created));
    await useCase.submit(draft);
    await useCase.submit({ ...draft, location: ' Zona manual ficticia ' });
    expect(create.mock.calls.map((call) => call[1])).toEqual(['key-00000001', 'key-00000001']);
  });

  test('uses a new key for a different operation', async () => {
    const { useCase, create } = setup(jest.fn().mockResolvedValue(created));
    await useCase.submit(draft);
    await useCase.submit({ ...draft, description: 'Otra fuga' });
    expect(create.mock.calls.map((call) => call[1])).toEqual(['key-00000001', 'key-00000002']);
  });

  test('uses a new key after a successful creation even with identical content', async () => {
    const { useCase, create } = setup(jest.fn().mockResolvedValue(created));
    await useCase.submit(draft);
    await useCase.submit(draft);
    expect(create.mock.calls.map((call) => call[1])).toEqual(['key-00000001', 'key-00000002']);
  });

  test.each<[string, CreateIncidentError]>([
    ['403', { kind: 'http', status: 403, code: 'forbidden' }],
    ['422', { kind: 'http', status: 422, code: 'invalid_incident' }],
    ['400', { kind: 'http', status: 400, code: 'idempotency_key_required' }],
    ['409', { kind: 'idempotency_conflict' }],
  ])('releases the key after a definitive rejection (%s)', async (_label, error) => {
    const { useCase } = setup(jest.fn().mockResolvedValue({ ok: false, error }));
    await expect(useCase.submit(draft)).resolves.toEqual({ ok: false, error });
    expect(useCase.hasPendingOperation).toBe(false);
  });

  test.each<[string, CreateIncidentError]>([
    ['timeout', { kind: 'uncertain', cause: 'timeout' }],
    ['network', { kind: 'uncertain', cause: 'network' }],
    ['invalid_json', { kind: 'uncertain', cause: 'invalid_json' }],
    ['500', { kind: 'http', status: 500, code: 'controlled_failure' }],
    ['invalid creation response', { kind: 'contract', reason: 'creation_envelope' }],
  ])('keeps the key when the outcome is unknown (%s)', async (_label, error) => {
    const { useCase } = setup(jest.fn().mockResolvedValue({ ok: false, error }));
    await useCase.submit(draft);
    expect(useCase.hasPendingOperation).toBe(true);
  });

  test('discardPending makes the next send a new operation', async () => {
    const { useCase, create } = setup(jest.fn().mockResolvedValue(uncertain));
    await useCase.submit(draft);
    useCase.discardPending();
    expect(useCase.hasPendingOperation).toBe(false);
    await useCase.submit(draft);
    expect(create.mock.calls.map((call) => call[1])).toEqual(['key-00000001', 'key-00000002']);
  });

  test('shares one in-flight request between simultaneous identical submissions', async () => {
    let resolve: ((result: CreateIncidentResult) => void) | undefined;
    const { useCase, create } = setup(jest.fn().mockReturnValue(new Promise<CreateIncidentResult>((r) => { resolve = r; })));
    const first = useCase.submit(draft);
    const second = useCase.submit(draft);
    resolve?.(created);
    await expect(first).resolves.toEqual(created);
    await expect(second).resolves.toEqual(created);
    expect(create).toHaveBeenCalledTimes(1);
  });

  test('rejects a different submission while another one is in flight', async () => {
    let resolve: ((result: CreateIncidentResult) => void) | undefined;
    const { useCase, create } = setup(jest.fn().mockReturnValue(new Promise<CreateIncidentResult>((r) => { resolve = r; })));
    const first = useCase.submit(draft);
    await expect(useCase.submit({ ...draft, description: 'Otra' })).resolves.toEqual({ ok: false, error: { kind: 'busy' } });
    resolve?.(created);
    await first;
    expect(create).toHaveBeenCalledTimes(1);
  });

  test('turns an unexpected repository rejection into an uncertain result and keeps the key', async () => {
    const { useCase } = setup(jest.fn().mockRejectedValue(new Error('boom')));
    await expect(useCase.submit(draft)).resolves.toEqual({ ok: false, error: { kind: 'uncertain', cause: 'network' } });
    expect(useCase.hasPendingOperation).toBe(true);
  });
});

describe('holdsIdempotencyKey', () => {
  test.each<[CreateIncidentError, boolean]>([
    [{ kind: 'http', status: 408 }, true],
    [{ kind: 'http', status: 429 }, true],
    [{ kind: 'http', status: 404 }, false],
    [{ kind: 'validation', fields: [] }, false],
    [{ kind: 'busy' }, false],
  ])('%j -> %s', (error, expected) => {
    expect(holdsIdempotencyKey(error)).toBe(expected);
  });
});
