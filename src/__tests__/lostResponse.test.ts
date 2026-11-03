import { request as nodeRequest } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync } from 'node:fs';

import { planRetry } from '../course-evaluation';
import { CourseHttpClient, type FetchLike, type HttpResult } from '../infrastructure/http/CourseHttpClient';

/**
 * Semana 09 — respuesta perdida tras guardar (timeout_after_commit).
 *
 * Levanta course-backend/server.mjs en un puerto dinámico (HTTP real, sin Internet)
 * y usa el CourseHttpClient real. Cada ejecución arranca un backend nuevo, por lo
 * que el estado de campus-inc-001 siempre parte de { version: 1, status: 'assigned' }.
 *
 * Si LOST_RESPONSE_OBSERVATIONS apunta a un archivo, al terminar se escriben allí
 * las observaciones sanitizadas (intentos, esperas y tiempos) para los reportes JSON.
 * No se guardan tokens ni cabeceras de autorización.
 */

const nodeHttpFetch: FetchLike = (input, init) => new Promise<Response>((resolve, reject) => {
  const request = nodeRequest(input, {
    method: init.method,
    headers: init.headers as Record<string, string>,
  }, (response) => {
    const chunks: Buffer[] = [];
    response.on('data', (chunk: Buffer) => chunks.push(chunk));
    response.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      const status = response.statusCode ?? 0;
      const retryAfter = response.headers['retry-after'];
      resolve({
        ok: status >= 200 && status < 300,
        status,
        headers: {
          get: (name: string) => (name.toLowerCase() === 'retry-after' && typeof retryAfter === 'string' ? retryAfter : null),
        } as unknown as Headers,
        text: async () => text,
      } as unknown as Response);
    });
  });

  request.on('error', reject);
  init.signal?.addEventListener('abort', () => request.destroy(new Error('aborted')), { once: true });
  if (typeof init.body === 'string') request.write(init.body);
  request.end();
});

type Attempt = { step: string; attempt: number; outcome: string; elapsedMs: number; plannedDelayMs?: number };
type Observations = {
  lostResponse: {
    idempotencyKey: string;
    firstAttempt: Attempt;
    retryAttempt: Attempt;
    historyAfterLostResponse: string[];
    historyAfterRetry: string[];
    resolveEntriesAfterRetry: number;
    versionAfterLostResponse: number;
    versionAfterRetry: number;
    retryWasDuplicateReplay: boolean;
  } | null;
  reusedKeyStatus: number | null;
  postWithoutKey: { serverStatus: number | null; plan: ReturnType<typeof planRetry> | null };
  boundedServerError: { requests: number; plannedDelaysMs: number[]; stoppedAtAttempt: number } | null;
  boundedRateLimited: { requests: number; retryAfterHeader: string | null; plannedDelaysMs: number[]; stoppedAtAttempt: number } | null;
};

const observations: Observations = {
  lostResponse: null,
  reusedKeyStatus: null,
  postWithoutKey: { serverStatus: null, plan: null },
  boundedServerError: null,
  boundedRateLimited: null,
};

const INCIDENT = '/v1/incidents/campus-inc-001';
const INCIDENT_ACTIONS = `${INCIDENT}/actions`;
const RESOLVE_KEY = 'resolve-campus-inc-001-op-1';
const RESOLVE_BODY = { action: 'resolve', baseVersion: 2, diagnosis: 'Cable de red reemplazado' } as const;

let backend: ChildProcess | undefined;
let baseUrl = '';

beforeAll(async () => {
  backend = spawn(process.execPath, ['course-backend/server.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, COURSE_BACKEND_PORT: '0' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  baseUrl = await new Promise<string>((resolve, reject) => {
    const startupTimer = setTimeout(() => reject(new Error('backend startup timeout')), 5000);
    backend?.stdout?.setEncoding('utf8');
    backend?.stdout?.on('data', (chunk: string) => {
      const match = chunk.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match?.[0]) {
        clearTimeout(startupTimer);
        resolve(match[0]);
      }
    });
    backend?.once('exit', (code) => {
      clearTimeout(startupTimer);
      reject(new Error(`backend exited before startup: ${code}`));
    });
  });
});

afterAll(async () => {
  const target = process.env.LOST_RESPONSE_OBSERVATIONS;
  if (target) writeFileSync(target, `${JSON.stringify(observations, null, 2)}\n`, 'utf8');

  if (!backend || backend.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    const fallback = setTimeout(resolve, 2000);
    backend?.once('exit', () => {
      clearTimeout(fallback);
      resolve();
    });
    backend?.kill('SIGTERM');
  });
});

