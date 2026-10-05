import { IncidenciaApiRepository, type JsonTransport } from '../infrastructure/api/IncidenciaApiRepository';
import type { HttpResult } from '../infrastructure/http/CourseHttpClient';

const input = { category: 'water', description: 'Fuga simulada', location: 'Zona manual ficticia' } as const;
const KEY = 'create-key-0001';

const payload = {
  category: 'water',
  description: 'Fuga simulada',
  location: 'Zona manual ficticia',
  reporterId: 'reporter-1',
  assignedTechnicianId: null,
  priority: 'medium',
  notes: [],
  evidence: [],
  history: [],
};
const incident = { id: 'campus-inc-101', version: 1, status: 'open', payload };
const body = (overrides: Record<string, unknown> = {}) => ({ incident, operationId: KEY, duplicate: false, ...overrides });

function success(status: number, data: unknown): HttpResult {
  return { ok: true, status, data, headers: {} as Headers };
}

function setup(result: HttpResult) {
  const requestJson = jest.fn().mockResolvedValue(result);
  const transport: JsonTransport = { requestJson };
  return { repository: new IncidenciaApiRepository(transport), requestJson };
}

describe('IncidenciaApiRepository.create', () => {
  test('POSTs the three contract fields with the provided Idempotency-Key and nothing else', async () => {
    const { repository, requestJson } = setup(success(201, body()));
    await repository.create(input, KEY);
    expect(requestJson).toHaveBeenCalledWith({
      method: 'POST',
      path: '/v1/incidents',
      headers: { 'Idempotency-Key': KEY },
      body: { category: 'water', description: 'Fuga simulada', location: 'Zona manual ficticia' },
    });
  });

  test('201 is a validated creation', async () => {
    const { repository } = setup(success(201, body()));
    await expect(repository.create(input, KEY)).resolves.toMatchObject({
      ok: true,
      kind: 'created',
      operationId: KEY,
      incident: { id: 'campus-inc-101', status: 'open', assignedTechnicianId: null },
    });
  });

  test('200 with duplicate:true is a replay of the same incident', async () => {
    const { repository } = setup(success(200, body({ duplicate: true })));
    await expect(repository.create(input, KEY)).resolves.toMatchObject({
      ok: true,
      kind: 'replayed',
      incident: { id: 'campus-inc-101' },
    });
  });

  test('keeps the same key on every attempt (never regenerates it)', async () => {
    const { repository, requestJson } = setup({ ok: false, error: { kind: 'timeout' } });
    await repository.create(input, KEY);
    await repository.create(input, KEY);
    expect(requestJson.mock.calls.map((call) => call[0].headers['Idempotency-Key'])).toEqual([KEY, KEY]);
  });

  test('409 is an idempotency conflict', async () => {
    const { repository } = setup({ ok: false, error: { kind: 'http', status: 409, code: 'idempotency_key_reused' } });
    await expect(repository.create(input, KEY)).resolves.toEqual({ ok: false, error: { kind: 'idempotency_conflict' } });
  });

  test.each([
    [403, 'forbidden'],
    [422, 'invalid_incident'],
    [400, 'idempotency_key_required'],
    [500, 'controlled_failure'],
  ])('preserves HTTP %i as a distinguishable error', async (status, code) => {
    const { repository } = setup({ ok: false, error: { kind: 'http', status, code } });
    await expect(repository.create(input, KEY)).resolves.toEqual({ ok: false, error: { kind: 'http', status, code } });
  });

  test('omits the code when the server did not provide a technical one', async () => {
    const { repository } = setup({ ok: false, error: { kind: 'http', status: 500 } });
    await expect(repository.create(input, KEY)).resolves.toEqual({ ok: false, error: { kind: 'http', status: 500 } });
  });

  test.each([
    ['timeout', { kind: 'timeout' } as const, 'timeout'],
    ['network', { kind: 'network' } as const, 'network'],
    ['invalid_json', { kind: 'invalid_json' } as const, 'invalid_json'],
  ])('%s on a write is an UNCERTAIN outcome, not a rejection', async (_label, error, cause) => {
    const { repository } = setup({ ok: false, error });
    await expect(repository.create(input, KEY)).resolves.toEqual({ ok: false, error: { kind: 'uncertain', cause } });
  });

  test.each([
    ['not an object', null, 201],
    ['an array', [], 201],
    ['no operationId', { incident, duplicate: false }, 201],
    ['empty operationId', body({ operationId: '  ' }), 201],
    ['no duplicate flag', { incident, operationId: KEY }, 201],
    ['non-boolean duplicate', body({ duplicate: 'false' }), 201],
    ['201 flagged as duplicate', body({ duplicate: true }), 201],
    ['200 flagged as not duplicate', body({ duplicate: false }), 200],
  ])('rejects an invalid creation envelope: %s', async (_label, data, status) => {
    const { repository } = setup(success(status, data));
    await expect(repository.create(input, KEY)).resolves.toEqual({
      ok: false,
      error: { kind: 'contract', reason: 'creation_envelope' },
    });
  });

  test('rejects a 2xx status other than 200/201', async () => {
    const { repository } = setup(success(202, body()));
    await expect(repository.create(input, KEY)).resolves.toEqual({
      ok: false,
      error: { kind: 'contract', reason: 'unexpected_status' },
    });
  });

  test('rejects a creation whose incident violates the contract', async () => {
    const { repository } = setup(success(201, body({ incident: { ...incident, payload: { ...payload, priority: 'urgent' } } })));
    await expect(repository.create(input, KEY)).resolves.toEqual({
      ok: false,
      error: { kind: 'contract', reason: 'incident_payload' },
    });
  });

  test('rejects a creation whose incident envelope is invalid or missing', async () => {
    const { repository } = setup(success(201, body({ incident: { id: '', version: 1, status: 'open', payload } })));
    await expect(repository.create(input, KEY)).resolves.toEqual({
      ok: false,
      error: { kind: 'contract', reason: 'resource_contract' },
    });
  });

  test('does not accept a null payload as a created incident', async () => {
    const { repository } = setup(success(201, body({ incident: { ...incident, payload: null } })));
    await expect(repository.create(input, KEY)).resolves.toEqual({
      ok: false,
      error: { kind: 'contract', reason: 'incident_payload' },
    });
  });

  test('rejects a response that belongs to a different operation', async () => {
    const { repository } = setup(success(201, body({ operationId: 'another-operation' })));
    await expect(repository.create(input, KEY)).resolves.toEqual({
      ok: false,
      error: { kind: 'contract', reason: 'operation_mismatch' },
    });
  });
});
