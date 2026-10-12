export type SessionEvent = Readonly<{
  type: 'request401' | 'refreshSucceeded' | 'refreshFailed' | 'logout';
  requestId?: string;
  generation?: number;
  token?: string;
}>;

export type SessionSummary = Readonly<{
  status: 'anonymous' | 'authenticated';
  activeGeneration: number | null;
  refreshCalls: number;
  retriedRequestIds: readonly string[];
  persistedToken: string | null;
}>;

function appendOnce(values: readonly string[], value: string): readonly string[] {
  return values.includes(value) ? values : [...values, value];
}

/**
 * Reduces observable authentication events without performing HTTP or storage.
 *
 * A request generation identifies the credentials used by that request. A
 * successful refresh reports the generation of the newly active credentials,
 * so both values are intentionally not required to be equal. Infrastructure
 * may emit these events while its asynchronous coordinator owns the actual
 * single-flight promise, bounded retry and secure persistence.
 */
export function summarizeSessionEvents(events: readonly SessionEvent[]): SessionSummary {
  let status: SessionSummary['status'] = 'anonymous';
  let activeGeneration: number | null = null;
  let refreshCalls = 0;
  let retriedRequestIds: readonly string[] = [];
  let persistedToken: string | null = null;

  let refreshInFlight = false;
  let waitingRequestIds: readonly string[] = [];

  for (const event of events) {
    switch (event.type) {
      case 'request401': {
        if (typeof event.requestId !== 'string' || typeof event.generation !== 'number') break;

        // The request used older credentials and can retry with the generation
        // that is already active; it must not start another refresh.
        if (activeGeneration !== null && event.generation < activeGeneration) {
          retriedRequestIds = appendOnce(retriedRequestIds, event.requestId);
          break;
        }

        if (!refreshInFlight) {
          refreshInFlight = true;
          refreshCalls += 1;
        }
        waitingRequestIds = appendOnce(waitingRequestIds, event.requestId);
        break;
      }

      case 'refreshSucceeded': {
        if (!refreshInFlight) break;
        if (typeof event.generation !== 'number' || typeof event.token !== 'string') break;

        const isNewerResult = activeGeneration === null || event.generation > activeGeneration;
        if (isNewerResult) {
          status = 'authenticated';
          activeGeneration = event.generation;
          persistedToken = event.token;
          for (const requestId of waitingRequestIds) {
            retriedRequestIds = appendOnce(retriedRequestIds, requestId);
          }
        }
        refreshInFlight = false;
        waitingRequestIds = [];
        break;
      }

      case 'refreshFailed':
        if (refreshInFlight || status === 'anonymous') {
          status = 'anonymous';
          activeGeneration = null;
          persistedToken = null;
          retriedRequestIds = [];
        }
        refreshInFlight = false;
        waitingRequestIds = [];
        break;

      case 'logout':
        status = 'anonymous';
        activeGeneration = null;
        persistedToken = null;
        retriedRequestIds = [];
        refreshInFlight = false;
        waitingRequestIds = [];
        break;
    }
  }

  return { status, activeGeneration, refreshCalls, retriedRequestIds, persistedToken };
}