function client(actorId: string, scenario?: string, timeoutMs = 3000): CourseHttpClient {
  return new CourseHttpClient({
    baseUrl,
    actorId,
    ...(scenario ? { scenario } : {}),
    timeoutMs,
    fetchImpl: nodeHttpFetch,
    logger: jest.fn(),
  });
}

function dataOf(result: HttpResult): Record<string, any> {
  if (!result.ok) throw new Error(`unexpected transport failure: ${result.error.kind}`);
  return result.data as Record<string, any>;
}

async function readIncident(): Promise<{ version: number; status: string; history: Array<{ operationId: string; action: string }> }> {
  const body = dataOf(await client('technician-1').requestJson({ method: 'GET', path: INCIDENT }));
  return { version: body.version, status: body.status, history: body.payload.history };
}

/** Ejecuta una operación con el plan de planRetry; la espera se registra pero no se duerme. */
async function runBounded(
  path: string,
  scenario: string,
): Promise<{ requests: number; plannedDelaysMs: number[]; stoppedAtAttempt: number; lastRetryAfter: string | null }> {
  const plannedDelaysMs: number[] = [];
  let requests = 0;
  let lastRetryAfter: string | null = null;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    requests += 1;
    const response = await nodeHttpFetch(`${baseUrl}${path}`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer course-valid-token',
        'X-Course-Actor': 'coordinator-1',
        'X-Course-Scenario': scenario,
      },
    });
    lastRetryAfter = response.headers.get('retry-after');
    const retryAfterMs = lastRetryAfter === null ? undefined : Number(lastRetryAfter) * 1000;
    const plan = planRetry({
      method: 'GET',
      status: response.status,
      attempt,
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    });
    if (!plan.retry) return { requests, plannedDelaysMs, stoppedAtAttempt: attempt, lastRetryAfter };
    plannedDelaysMs.push(plan.delayMs);
  }
  throw new Error('retry loop was not bounded');
}

// Las pruebas 1 y 2 comparten el estado de campus-inc-001 y deben ejecutarse en este orden.
test('lost response after commit: the same Idempotency-Key replays without duplicating history', async () => {
  const technician = client('technician-1');

  // Preparación normal: assigned -> in_progress (version 1 -> 2).
  const started = await technician.requestJson({
    method: 'POST',
    path: INCIDENT_ACTIONS,
    headers: { 'Idempotency-Key': 'start-campus-inc-001-op-0' },
    body: { action: 'start', baseVersion: 1 },
  });
  expect(started).toMatchObject({ ok: true, status: 201 });

  // Intento 1: el servidor guarda la resolución pero responde a los 1500 ms; el cliente vence a los 400 ms.
  const lostStartedAt = Date.now();
  const lost = await client('technician-1', 'timeout_after_commit', 400).requestJson({
    method: 'POST',
    path: INCIDENT_ACTIONS,
    headers: { 'Idempotency-Key': RESOLVE_KEY },
    body: RESOLVE_BODY,
  });
  const lostElapsedMs = Date.now() - lostStartedAt;
  expect(lost).toEqual({ ok: false, error: { kind: 'timeout' } });

  // planRetry autoriza repetir porque la clave es estable.
  const plan = planRetry({ method: 'POST', status: 'timeout', attempt: 1, idempotencyKey: RESOLVE_KEY });
  expect(plan).toMatchObject({ retry: true, requiresStableIdempotencyKey: false });
  expect(plan.delayMs).toBeGreaterThanOrEqual(0);
  expect(Number.isFinite(plan.delayMs)).toBe(true);

  // El servidor sí confirmó el cambio aunque el cliente no recibió respuesta.
  const afterLoss = await readIncident();
  expect(afterLoss).toMatchObject({ version: 3, status: 'resolved' });
  expect(afterLoss.history.filter((entry) => entry.action === 'resolve')).toHaveLength(1);

  // Intento 2: misma clave y mismo contenido, sin escenario de fallo.
  const retryStartedAt = Date.now();
  const retried = await technician.requestJson({
    method: 'POST',
    path: INCIDENT_ACTIONS,
    headers: { 'Idempotency-Key': RESOLVE_KEY },
    body: RESOLVE_BODY,
  });
  const retryElapsedMs = Date.now() - retryStartedAt;
  expect(retried).toMatchObject({ ok: true, status: 200 });
  const replay = dataOf(retried);
  expect(replay.duplicate).toBe(true);
  expect(replay.operationId).toBe(RESOLVE_KEY);
  expect(replay.incident.version).toBe(3);

  // Sin duplicados: una sola entrada de resolución y la versión no avanzó.
  const afterRetry = await readIncident();
  expect(afterRetry).toMatchObject({ version: 3, status: 'resolved' });
  expect(afterRetry.history.filter((entry) => entry.action === 'resolve')).toHaveLength(1);
  expect(afterRetry.history.map((entry) => entry.action)).toEqual(['start', 'resolve']);

  observations.lostResponse = {
    idempotencyKey: RESOLVE_KEY,
    firstAttempt: { step: 'POST resolve (timeout_after_commit)', attempt: 1, outcome: 'timeout', elapsedMs: lostElapsedMs, plannedDelayMs: plan.delayMs },
    retryAttempt: { step: 'POST resolve (same key, same body)', attempt: 2, outcome: 'HTTP 200 duplicate:true', elapsedMs: retryElapsedMs },
    historyAfterLostResponse: afterLoss.history.map((entry) => entry.action),
    historyAfterRetry: afterRetry.history.map((entry) => entry.action),
    resolveEntriesAfterRetry: afterRetry.history.filter((entry) => entry.action === 'resolve').length,
    versionAfterLostResponse: afterLoss.version,
    versionAfterRetry: afterRetry.version,
    retryWasDuplicateReplay: replay.duplicate === true,
  };
}, 15000);

