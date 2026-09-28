import {
  REDACTED,
  isSensitiveKey,
  normalizeKey,
  sanitize,
} from '../infrastructure/security/sanitizer';

describe('sanitizer — normalización de claves', () => {
  test('normaliza a minúsculas y sin _ ni -', () => {
    expect(normalizeKey('Access_Token')).toBe('accesstoken');
    expect(normalizeKey('refresh-token')).toBe('refreshtoken');
    expect(normalizeKey('displayName')).toBe('displayname');
  });

  test.each([
    'authorization', 'password', 'token', 'accessToken', 'refresh_token',
    'email', 'displayName', 'name', 'userId', 'reporter-id',
    'technicianId', 'assigned_technician_id', 'assignmentHistory',
    'location', 'latitude', 'longitude', 'photos', 'evidence', 'internalComments',
  ])('%s es sensible', (key) => {
    expect(isSensitiveKey(key)).toBe(true);
  });

  test.each(['incidentId', 'correlationId', 'status', 'attempt', 'durationMs'])(
    '%s NO es sensible',
    (key) => {
      expect(isSensitiveKey(key)).toBe(false);
    },
  );
});

describe('sanitizer — incidente complejo', () => {
  const incident = () => ({
    incidentId: 'campus-inc-001',
    correlationId: 'corr-42',
    status: 'OPEN',
    attempt: 2,
    durationMs: 120,
    reporter: { userId: 'u-1', email: 'persona@campusops.test', displayName: 'Persona ficticia' },
    location: { latitude: 19.0, longitude: -98.2 },
    photos: ['synthetic-photo-1'],
    internalComments: ['Nota interna ficticia'],
    assignment_history: [{ technician_id: 't-1' }],
    request: { headers: { Authorization: 'Bearer course-token', accept: 'application/json' } },
    events: [{ status: 'NEW', 'refresh-token': 'abc' }, { status: 'ASSIGNED' }],
  });

  test('elimina datos personales y conserva IDs y estados', () => {
    expect(sanitize(incident())).toEqual({
      incidentId: 'campus-inc-001',
      correlationId: 'corr-42',
      status: 'OPEN',
      attempt: 2,
      durationMs: 120,
      reporter: { userId: REDACTED, email: REDACTED, displayName: REDACTED },
      location: REDACTED,
      photos: REDACTED,
      internalComments: REDACTED,
      assignment_history: REDACTED,
      request: { headers: { Authorization: REDACTED, accept: 'application/json' } },
      events: [{ status: 'NEW', 'refresh-token': REDACTED }, { status: 'ASSIGNED' }],
    });
  });

  test('no muta la entrada original', () => {
    const input = incident();
    const snapshot = JSON.parse(JSON.stringify(input));
    const output = sanitize(input);
    expect(input).toEqual(snapshot);
    expect(output).not.toBe(input);
  });
});

describe('sanitizer — fronteras y fallas', () => {
  test('anidación profunda y arreglos de objetos', () => {
    const out = sanitize({ a: { b: { c: [{ d: { password: 'x', ok: 1 } }] } } });
    expect(out).toEqual({ a: { b: { c: [{ d: { password: REDACTED, ok: 1 } }] } } });
  });

  test('primitivos, null y undefined pasan intactos', () => {
    expect(sanitize('texto')).toBe('texto');
    expect(sanitize(5)).toBe(5);
    expect(sanitize(null)).toBeNull();
    expect(sanitize(undefined)).toBeUndefined();
  });

  test('objetos de error no exponen credenciales', () => {
    const error = Object.assign(new Error('Fallo de red'), {
      config: { headers: { authorization: 'Bearer secreto' } },
      token: 'secreto',
      status: 401,
    });
    const out = sanitize(error) as Record<string, unknown>;
    expect(out.message).toBe('Fallo de red');
    expect(out.status).toBe(401);
    expect(out.token).toBe(REDACTED);
    expect(JSON.stringify(out)).not.toContain('secreto');
  });

  test('referencias circulares no provocan bucle infinito', () => {
    const a: Record<string, unknown> = { status: 'ok' };
    a.self = a;
    expect(sanitize(a)).toEqual({ status: 'ok', self: '[Circular]' });
  });
});
