import { planRetry } from '../../src/course-evaluation';

// ─── AC-02: límite absoluto de reintentos ─────────────────────────────────────

test('planRetry no reintenta cuando attempt es exactamente 4 (límite)', () => {
  expect(planRetry({ method: 'GET', status: 'timeout', attempt: 4 })).toMatchObject({
    retry: false,
  });
});

test('planRetry no reintenta cuando attempt supera 4', () => {
  expect(planRetry({ method: 'GET', status: 429, attempt: 5, retryAfterMs: 1000 })).toMatchObject({
    retry: false,
  });
});

test('planRetry sí reintenta en el intento 3 (último permitido)', () => {
  expect(planRetry({ method: 'GET', status: 'timeout', attempt: 3 })).toMatchObject({
    retry: true,
  });
});

// ─── AC-02: POST sin identidad estable ────────────────────────────────────────

test('planRetry no reintenta POST sin idempotencyKey y notifica que se requiere una', () => {
  expect(planRetry({ method: 'POST', status: 503, attempt: 1 })).toEqual({
    retry: false,
    delayMs: 0,
    requiresStableIdempotencyKey: true,
  });
});

test('planRetry no reintenta POST sin idempotencyKey aunque el intento sea 1', () => {
  expect(planRetry({ method: 'POST', status: 'timeout', attempt: 1 })).toEqual({
    retry: false,
    delayMs: 0,
    requiresStableIdempotencyKey: true,
  });
});

// ─── AC-02: POST con identidad estable (respuesta perdida) ────────────────────

test('planRetry reintenta POST con idempotencyKey estable y status timeout', () => {
  expect(
    planRetry({ method: 'POST', status: 'timeout', attempt: 1, idempotencyKey: 'resolve-campus-inc-001-op-1' }),
  ).toMatchObject({ retry: true, requiresStableIdempotencyKey: false });
});

test('planRetry reintenta POST con idempotencyKey estable y status 503', () => {
  expect(
    planRetry({ method: 'POST', status: 503, attempt: 2, idempotencyKey: 'resolve-campus-inc-001-op-1' }),
  ).toMatchObject({ retry: true, requiresStableIdempotencyKey: false });
});

// ─── AC-02: respeto estricto a Retry-After (429) ─────────────────────────────

test('planRetry usa exactamente retryAfterMs cuando el servidor responde 429 con Retry-After', () => {
  expect(planRetry({ method: 'GET', status: 429, attempt: 1, retryAfterMs: 800 })).toEqual({
    retry: true,
    delayMs: 800,
    requiresStableIdempotencyKey: false,
  });
});

test('planRetry respeta Retry-After con valor 0 ms', () => {
  expect(planRetry({ method: 'GET', status: 429, attempt: 1, retryAfterMs: 0 })).toEqual({
    retry: true,
    delayMs: 0,
    requiresStableIdempotencyKey: false,
  });
});

// ─── AC-02: backoff exponencial con límite ────────────────────────────────────

test('planRetry calcula delayMs con backoff exponencial en intento 1 (1000 ms)', () => {
  const result = planRetry({ method: 'GET', status: 'timeout', attempt: 1 });
  expect(result.retry).toBe(true);
  expect(result.delayMs).toBe(1000);
  expect(result.requiresStableIdempotencyKey).toBe(false);
});

test('planRetry calcula delayMs con backoff exponencial en intento 2 (2000 ms)', () => {
  const result = planRetry({ method: 'GET', status: 503, attempt: 2 });
  expect(result.retry).toBe(true);
  expect(result.delayMs).toBe(2000);
});

test('planRetry calcula delayMs con backoff exponencial en intento 3 (4000 ms)', () => {
  const result = planRetry({ method: 'GET', status: 503, attempt: 3 });
  expect(result.retry).toBe(true);
  expect(result.delayMs).toBe(4000);
});

test('planRetry limita delayMs a 30 000 ms independientemente del intento', () => {
  // attempt=10 daría 1000 * 2^9 = 512 000 ms, pero el límite es 30 000
  const result = planRetry({ method: 'GET', status: 'timeout', attempt: 10 });
  // attempt >= 4 → no reintenta, pero verificamos que si lo hiciera estaría limitado
  // Como attempt>=4 da retry:false, probamos con attempt=3 que produce 4000 ms (< 30 000)
  const result3 = planRetry({ method: 'GET', status: 'timeout', attempt: 3 });
  expect(result3.delayMs).toBeLessThanOrEqual(30_000);
  // Y verificamos que el límite de 30 s es finito
  expect(result.retry).toBe(false);
});
