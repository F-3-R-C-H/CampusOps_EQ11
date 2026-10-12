import { coordinateRefresh } from '../course-evaluation';

describe('coordinateRefresh', () => {
  test('starts with an anonymous session and no refresh activity', () => {
    expect(coordinateRefresh([])).toEqual({
      status: 'anonymous',
      activeGeneration: null,
      refreshCalls: 0,
      retriedRequestIds: [],
      persistedToken: null,
    });
  });

  test('coalesces concurrent 401 responses and retries each request after success', () => {
    expect(coordinateRefresh([
      { type: 'request401', requestId: 'list', generation: 0 },
      { type: 'request401', requestId: 'detail', generation: 0 },
      { type: 'request401', requestId: 'create', generation: 0 },
      { type: 'refreshSucceeded', generation: 1, token: 'synthetic-access-1' },
    ])).toEqual({
      status: 'authenticated',
      activeGeneration: 1,
      refreshCalls: 1,
      retriedRequestIds: ['list', 'detail', 'create'],
      persistedToken: 'synthetic-access-1',
    });
  });

  test('records a waiting request only once', () => {
    const summary = coordinateRefresh([
      { type: 'request401', requestId: 'list', generation: 4 },
      { type: 'request401', requestId: 'list', generation: 4 },
      { type: 'refreshSucceeded', generation: 5, token: 'synthetic-access-5' },
    ]);

    expect(summary.refreshCalls).toBe(1);
    expect(summary.retriedRequestIds).toEqual(['list']);
  });

  test('returns to anonymous and does not retry when refresh fails', () => {
    expect(coordinateRefresh([
      { type: 'request401', requestId: 'list', generation: 0 },
      { type: 'request401', requestId: 'detail', generation: 0 },
      { type: 'refreshFailed', generation: 0 },
    ])).toEqual({
      status: 'anonymous',
      activeGeneration: null,
      refreshCalls: 1,
      retriedRequestIds: [],
      persistedToken: null,
    });
  });

  test('logout clears the represented persisted session', () => {
    expect(coordinateRefresh([
      { type: 'request401', requestId: 'list', generation: 0 },
      { type: 'refreshSucceeded', generation: 1, token: 'synthetic-access-1' },
      { type: 'logout' },
    ])).toEqual({
      status: 'anonymous',
      activeGeneration: null,
      refreshCalls: 1,
      retriedRequestIds: [],
      persistedToken: null,
    });
  });

  test('logout prevents a late refresh result from restoring the session', () => {
    const summary = coordinateRefresh([
      { type: 'request401', requestId: 'list', generation: 0 },
      { type: 'logout' },
      { type: 'refreshSucceeded', generation: 1, token: 'synthetic-late-access' },
    ]);

    expect(summary.status).toBe('anonymous');
    expect(summary.activeGeneration).toBeNull();
    expect(summary.persistedToken).toBeNull();
    expect(summary.retriedRequestIds).toEqual([]);
  });

  test('does not let an obsolete refresh result replace a newer active generation', () => {
    expect(coordinateRefresh([
      { type: 'request401', requestId: 'first', generation: 0 },
      { type: 'refreshSucceeded', generation: 2, token: 'synthetic-access-2' },
      { type: 'request401', requestId: 'second', generation: 2 },
      { type: 'refreshSucceeded', generation: 1, token: 'synthetic-obsolete-access' },
    ])).toEqual({
      status: 'authenticated',
      activeGeneration: 2,
      refreshCalls: 2,
      retriedRequestIds: ['first'],
      persistedToken: 'synthetic-access-2',
    });
  });
});
