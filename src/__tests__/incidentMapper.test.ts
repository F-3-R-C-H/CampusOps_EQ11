import { parseRemoteResource } from '../course-evaluation';
import { mapRemoteIncident, parseIncidentPayload } from '../infrastructure/api/incidentMapper';

const validPayload = {
  category: 'connectivity',
  description: 'Falla ficticia de red',
  location: 'Edificio de prueba A',
  reporterId: 'reporter-1',
  assignedTechnicianId: 'technician-1',
  priority: 'medium',
  notes: [{ actorId: 'reporter-1', text: 'Nota sintética' }],
  evidence: [{ actorId: 'reporter-1', evidenceId: 'synthetic-photo-1' }],
  history: [{ operationId: 'assign-operation', actorId: 'coordinator-1', action: 'assign', version: 2 }],
  futurePayloadField: 'ignored',
} as const;

const validResource = {
  id: 'campus-inc-001',
  version: 2,
  status: 'assigned',
  payload: validPayload,
};

describe('parseRemoteResource', () => {
  test('accepts a valid envelope and ignores forward-compatible fields', () => {
    expect(parseRemoteResource({ ...validResource, futureEnvelopeField: true })).toEqual({
      ok: true,
      value: validResource,
    });
  });

  test.each([null, undefined, [], ['resource'], 'resource', 4])(
    'rejects an invalid root: %p',
    (input) => {
      expect(parseRemoteResource(input)).toEqual({ ok: false, error: 'contract' });
    },
  );

  test.each([
    { ...validResource, id: '' },
    { ...validResource, id: '   ' },
    { ...validResource, id: 10 },
    { ...validResource, status: '' },
    { ...validResource, status: '  ' },
    { ...validResource, status: null },
  ])('rejects invalid id or status %#', (input) => {
    expect(parseRemoteResource(input)).toEqual({ ok: false, error: 'contract' });
  });

  test.each([
    { ...validResource, version: '2' },
    { ...validResource, version: -1 },
    { ...validResource, version: 1.5 },
    { ...validResource, version: Number.NaN },
  ])('rejects an invalid version %#', (input) => {
    expect(parseRemoteResource(input)).toEqual({ ok: false, error: 'contract' });
  });

  test.each([
    { ...validResource, payload: [] },
    { ...validResource, payload: 'payload' },
    { ...validResource, payload: 1 },
  ])('rejects a non-object payload %#', (input) => {
    expect(parseRemoteResource(input)).toEqual({ ok: false, error: 'contract' });
  });
});

describe('parseIncidentPayload', () => {
  test('validates and projects the backend incident payload', () => {
    const result = parseIncidentPayload(validPayload);
    expect(result).toEqual({
      ok: true,
      value: {
        category: 'connectivity',
        description: 'Falla ficticia de red',
        location: 'Edificio de prueba A',
        reporterId: 'reporter-1',
        assignedTechnicianId: 'technician-1',
        priority: 'medium',
        notes: [{ actorId: 'reporter-1', text: 'Nota sintética' }],
        evidence: [{ actorId: 'reporter-1', evidenceId: 'synthetic-photo-1' }],
        history: [{ operationId: 'assign-operation', actorId: 'coordinator-1', action: 'assign', version: 2 }],
      },
    });
  });

  test('accepts the nullable assigned technician and optional diagnosis', () => {
    expect(parseIncidentPayload({
      ...validPayload,
      assignedTechnicianId: null,
      diagnosis: 'Cable sustituido',
    })).toMatchObject({
      ok: true,
      value: { assignedTechnicianId: null, diagnosis: 'Cable sustituido' },
    });
  });

  test.each([
    { ...validPayload, category: 'unknown' },
    { ...validPayload, description: '' },
    { ...validPayload, location: null },
    { ...validPayload, reporterId: '' },
    { ...validPayload, assignedTechnicianId: 3 },
    { ...validPayload, priority: 'urgent' },
    { ...validPayload, notes: {} },
    { ...validPayload, notes: [{ actorId: 'reporter-1' }] },
    { ...validPayload, evidence: [{ actorId: '', evidenceId: 'photo' }] },
    { ...validPayload, history: [{ operationId: 'op', actorId: 'actor', action: 'assign', version: -1 }] },
    { ...validPayload, diagnosis: null },
  ])('rejects an invalid incident payload %#', (input) => {
    expect(parseIncidentPayload(input)).toEqual({ ok: false, error: 'incident_payload' });
  });
});

describe('mapRemoteIncident', () => {
  test('maps validated DTO data to the application model', () => {
    const result = mapRemoteIncident(validResource);
    expect(result).toMatchObject({
      ok: true,
      kind: 'incident',
      incident: {
        id: 'campus-inc-001',
        version: 2,
        status: 'assigned',
        category: 'connectivity',
        priority: 'medium',
      },
    });
    if (!result.ok || result.kind !== 'incident') throw new Error('expected a mapped incident');
    expect(result.incident).not.toHaveProperty('title');
    expect(result.incident).not.toHaveProperty('createdAt');
    expect(result.incident).not.toHaveProperty('futurePayloadField');
  });

  test('preserves metadata and represents a null payload explicitly', () => {
    const result = mapRemoteIncident({
      id: 'campus-inc-null',
      version: 3,
      status: 'closed',
      payload: null,
      ignored: 'forward-compatible',
    });
    expect(result).toEqual({
      ok: true,
      kind: 'absent',
      resource: { id: 'campus-inc-null', version: 3, status: 'closed', payload: null },
    });
    expect(result).not.toHaveProperty('incident');
  });

  test.each([
    [{ ...validResource, id: '' }, 'resource_contract'],
    [{ ...validResource, status: 'future_status' }, 'incident_status'],
    [{ ...validResource, payload: { ...validPayload, category: 'invalid' } }, 'incident_payload'],
  ] as const)('distinguishes invalid remote data %#', (input, reason) => {
    expect(mapRemoteIncident(input)).toEqual({ ok: false, kind: 'invalid', reason });
  });
});
