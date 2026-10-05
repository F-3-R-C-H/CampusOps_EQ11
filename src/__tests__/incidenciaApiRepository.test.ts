import { IncidenciaApiRepository, type JsonTransport } from '../infrastructure/api/IncidenciaApiRepository';
import type { HttpResult } from '../infrastructure/http/CourseHttpClient';

const payload = {
  category: 'connectivity',
  description: 'Falla sintética',
  location: 'Edificio de prueba A',
  reporterId: 'reporter-1',
  assignedTechnicianId: 'technician-1',
  priority: 'medium',
  notes: [],
  evidence: [],
  history: [],
};
const resource = { id: 'campus-inc-001', version: 1, status: 'assigned', payload };

function success(data: unknown): HttpResult {
  return { ok: true, status: 200, data, headers: {} as Headers };
}

function repositoryWith(result: HttpResult): IncidenciaApiRepository {
  const transport: JsonTransport = { requestJson: jest.fn().mockResolvedValue(result) };
  return new IncidenciaApiRepository(transport);
}

describe('IncidenciaApiRepository list queries', () => {
  test('maps a valid list', async () => {
    await expect(repositoryWith(success({ items: [resource] })).getAll()).resolves.toMatchObject({
      ok: true,
      kind: 'data',
      incidents: [{ id: 'campus-inc-001', description: 'Falla sintética' }],
      unavailable: [],
    });
  });

  test('distinguishes a truly empty list', async () => {
    await expect(repositoryWith(success({ items: [] })).getAll()).resolves.toEqual({
      ok: true,
      kind: 'empty',
      incidents: [],
      unavailable: [],
    });
  });

  test('preserves metadata when every list payload is null', async () => {
    await expect(repositoryWith(success({ items: [{ ...resource, payload: null }] })).getAll()).resolves.toEqual({
      ok: true,
      kind: 'payload_absent',
      incidents: [],
      unavailable: [{ id: 'campus-inc-001', version: 1, status: 'assigned' }],
    });
  });

  test('retains absent metadata alongside usable incidents', async () => {
    await expect(repositoryWith(success({ items: [resource, { ...resource, id: 'campus-inc-002', payload: null }] })).getAll())
      .resolves.toMatchObject({
        ok: true,
        kind: 'data',
        incidents: [{ id: 'campus-inc-001' }],
        unavailable: [{ id: 'campus-inc-002', version: 1, status: 'assigned' }],
      });
  });

  test.each([null, [], {}, { items: {} }])('rejects an invalid list container: %p', async (data) => {
    await expect(repositoryWith(success(data)).getAll()).resolves.toEqual({
      ok: false,
      error: { kind: 'contract', reason: 'list_container' },
    });
  });

  test('rejects valid JSON whose incident violates the contract', async () => {
    await expect(repositoryWith(success({ items: [{ ...resource, payload: { ...payload, priority: 'urgent' } }] })).getAll())
      .resolves.toEqual({ ok: false, error: { kind: 'contract', reason: 'incident_payload' } });
  });
});

describe('IncidenciaApiRepository detail queries and failures', () => {
  test('maps a valid detail', async () => {
    await expect(repositoryWith(success(resource)).getById('campus-inc-001')).resolves.toMatchObject({
      ok: true,
      kind: 'data',
      incident: { id: 'campus-inc-001' },
    });
  });

  test('preserves a detail with null payload', async () => {
    await expect(repositoryWith(success({ ...resource, payload: null })).getById('campus-inc-001')).resolves.toEqual({
      ok: true,
      kind: 'payload_absent',
      resource: { id: 'campus-inc-001', version: 1, status: 'assigned' },
    });
  });

  test.each([
    [{ kind: 'invalid_json' } as const],
    [{ kind: 'timeout' } as const],
    [{ kind: 'network' } as const],
    [{ kind: 'http', status: 403, code: 'forbidden' } as const],
    [{ kind: 'http', status: 404, code: 'not_found' } as const],
    [{ kind: 'http', status: 500, code: 'controlled_failure' } as const],
  ])('preserves transport failure %#', async (error) => {
    await expect(repositoryWith({ ok: false, error }).getById('campus-inc-001'))
      .resolves.toEqual({ ok: false, error });
  });
});