test('reusing the same key with different content is rejected and changes nothing', async () => {
  const reused = await client('technician-1').requestJson({
    method: 'POST',
    path: INCIDENT_ACTIONS,
    headers: { 'Idempotency-Key': RESOLVE_KEY },
    body: { ...RESOLVE_BODY, diagnosis: 'Otro diagnóstico distinto' },
  });
  expect(reused).toEqual({ ok: false, error: { kind: 'http', status: 409, code: 'idempotency_key_reused' } });
  observations.reusedKeyStatus = 409;

  const after = await readIncident();
  expect(after).toMatchObject({ version: 3, status: 'resolved' });
  expect(after.history.filter((entry) => entry.action === 'resolve')).toHaveLength(1);
}, 15000);

test('a POST without a stable key is refused by the server and never planned for retry', async () => {
  const withoutKey = await client('technician-1').requestJson({
    method: 'POST',
    path: INCIDENT_ACTIONS,
    body: { action: 'comment', baseVersion: 3, text: 'sin clave' },
  });
  expect(withoutKey).toEqual({ ok: false, error: { kind: 'http', status: 400, code: 'idempotency_key_required' } });

  const plan = planRetry({ method: 'POST', status: 503, attempt: 1 });
  expect(plan).toEqual({ retry: false, delayMs: 0, requiresStableIdempotencyKey: true });
  observations.postWithoutKey = { serverStatus: 400, plan };

  const after = await readIncident();
  expect(after.history).toHaveLength(2);
}, 15000);

test('persistent 500 stops after four requests with finite progressive delays', async () => {
  const outcome = await runBounded('/v1/incidents', 'server_error');
  expect(outcome.requests).toBe(4);
  expect(outcome.stoppedAtAttempt).toBe(4);
  expect(outcome.plannedDelaysMs).toEqual([1000, 2000, 4000]);
  expect(outcome.plannedDelaysMs.every((delay) => Number.isFinite(delay) && delay <= 30000)).toBe(true);
  observations.boundedServerError = {
    requests: outcome.requests,
    plannedDelaysMs: outcome.plannedDelaysMs,
    stoppedAtAttempt: outcome.stoppedAtAttempt,
  };
}, 15000);

test('persistent 429 honors the Retry-After header and still stops after four requests', async () => {
  const outcome = await runBounded('/v1/incidents', 'rate_limited');
  expect(outcome.lastRetryAfter).toBe('1');
  expect(outcome.requests).toBe(4);
  expect(outcome.stoppedAtAttempt).toBe(4);
  expect(outcome.plannedDelaysMs).toEqual([1000, 1000, 1000]);
  observations.boundedRateLimited = {
    requests: outcome.requests,
    retryAfterHeader: outcome.lastRetryAfter,
    plannedDelaysMs: outcome.plannedDelaysMs,
    stoppedAtAttempt: outcome.stoppedAtAttempt,
  };
}, 15000);
