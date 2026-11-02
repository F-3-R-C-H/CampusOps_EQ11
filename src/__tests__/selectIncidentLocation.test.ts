import { selectIncidentLocation } from '../../src/course-evaluation';

// ─── Camino feliz: datos del proveedor completamente válidos ──────────────────

test('selectIncidentLocation acepta datos válidos del proveedor con coordenadas en (0, 0)', () => {
  expect(
    selectIncidentLocation({ label: 'Zona de prueba', latitude: 0, longitude: 0 }, 'Edificio manual'),
  ).toEqual({ source: 'provider', label: 'Zona de prueba', latitude: 0, longitude: 0 });
});

test('selectIncidentLocation acepta coordenadas en los límites exactos del rango', () => {
  expect(
    selectIncidentLocation({ label: 'Límite norte', latitude: 90, longitude: 180 }, 'Edificio manual'),
  ).toEqual({ source: 'provider', label: 'Límite norte', latitude: 90, longitude: 180 });

  expect(
    selectIncidentLocation({ label: 'Límite sur', latitude: -90, longitude: -180 }, 'Edificio manual'),
  ).toEqual({ source: 'provider', label: 'Límite sur', latitude: -90, longitude: -180 });
});

test('selectIncidentLocation acepta coordenadas negativas válidas', () => {
  expect(
    selectIncidentLocation({ label: 'Ciudad de México', latitude: 19.4326, longitude: -99.1332 }, 'Ref. manual'),
  ).toEqual({ source: 'provider', label: 'Ciudad de México', latitude: 19.4326, longitude: -99.1332 });
});

// ─── Fallback ante datos nulos o primitivos ───────────────────────────────────

test('selectIncidentLocation devuelve manual ante null', () => {
  expect(selectIncidentLocation(null, 'Edificio manual')).toEqual({
    source: 'manual',
    label: 'Edificio manual',
  });
});

test('selectIncidentLocation devuelve manual ante undefined', () => {
  expect(selectIncidentLocation(undefined, 'Edificio manual')).toEqual({
    source: 'manual',
    label: 'Edificio manual',
  });
});

test('selectIncidentLocation devuelve manual ante un string', () => {
  expect(selectIncidentLocation('texto plano', 'Edificio manual')).toEqual({
    source: 'manual',
    label: 'Edificio manual',
  });
});

test('selectIncidentLocation devuelve manual ante un número', () => {
  expect(selectIncidentLocation(42, 'Edificio manual')).toEqual({
    source: 'manual',
    label: 'Edificio manual',
  });
});

// ─── Fallback ante errores representados como dato ({status: 429}) ────────────

test('selectIncidentLocation devuelve manual cuando el proveedor responde 429 como dato', () => {
  expect(selectIncidentLocation({ status: 429 }, 'Edificio manual')).toEqual({
    source: 'manual',
    label: 'Edificio manual',
  });
});

test('selectIncidentLocation devuelve manual cuando el proveedor responde con error 500', () => {
  expect(selectIncidentLocation({ status: 500, error: 'Internal Server Error' }, 'Sala cómputo B2')).toEqual({
    source: 'manual',
    label: 'Sala cómputo B2',
  });
});

// ─── Fallback ante datos incompletos ─────────────────────────────────────────

test('selectIncidentLocation devuelve manual cuando falta latitude', () => {
  expect(selectIncidentLocation({ label: 'Incompleta' }, 'Edificio manual')).toEqual({
    source: 'manual',
    label: 'Edificio manual',
  });
});

test('selectIncidentLocation devuelve manual cuando falta longitude', () => {
  expect(selectIncidentLocation({ label: 'Solo lat', latitude: 19.4 }, 'Edificio manual')).toEqual({
    source: 'manual',
    label: 'Edificio manual',
  });
});

test('selectIncidentLocation devuelve manual cuando falta label', () => {
  expect(selectIncidentLocation({ latitude: 19.4, longitude: -99.1 }, 'Edificio manual')).toEqual({
    source: 'manual',
    label: 'Edificio manual',
  });
});

test('selectIncidentLocation devuelve manual cuando label es string vacío', () => {
  expect(selectIncidentLocation({ label: '', latitude: 0, longitude: 0 }, 'Edificio manual')).toEqual({
    source: 'manual',
    label: 'Edificio manual',
  });
});

test('selectIncidentLocation devuelve manual cuando label es solo espacios', () => {
  expect(selectIncidentLocation({ label: '   ', latitude: 0, longitude: 0 }, 'Edificio manual')).toEqual({
    source: 'manual',
    label: 'Edificio manual',
  });
});

// ─── Fallback ante coordenadas inválidas ─────────────────────────────────────

test('selectIncidentLocation devuelve manual cuando latitude supera 90', () => {
  expect(selectIncidentLocation({ label: 'Inválida', latitude: 91, longitude: 0 }, 'Edificio manual')).toEqual({
    source: 'manual',
    label: 'Edificio manual',
  });
});

test('selectIncidentLocation devuelve manual cuando latitude es menor a -90', () => {
  expect(selectIncidentLocation({ label: 'Inválida', latitude: -91, longitude: 0 }, 'Edificio manual')).toEqual({
    source: 'manual',
    label: 'Edificio manual',
  });
});

test('selectIncidentLocation devuelve manual cuando longitude supera 180', () => {
  expect(selectIncidentLocation({ label: 'Inválida', latitude: 0, longitude: 181 }, 'Edificio manual')).toEqual({
    source: 'manual',
    label: 'Edificio manual',
  });
});

test('selectIncidentLocation devuelve manual cuando longitude es menor a -180', () => {
  expect(selectIncidentLocation({ label: 'Inválida', latitude: 0, longitude: -181 }, 'Edificio manual')).toEqual({
    source: 'manual',
    label: 'Edificio manual',
  });
});

test('selectIncidentLocation devuelve manual cuando latitude es NaN', () => {
  expect(selectIncidentLocation({ label: 'NaN lat', latitude: NaN, longitude: 0 }, 'Edificio manual')).toEqual({
    source: 'manual',
    label: 'Edificio manual',
  });
});

test('selectIncidentLocation devuelve manual cuando latitude es Infinity', () => {
  expect(selectIncidentLocation({ label: 'Inf lat', latitude: Infinity, longitude: 0 }, 'Edificio manual')).toEqual({
    source: 'manual',
    label: 'Edificio manual',
  });
});

test('selectIncidentLocation devuelve manual cuando coordinates son strings en vez de números', () => {
  expect(
    selectIncidentLocation({ label: 'Strings', latitude: '19.4', longitude: '-99.1' }, 'Edificio manual'),
  ).toEqual({ source: 'manual', label: 'Edificio manual' });
});

// ─── Sin inventar coordenadas ─────────────────────────────────────────────────

test('selectIncidentLocation no agrega latitude ni longitude al resultado manual', () => {
  const result = selectIncidentLocation(null, 'Zona norte');
  expect(result.source).toBe('manual');
  expect(result.label).toBe('Zona norte');
  expect('latitude' in result).toBe(false);
  expect('longitude' in result).toBe(false);
});
