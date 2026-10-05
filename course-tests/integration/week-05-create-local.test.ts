import { request as nodeRequest } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';

import { CreateIncidencia } from '../../src/application/usecases/CreateIncidencia';
import type { NewIncidentInput } from '../../src/domain/models/NewIncident';
import { IncidenciaApiRepository } from '../../src/infrastructure/api/IncidenciaApiRepository';
import { CourseHttpClient, type FetchLike } from '../../src/infrastructure/http/CourseHttpClient';

// HTTP real con node:http: Jest sustituye global.fetch (misma técnica que week-05-client-local).
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
      resolve({
        ok: status >= 200 && status < 300,
        status,
        headers: {} as Headers,
        text: async () => text,
      } as unknown as Response);
    });
  });

  request.on('error', reject);
  init.signal?.addEventListener('abort', () => request.destroy(new Error('aborted')), { once: true });
  if (typeof init.body === 'string') request.write(init.body);
  request.end();
});

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

function repository(actorId: string, scenario = 'success', timeoutMs = 3000): IncidenciaApiRepository {
  return new IncidenciaApiRepository(new CourseHttpClient({
    baseUrl,
    actorId,
    scenario,
    timeoutMs,
    fetchImpl: nodeHttpFetch,
    logger: jest.fn(),
  }));
}

function inputFor(label: string): NewIncidentInput {
  return { category: 'water', description: `Fuga ${label}`, location: `Zona ${label}` };
}

async function countByDescription(description: string): Promise<number> {
  const list = await repository('coordinator-1').getAll();
  if (!list.ok || list.kind !== 'data') throw new Error('unexpected list result');
  return list.incidents.filter((item) => item.description === description).length;
}

describe('creation against the local teaching backend', () => {
  test('201 on the first call and 200 replay with the same key and content, without duplicating', async () => {
    const input = inputFor('replay');
    const first = await repository('reporter-1').create(input, 'replay-key-0001');
    const second = await repository('reporter-1').create(input, 'replay-key-0001');

    expect(first).toMatchObject({ ok: true, kind: 'created', operationId: 'replay-key-0001' });
    expect(second).toMatchObject({ ok: true, kind: 'replayed', operationId: 'replay-key-0001' });
    if (!first.ok || !second.ok) throw new Error('creation failed');
    expect(second.incident.id).toBe(first.incident.id);
    expect(await countByDescription(input.description)).toBe(1);
  }, 15000);

  test('409 when the same key is reused with different content, and nothing new is stored', async () => {
    const original = inputFor('conflict-a');
    const different = inputFor('conflict-b');
    await repository('reporter-1').create(original, 'conflict-key-0001');

    await expect(repository('reporter-1').create(different, 'conflict-key-0001'))
      .resolves.toEqual({ ok: false, error: { kind: 'idempotency_conflict' } });
    expect(await countByDescription(different.description)).toBe(0);
  }, 15000);

  test('403 for a role that cannot create and 422 for a rejected body', async () => {
    await expect(repository('technician-1').create(inputFor('forbidden'), 'forbidden-key-0001'))
      .resolves.toEqual({ ok: false, error: { kind: 'http', status: 403, code: 'forbidden' } });
    await expect(repository('reporter-1').create({ ...inputFor('invalid'), category: 'plumbing' as never }, 'invalid-key-0001'))
      .resolves.toEqual({ ok: false, error: { kind: 'http', status: 422, code: 'invalid_incident' } });
  }, 15000);

  test('500 is a controlled HTTP error', async () => {
    await expect(repository('reporter-1', 'server_error').create(inputFor('error'), 'error-key-00001'))
      .resolves.toEqual({ ok: false, error: { kind: 'http', status: 500, code: 'controlled_failure' } });
  }, 15000);

  test('timeout after commit is uncertain; retrying with the same key replays the same incident once', async () => {
    const input = inputFor('lost-response');
    const lost = await repository('reporter-1', 'timeout_after_commit', 200).create(input, 'lost-key-000001');
    expect(lost).toEqual({ ok: false, error: { kind: 'uncertain', cause: 'timeout' } });

    const reconciled = await repository('reporter-1').create(input, 'lost-key-000001');
    expect(reconciled).toMatchObject({ ok: true, kind: 'replayed', operationId: 'lost-key-000001' });
    expect(await countByDescription(input.description)).toBe(1);
  }, 15000);

  test('use case keeps its key through a lost response and reconciles without duplicating', async () => {
    const input = inputFor('use-case');
    const keys: string[] = [];
    let attempts = 0;
    // Primer intento con timeout posterior al commit; el reintento usa un cliente normal.
    const lossy = repository('reporter-1', 'timeout_after_commit', 200);
    const healthy = repository('reporter-1');
    const switching = {
      getAll: () => healthy.getAll(),
      getById: (id: string) => healthy.getById(id),
      create: (value: NewIncidentInput, key: string) => {
        keys.push(key);
        attempts += 1;
        return (attempts === 1 ? lossy : healthy).create(value, key);
      },
    };
    const useCase = new CreateIncidencia(switching);

    await expect(useCase.submit(input)).resolves.toEqual({ ok: false, error: { kind: 'uncertain', cause: 'timeout' } });
    expect(useCase.hasPendingOperation).toBe(true);
    await expect(useCase.submit(input)).resolves.toMatchObject({ ok: true, kind: 'replayed' });

    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    expect(useCase.hasPendingOperation).toBe(false);
    expect(await countByDescription(input.description)).toBe(1);
  }, 15000);
});
