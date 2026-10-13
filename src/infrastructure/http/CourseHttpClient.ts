import { logWarn } from '../logging/secureLogger';
import type { SessionCoordinator } from '../security/SessionCoordinator';

export type HttpTransportError =
  | Readonly<{ kind: 'timeout' }>
  | Readonly<{ kind: 'network' }>
  | Readonly<{ kind: 'invalid_json' }>
  | Readonly<{ kind: 'http'; status: number; code?: string }>;

export type HttpResult =
  | Readonly<{ ok: true; status: number; data: unknown; headers: Headers }>
  | Readonly<{ ok: false; error: HttpTransportError }>;

export type HttpRequest = Readonly<{
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  headers?: Readonly<Record<string, string>>;
  body?: unknown;
  timeoutMs?: number;
}>;

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
export type TechnicalLogger = (message: string, context: Readonly<Record<string, unknown>>) => void;

export type CourseHttpClientOptions = Readonly<{
  baseUrl: string;
  actorId: string;
  scenario?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
  logger?: TechnicalLogger;
  sessionCoordinator?: SessionCoordinator;
  maxRetries?: number;
}>;

type FetchOutcome =
  | Readonly<{ kind: 'response'; response: Response; text: string }>
  | Readonly<{ kind: 'network' }>
  | Readonly<{ kind: 'timeout' }>;

function parseTechnicalCode(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const code = (value as Record<string, unknown>).code;
  return typeof code === 'string' && /^[a-z0-9_]+$/i.test(code) ? code : undefined;
}

export class CourseHttpClient {
  private readonly baseUrl: string;
  private readonly actorId: string;
  private readonly scenario: string | undefined;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;
  private readonly logger: TechnicalLogger;
  private readonly sessionCoordinator: SessionCoordinator | undefined;
  private readonly maxRetries: number;

  constructor(options: CourseHttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.actorId = options.actorId;
    this.scenario = options.scenario;
    this.timeoutMs = options.timeoutMs ?? 3000;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.logger = options.logger ?? logWarn;
    this.sessionCoordinator = options.sessionCoordinator;
    this.maxRetries = options.maxRetries ?? 1;
  }

  async requestJson(
    request: HttpRequest,
    attempt = 0,
    requestGeneration?: number,
  ): Promise<HttpResult> {
    const controller = new AbortController();
    const timeoutMs = request.timeoutMs ?? this.timeoutMs;
    let timer: ReturnType<typeof setTimeout> | undefined;

    let authHeader = 'Bearer course-valid-token';
    const activeGeneration =
      requestGeneration ?? this.sessionCoordinator?.getActiveGeneration() ?? 0;

    if (this.sessionCoordinator) {
      authHeader = await this.sessionCoordinator.getAuthorizationHeader();
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: authHeader,
      'X-Course-Actor': this.actorId,
      ...(this.scenario ? { 'X-Course-Scenario': this.scenario } : {}),
      ...(request.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...request.headers,
    };

    const fetchOutcome: Promise<FetchOutcome> = Promise.resolve()
      .then(() =>
        this.fetchImpl(`${this.baseUrl}${request.path}`, {
          method: request.method,
          headers,
          signal: controller.signal,
          ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
        }),
      )
      .then(
        async (response): Promise<FetchOutcome> => {
          try {
            return { kind: 'response', response, text: await response.text() };
          } catch {
            return { kind: 'network' };
          }
        },
        (): FetchOutcome => ({ kind: 'network' }),
      );

    const timeoutOutcome = new Promise<FetchOutcome>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ kind: 'timeout' });
      }, timeoutMs);
    });

    try {
      const outcome = await Promise.race([fetchOutcome, timeoutOutcome]);
      if (outcome.kind === 'timeout') {
        return this.fail(request, { kind: 'timeout' });
      }
      if (outcome.kind === 'network') {
        return this.fail(request, { kind: 'network' });
      }

      const response = outcome.response;
      let data: unknown = null;
      let validJson = true;
      try {
        data = outcome.text.length === 0 ? null : JSON.parse(outcome.text);
      } catch {
        validJson = false;
      }

      if (!response.ok) {
        const code = validJson ? parseTechnicalCode(data) : undefined;

        // Si recibimos 401 y hay SessionCoordinator configurado, coordinar renovación
        if (response.status === 401 && this.sessionCoordinator) {
          if (attempt >= this.maxRetries) {
            this.logger('course_http_retry_aborted', {
              method: request.method,
              path: request.path,
              reason: 'max_retries_exceeded',
              attempt,
            });
            return this.fail(request, {
              kind: 'http',
              status: response.status,
              ...(code ? { code } : {}),
            });
          }

          const refreshOutcome = await this.sessionCoordinator.coordinateRefresh(activeGeneration);
          if (refreshOutcome.ok) {
            return this.requestJson(request, attempt + 1, refreshOutcome.activeGeneration);
          }
        }

        return this.fail(request, {
          kind: 'http',
          status: response.status,
          ...(code ? { code } : {}),
        });
      }
      if (!validJson) {
        return this.fail(request, { kind: 'invalid_json' });
      }
      return { ok: true, status: response.status, data, headers: response.headers };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private fail(request: HttpRequest, error: HttpTransportError): HttpResult {
    this.logger('course_http_request_failed', {
      method: request.method,
      path: request.path,
      errorKind: error.kind,
      ...(error.kind === 'http' ? { status: error.status, code: error.code } : {}),
    });
    return { ok: false, error };
  }
}

