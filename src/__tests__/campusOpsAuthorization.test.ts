import {
  AccessDeniedError,
  CAMPUS_ACTIONS,
  assertCanActOnIncident,
  authorizeAction,
  canActOnIncident,
  canPerformAction,
  canViewIncident,
  type Actor,
  type CampusAction,
} from '../domain/security/CampusOpsAuthorization';
import {
  ANONYMOUS_SESSION,
  beginRefresh,
  completeRefresh,
  createSession,
  endSession,
  isCampusRole,
  toSafeSessionView,
} from '../domain/models/Session';

const reporter: Actor = { actorId: 'reporter-1', role: 'reporter' };
const otherReporter: Actor = { actorId: 'reporter-2', role: 'reporter' };
const technician: Actor = { actorId: 'technician-1', role: 'technician' };
const otherTechnician: Actor = { actorId: 'technician-2', role: 'technician' };
const coordinator: Actor = { actorId: 'coordinator-1', role: 'coordinator' };

const incident = { reporterId: 'reporter-1', assignedTechnicianId: 'technician-1' } as const;
const reassigned = { reporterId: 'reporter-1', assignedTechnicianId: 'technician-2' } as const;

describe('canPerformAction — matriz por perfil', () => {
  test('técnico puede start y resolve, pero no close', () => {
    expect(canPerformAction('technician', 'start')).toBe(true);
    expect(canPerformAction('technician', 'resolve')).toBe(true);
    expect(canPerformAction('technician', 'close')).toBe(false);
  });

  test('reportante no puede assign', () => {
    expect(canPerformAction('reporter', 'assign')).toBe(false);
  });

  test('reportante sólo crea y agrega información posterior', () => {
    const allowed = CAMPUS_ACTIONS.filter((a) => canPerformAction('reporter', a));
    expect(allowed).toEqual(['create', 'comment', 'add_evidence']);
  });

  test('coordinador asigna, prioriza, cierra y reabre; no inicia ni resuelve', () => {
    for (const a of ['assign', 'prioritize', 'close', 'reopen'] as CampusAction[]) {
      expect(canPerformAction('coordinator', a)).toBe(true);
    }
    expect(canPerformAction('coordinator', 'start')).toBe(false);
    expect(canPerformAction('coordinator', 'resolve')).toBe(false);
    expect(canPerformAction('coordinator', 'create')).toBe(false);
  });

  test('resolución del técnico y cierre del coordinador son operaciones distintas', () => {
    expect(canPerformAction('technician', 'resolve')).toBe(true);
    expect(canPerformAction('coordinator', 'resolve')).toBe(false);
    expect(canPerformAction('coordinator', 'close')).toBe(true);
    expect(canPerformAction('technician', 'close')).toBe(false);
  });

  test.each([
    ['admin', 'close'],
    ['', 'start'],
    [undefined, 'start'],
    [null, 'assign'],
    ['technician', 'delete'],
    ['technician', ''],
    ['technician', undefined],
    ['TECHNICIAN', 'start'],
  ])('deny by default: rol=%p acción=%p', (role, action) => {
    expect(canPerformAction(role, action)).toBe(false);
  });
});

describe('canActOnIncident — propiedad y reasignación', () => {
  test('técnico asignado puede start/resolve', () => {
    expect(canActOnIncident(technician, 'start', incident)).toBe(true);
    expect(canActOnIncident(technician, 'resolve', incident)).toBe(true);
  });

  test('técnico NO modifica una incidencia reasignada a otra persona', () => {
    expect(canActOnIncident(technician, 'start', reassigned)).toBe(false);
    expect(canActOnIncident(technician, 'resolve', reassigned)).toBe(false);
    expect(canActOnIncident(otherTechnician, 'start', reassigned)).toBe(true);
  });

  test('sin incidencia, un técnico no puede actuar (salvo create no aplica)', () => {
    expect(canActOnIncident(technician, 'start')).toBe(false);
  });

  test('reportante sólo comenta incidencias propias', () => {
    expect(canActOnIncident(reporter, 'comment', incident)).toBe(true);
    expect(canActOnIncident(otherReporter, 'comment', incident)).toBe(false);
  });

  test('reportante puede crear sin incidencia previa; técnico y coordinador no', () => {
    expect(canActOnIncident(reporter, 'create')).toBe(true);
    expect(canActOnIncident(technician, 'create')).toBe(false);
    expect(canActOnIncident(coordinator, 'create')).toBe(false);
  });

  test('coordinador actúa sobre cualquier incidencia permitida a su perfil', () => {
    expect(canActOnIncident(coordinator, 'assign', reassigned)).toBe(true);
    expect(canActOnIncident(coordinator, 'close', incident)).toBe(true);
  });

  test('visibilidad: coordinador ve todo, técnico lo asignado, reportante lo propio', () => {
    expect(canViewIncident(coordinator, incident)).toBe(true);
    expect(canViewIncident(technician, incident)).toBe(true);
    expect(canViewIncident(otherTechnician, incident)).toBe(false);
    expect(canViewIncident(reporter, incident)).toBe(true);
    expect(canViewIncident(otherReporter, incident)).toBe(false);
  });

  test('incidencia sin técnico asignado no es visible para ningún técnico', () => {
    const unassigned = { reporterId: 'reporter-1', assignedTechnicianId: null };
    expect(canViewIncident(technician, unassigned)).toBe(false);
  });
});

