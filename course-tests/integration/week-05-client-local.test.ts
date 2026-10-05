import { request as nodeRequest } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';

import { IncidenciaApiRepository } from '../../src/infrastructure/api/IncidenciaApiRepository';
import { CourseHttpClient, type FetchLike } from '../../src/infrastructure/http/CourseHttpClient';

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

function repository(actorId: string, scenario: string, timeoutMs = 3000): IncidenciaApiRepository {
  return new IncidenciaApiRepository(new CourseHttpClient({
    baseUrl,
    actorId,
    scenario,
    timeoutMs,
    fetchImpl: nodeHttpFetch,
    logger: jest.fn(),
  }));
}

test('real client queries deterministic local backend variants', async () => {
  await expect(repository('coordinator-1', 'success').getAll())
    .resolves.toMatchObject({ ok: true, kind: 'data' });
  await expect(repository('reporter-1', 'nullable').getById('campus-inc-001'))
    .resolves.toMatchObject({ ok: true, kind: 'payload_absent' });
  await expect(repository('coordinator-1', 'malformed').getAll())
    .resolves.toEqual({ ok: false, error: { kind: 'invalid_json' } });
  await expect(repository('coordinator-1', 'slow', 100).getAll())
    .resolves.toEqual({ ok: false, error: { kind: 'timeout' } });
  await expect(repository('coordinator-1', 'server_error').getAll())
    .resolves.toEqual({
      ok: false,
      error: { kind: 'http', status: 500, code: 'controlled_failure' },
    });
}, 15000);
