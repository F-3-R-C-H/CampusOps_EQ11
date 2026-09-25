import { redactForTelemetry } from '../src/course-evaluation';

/**
 * Pruebas negativas — Semana 4.
 * A diferencia de course-tests/public/week-04.test.ts (que valida la
 * FORMA del resultado), estas pruebas validan que el dato crudo nunca
 * quede presente en el payload que se enviaría a un servicio externo
 * de telemetría/logs.
 */

test('el token de acceso nunca aparece en texto plano dentro del payload redactado', () => {
  const result = redactForTelemetry({
    request: { headers: { authorization: 'Bearer course-token-super-secreto', accept: 'application/json' } },
  });

  expect(JSON.stringify(result)).not.toContain('course-token-super-secreto');
});

test('el correo y nombre del usuario no aparecen en texto plano', () => {
  const result = redactForTelemetry({
    profile: { email: 'persona.real@campusops.test', displayName: 'Nombre Real de Prueba' },
  });

  const serialized = JSON.stringify(result);
  expect(serialized).not.toContain('persona.real@campusops.test');
  expect(serialized).not.toContain('Nombre Real de Prueba');
});

test('valores no sensibles se conservan para poder depurar', () => {
  const result = redactForTelemetry({ incidentId: 'campus-inc-001', error: 'timeout', attempt: 2 });

  expect(result).toEqual({ incidentId: 'campus-inc-001', error: 'timeout', attempt: 2 });
});

test('entradas que no son objetos se devuelven sin modificar', () => {
  expect(redactForTelemetry('texto plano sin campos')).toBe('texto plano sin campos');
  expect(redactForTelemetry(null)).toBeNull();
});