describe('acceso denegado (403)', () => {
  test('authorizeAction devuelve 403 forbidden en intento no permitido', () => {
    expect(authorizeAction(technician, 'close', incident)).toEqual({
      allowed: false,
      status: 403,
      code: 'forbidden',
    });
    expect(authorizeAction(reporter, 'assign', incident)).toEqual({
      allowed: false,
      status: 403,
      code: 'forbidden',
    });
  });

  test('authorizeAction permite lo autorizado', () => {
    expect(authorizeAction(technician, 'start', incident)).toEqual({ allowed: true });
  });

  test('assertCanActOnIncident lanza AccessDeniedError con status 403', () => {
    expect(() => assertCanActOnIncident(technician, 'close', incident)).toThrow(AccessDeniedError);
    try {
      assertCanActOnIncident(reporter, 'assign', incident);
      throw new Error('debió lanzar');
    } catch (error) {
      expect(error).toBeInstanceOf(AccessDeniedError);
      expect((error as AccessDeniedError).status).toBe(403);
      expect((error as AccessDeniedError).code).toBe('forbidden');
    }
  });

  test('el mensaje de error no filtra actor, rol ni tokens', () => {
    try {
      assertCanActOnIncident(technician, 'close', incident);
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toBe('Acceso denegado');
      expect(message).not.toMatch(/technician|reporter|token/i);
    }
  });

  test('no lanza cuando está autorizado', () => {
    expect(() => assertCanActOnIncident(coordinator, 'close', incident)).not.toThrow();
  });
});

describe('Session — modelo y manejo seguro de credenciales', () => {
  const input = {
    actorId: 'technician-1',
    role: 'technician',
    accessToken: 'course-valid-token',
    refreshToken: 'course-refresh-0',
  } as const;

  test('isCampusRole acepta sólo los tres perfiles', () => {
    expect(isCampusRole('reporter')).toBe(true);
    expect(isCampusRole('technician')).toBe(true);
    expect(isCampusRole('coordinator')).toBe(true);
    expect(isCampusRole('admin')).toBe(false);
    expect(isCampusRole(undefined)).toBe(false);
  });

  test('createSession produce una sesión autenticada con el perfil activo', () => {
    const session = createSession(input);
    expect(session.status).toBe('authenticated');
    expect(session.role).toBe('technician');
    expect(session.generation).toBe(0);
  });

  test('createSession rechaza perfil desconocido y credenciales vacías sin exponer tokens', () => {
    expect(() => createSession({ ...input, role: 'admin' })).toThrow('Perfil de sesión no válido');
    expect(() => createSession({ ...input, accessToken: '  ' })).toThrow();
    expect(() => createSession({ ...input, actorId: '' })).toThrow();
    try {
      createSession({ ...input, role: 'admin' });
    } catch (error) {
      expect((error as Error).message).not.toContain('course-valid-token');
    }
  });

  test('refresh conserva el perfil y sube la generación', () => {
    const refreshing = beginRefresh(createSession(input));
    expect(refreshing.status).toBe('refreshing');
    const renewed = completeRefresh(refreshing, { accessToken: 'course-token-1', refreshToken: 'course-refresh-1' });
    expect(renewed.status).toBe('authenticated');
    expect(renewed.role).toBe('technician');
    expect(renewed.generation).toBe(1);
  });

  test('beginRefresh/completeRefresh no reviven una sesión anónima', () => {
    expect(beginRefresh(ANONYMOUS_SESSION)).toBe(ANONYMOUS_SESSION);
    expect(completeRefresh(ANONYMOUS_SESSION, { accessToken: 'x', refreshToken: 'y' })).toBe(ANONYMOUS_SESSION);
  });

  test('endSession (fallo de refresh o logout) elimina perfil y credenciales', () => {
    const ended = endSession();
    expect(ended.status).toBe('anonymous');
    expect(ended.role).toBeNull();
    expect(ended.credentials).toBeNull();
  });

  test('toSafeSessionView nunca contiene tokens', () => {
    const view = toSafeSessionView(createSession(input));
    expect(view).toEqual({ status: 'authenticated', role: 'technician', generation: 0, hasCredentials: true });
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain('course-valid-token');
    expect(serialized).not.toContain('course-refresh-0');
  });
});
