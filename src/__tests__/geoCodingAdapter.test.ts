import { GeoCodingAdapter } from '../infrastructure/location/GeoCodingAdapter';
import {
  DEFAULT_LOCATION_CACHE_TTL_MS,
  LocationCache,
  type GeocodingResult,
} from '../infrastructure/location/LocationCache';
import { CourseHttpClient, type FetchLike } from '../infrastructure/http/CourseHttpClient';

function response(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {} as Headers,
    text: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function createAdapter(
  fetchImpl: jest.MockedFunction<FetchLike>,
  options: Readonly<{ cache?: LocationCache; timeoutMs?: number; actorId?: string }> = {},
): GeoCodingAdapter {
  const client = new CourseHttpClient({
    baseUrl: 'http://course.test/',
    actorId: options.actorId ?? 'reporter-1',
    timeoutMs: options.timeoutMs ?? 3000,
    fetchImpl,
    logger: jest.fn(),
  });
  return new GeoCodingAdapter(client, options.cache);
}

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('stores a valid result and reuses it for normalized equivalent queries', async () => {
  const fetchImpl = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>()
    .mockResolvedValue(response(200, '{"label":"Zona Norte","latitude":19.4,"longitude":-99.1}'));
  const adapter = createAdapter(fetchImpl);

  await expect(adapter.geocode('  ZONA   Norte  ')).resolves.toEqual({
    label: 'Zona Norte', latitude: 19.4, longitude: -99.1,
  });
  await expect(adapter.geocode('zona norte')).resolves.toEqual({
    label: 'Zona Norte', latitude: 19.4, longitude: -99.1,
  });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test('expires an entry exactly at its TTL and requests it again', async () => {
  let now = 10_000;
  const cache = new LocationCache({ ttlMs: 500, now: () => now });
  const fetchImpl = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>()
    .mockResolvedValueOnce(response(200, '{"label":"Primera","latitude":1,"longitude":2}'))
    .mockResolvedValueOnce(response(200, '{"label":"Actualizada","latitude":3,"longitude":4}'));
  const adapter = createAdapter(fetchImpl, { cache });

  await expect(adapter.geocode('Biblioteca')).resolves.toMatchObject({ label: 'Primera' });
  now += 499;
  await expect(adapter.geocode('biblioteca')).resolves.toMatchObject({ label: 'Primera' });
  now += 1;
  await expect(adapter.geocode('BIBLIOTECA')).resolves.toMatchObject({ label: 'Actualizada' });
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test('returns null for an empty query without making an HTTP request', async () => {
  const fetchImpl = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>();
  const adapter = createAdapter(fetchImpl);

  await expect(adapter.geocode(' \t\n ')).resolves.toBeNull();
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('encodes special characters and keeps the configured actor and course authentication', async () => {
  const fetchImpl = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>()
    .mockResolvedValue(response(200, '{"label":"Ala especial","latitude":0,"longitude":0}'));
  const adapter = createAdapter(fetchImpl, { actorId: 'coordinator-1' });

  await adapter.geocode('Edificio #1 / Ala?');

  expect(fetchImpl).toHaveBeenCalledWith(
    'http://course.test/v1/geocoding?q=Edificio%20%231%20%2F%20Ala%3F',
    expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({
        Authorization: 'Bearer course-valid-token',
        'X-Course-Actor': 'coordinator-1',
      }),
    }),
  );
});

test.each([429, 500])('returns null for HTTP %i and does not cache the failure', async (status) => {
  const fetchImpl = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>()
    .mockResolvedValue(response(status, '{"code":"controlled_failure"}'));
  const adapter = createAdapter(fetchImpl);

  await expect(adapter.geocode('Zona de falla')).resolves.toBeNull();
  await expect(adapter.geocode('zona de falla')).resolves.toBeNull();
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test.each(['request', 'body'] as const)('enforces the HTTP timeout during the %s phase', async (phase) => {
  jest.useFakeTimers();
  const fetchImpl = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>();
  if (phase === 'request') {
    fetchImpl.mockImplementation(() => new Promise<Response>(() => undefined));
  } else {
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      headers: {} as Headers,
      text: jest.fn(() => new Promise<string>(() => undefined)),
    } as unknown as Response);
  }
  const adapter = createAdapter(fetchImpl, { timeoutMs: 100 });

  const pending = adapter.geocode('Zona lenta');
  await jest.advanceTimersByTimeAsync(100);

  await expect(pending).resolves.toBeNull();
  expect(jest.getTimerCount()).toBe(0);
});

test('returns null after a disconnection and retries the HTTP lookup on a later call', async () => {
  const fetchImpl = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>()
    .mockRejectedValue(new Error('synthetic disconnect'));
  const adapter = createAdapter(fetchImpl);

  await expect(adapter.geocode('Zona desconectada')).resolves.toBeNull();
  await expect(adapter.geocode('zona desconectada')).resolves.toBeNull();
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test('returns null for invalid JSON and does not cache it', async () => {
  const fetchImpl = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>()
    .mockResolvedValue(response(200, '{"label":'));
  const adapter = createAdapter(fetchImpl);

  await expect(adapter.geocode('Zona ilegible')).resolves.toBeNull();
  await expect(adapter.geocode('zona ilegible')).resolves.toBeNull();
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test.each([
  ['null', null],
  ['array', []],
  ['missing coordinates', { label: 'Incompleta' }],
  ['empty label', { label: '   ', latitude: 0, longitude: 0 }],
  ['latitude above range', { label: 'Inválida', latitude: 91, longitude: 0 }],
  ['latitude below range', { label: 'Inválida', latitude: -91, longitude: 0 }],
  ['longitude above range', { label: 'Inválida', latitude: 0, longitude: 181 }],
  ['longitude below range', { label: 'Inválida', latitude: 0, longitude: -181 }],
  ['non-numeric coordinates', { label: 'Inválida', latitude: '19', longitude: '-99' }],
] as const)('rejects %s response data and does not cache it', async (_case, payload) => {
  const body = JSON.stringify(payload);
  const fetchImpl = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>()
    .mockResolvedValue(response(200, body));
  const adapter = createAdapter(fetchImpl);

  await expect(adapter.geocode('Zona inválida')).resolves.toBeNull();
  await expect(adapter.geocode('zona inválida')).resolves.toBeNull();
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test.each([
  ['NaN', Number.NaN],
  ['positive infinity', Number.POSITIVE_INFINITY],
  ['negative infinity', Number.NEGATIVE_INFINITY],
] as const)('rejects a non-finite %s without JSON coercion', async (_case, latitude) => {
  const requestJson = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: {} as Headers,
    data: { label: 'No finita', latitude, longitude: 0 },
  });
  const adapter = new GeoCodingAdapter({ requestJson });

  await expect(adapter.geocode('Zona no finita')).resolves.toBeNull();
  await expect(adapter.geocode('zona no finita')).resolves.toBeNull();
  expect(requestJson).toHaveBeenCalledTimes(2);
});

test.each([
  ['zero', 0, 0],
  ['minimum limits', -90, -180],
  ['maximum limits', 90, 180],
] as const)('accepts %s coordinates', async (_case, latitude, longitude) => {
  const fetchImpl = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>()
    .mockResolvedValue(response(200, JSON.stringify({ label: 'Límite válido', latitude, longitude })));
  const adapter = createAdapter(fetchImpl);

  await expect(adapter.geocode('Zona válida')).resolves.toEqual({
    label: 'Límite válido', latitude, longitude,
  });
});

test('returns defensive copies so consumer mutation cannot alter the cached value', async () => {
  const fetchImpl = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>()
    .mockResolvedValue(response(200, '{"label":"Original","latitude":5,"longitude":6}'));
  const adapter = createAdapter(fetchImpl);

  const first = await adapter.geocode('Zona mutable');
  (first as { label: string }).label = 'Alterada';

  await expect(adapter.geocode('zona mutable')).resolves.toEqual({
    label: 'Original', latitude: 5, longitude: 6,
  });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid TTL %p', (ttlMs) => {
  expect(() => new LocationCache({ ttlMs })).toThrow(RangeError);
});

test('uses a five-minute TTL by default', () => {
  expect(DEFAULT_LOCATION_CACHE_TTL_MS).toBe(300_000);
  const value: GeocodingResult = { label: 'Zona', latitude: 0, longitude: 0 };
  let now = 0;
  const cache = new LocationCache({ now: () => now });
  cache.set('Zona', value);
  now = DEFAULT_LOCATION_CACHE_TTL_MS;
  expect(cache.get('zona')).toBeNull();
});
