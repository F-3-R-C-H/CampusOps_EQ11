import { CourseHttpClient, type FetchLike } from '../infrastructure/http/CourseHttpClient';

function fakeResponse(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn().mockResolvedValue(body),
    headers: {} as Headers,
  } as unknown as Response;
}

describe('CourseHttpClient', () => {
  test('sends course headers and allows caller-provided JSON headers for future writes', async () => {
    const fetchImpl = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>()
      .mockResolvedValue(fakeResponse(200, '{"ok":true}'));
    const client = new CourseHttpClient({
      baseUrl: 'http://local.test/',
      actorId: 'reporter-1',
      scenario: 'success',
      fetchImpl,
    });

    await expect(client.requestJson({
      method: 'POST',
      path: '/v1/future-write',
      headers: { 'Idempotency-Key': 'provided-by-caller' },
      body: { sample: true },
    })).resolves.toMatchObject({ ok: true, status: 200, data: { ok: true } });

    expect(fetchImpl).toHaveBeenCalledWith('http://local.test/v1/future-write', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer course-valid-token',
        'X-Course-Actor': 'reporter-1',
        'X-Course-Scenario': 'success',
        'Idempotency-Key': 'provided-by-caller',
        'Content-Type': 'application/json',
      }),
      body: '{"sample":true}',
    }));
  });

  test('distinguishes syntactically invalid JSON on a successful response', async () => {
    const client = new CourseHttpClient({
      baseUrl: 'http://local.test',
      actorId: 'reporter-1',
      fetchImpl: jest.fn().mockResolvedValue(fakeResponse(200, '{"items": [')) as FetchLike,
      logger: jest.fn(),
    });
    await expect(client.requestJson({ method: 'GET', path: '/v1/incidents' }))
      .resolves.toEqual({ ok: false, error: { kind: 'invalid_json' } });
  });

  test.each([
    [403, 'forbidden'],
    [404, 'not_found'],
    [500, 'controlled_failure'],
  ])('preserves HTTP %i and its technical code', async (status, code) => {
    const client = new CourseHttpClient({
      baseUrl: 'http://local.test',
      actorId: 'reporter-1',
      fetchImpl: jest.fn().mockResolvedValue(fakeResponse(status, JSON.stringify({ code }))) as FetchLike,
      logger: jest.fn(),
    });
    await expect(client.requestJson({ method: 'GET', path: '/v1/incidents/item' }))
      .resolves.toEqual({ ok: false, error: { kind: 'http', status, code } });
  });

  test('represents a rejected fetch as a network failure', async () => {
    const client = new CourseHttpClient({
      baseUrl: 'http://local.test',
      actorId: 'reporter-1',
      fetchImpl: jest.fn().mockRejectedValue(new Error('synthetic disconnect')) as FetchLike,
      logger: jest.fn(),
    });
    await expect(client.requestJson({ method: 'GET', path: '/v1/incidents' }))
      .resolves.toEqual({ ok: false, error: { kind: 'network' } });
  });

  test('aborts at the configured timeout and ignores a later response', async () => {
    jest.useFakeTimers();
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetchImpl: FetchLike = jest.fn(() => new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    const client = new CourseHttpClient({
      baseUrl: 'http://local.test',
      actorId: 'reporter-1',
      timeoutMs: 100,
      fetchImpl,
      logger: jest.fn(),
    });

    const request = client.requestJson({ method: 'GET', path: '/v1/incidents' });
    await jest.advanceTimersByTimeAsync(100);
    await expect(request).resolves.toEqual({ ok: false, error: { kind: 'timeout' } });
    resolveFetch?.(fakeResponse(200, '{"items":[]}'));
    await jest.runAllTimersAsync();
    await expect(request).resolves.toEqual({ ok: false, error: { kind: 'timeout' } });
    jest.useRealTimers();
  });

  test('keeps the timeout active while reading the body and contains a later rejection', async () => {
    jest.useFakeTimers();
    let rejectBody: ((reason: Error) => void) | undefined;
    const response = {
      ok: true,
      status: 200,
      headers: {} as Headers,
      text: jest.fn(() => new Promise<string>((_resolve, reject) => {
        rejectBody = reject;
      })),
    } as unknown as Response;
    const client = new CourseHttpClient({
      baseUrl: 'http://local.test',
      actorId: 'reporter-1',
      timeoutMs: 100,
      fetchImpl: jest.fn().mockResolvedValue(response) as FetchLike,
      logger: jest.fn(),
    });

    const request = client.requestJson({ method: 'GET', path: '/v1/incidents' });
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(100);
    await expect(request).resolves.toEqual({ ok: false, error: { kind: 'timeout' } });
    rejectBody?.(new Error('late body failure'));
    await Promise.resolve();
    await expect(request).resolves.toEqual({ ok: false, error: { kind: 'timeout' } });
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });

  test('clears the timeout timer after success and network failure', async () => {
    jest.useFakeTimers();
    const successClient = new CourseHttpClient({
      baseUrl: 'http://local.test',
      actorId: 'reporter-1',
      fetchImpl: jest.fn().mockResolvedValue(fakeResponse(200, '{}')) as FetchLike,
      logger: jest.fn(),
    });
    await successClient.requestJson({ method: 'GET', path: '/v1/incidents' });
    expect(jest.getTimerCount()).toBe(0);

    const failureClient = new CourseHttpClient({
      baseUrl: 'http://local.test',
      actorId: 'reporter-1',
      fetchImpl: jest.fn().mockRejectedValue(new Error('disconnect')) as FetchLike,
      logger: jest.fn(),
    });
    await failureClient.requestJson({ method: 'GET', path: '/v1/incidents' });
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });

  test('default logging excludes authorization and remote bodies', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const client = new CourseHttpClient({
      baseUrl: 'http://local.test',
      actorId: 'reporter-1',
      fetchImpl: jest.fn().mockResolvedValue(fakeResponse(500, JSON.stringify({
        code: 'controlled_failure',
        token: 'remote-sensitive-value',
      }))) as FetchLike,
    });

    await client.requestJson({ method: 'GET', path: '/v1/incidents' });
    const output = warning.mock.calls.flat().join(' ');
    expect(output).toContain('course_http_request_failed');
    expect(output).not.toContain('course-valid-token');
    expect(output).not.toContain('remote-sensitive-value');
    warning.mockRestore();
  });
});
