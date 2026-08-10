import {
  BROKER_PROVIDER_MODEL,
  BROKER_PROMPT_VERSION,
  BROKER_RESPONSE_MODEL,
  BrokerValidationError,
  MAX_REQUEST_BYTES,
  parseBrokerRequest,
  type BrokerRequest,
  type BrokerResult,
} from './contract';
import {
  GeminiRequestError,
  requestGeminiSelection,
} from './gemini';
import {
  DAILY_ANALYSIS_LIMIT,
  DailyAnalysisAllowance,
  type DailyAllowanceReservation,
} from './dailyAllowance';

export { DailyAnalysisAllowance };

const WORD_HELP_PATH = '/v1/word-help';
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const PROVIDER_TIMEOUT_MS = 12_000;

type RateLimiter = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

type DailyAllowanceStub = Pick<
  DailyAnalysisAllowance,
  'commit' | 'release' | 'reserve'
>;

type DailyAllowanceNamespace = {
  getByName(name: string): DailyAllowanceStub;
};

type WorkerEnv = {
  ALLOWED_ORIGIN?: string;
  ALLOWED_ORIGINS?: string;
  DAILY_ALLOWANCE: DailyAllowanceNamespace;
  DAILY_ALLOWANCE_ENABLED: string;
  GEMINI_API_KEY: string;
  RATE_LIMITER: RateLimiter;
};

type CacheLike = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};

type CacheStorageLike = {
  default?: CacheLike;
};

type BrokerDependencies = {
  cache?: CacheLike;
  fetch: typeof fetch;
  now: () => number;
  providerTimeoutMs: number;
};

type ExecutionContextLike = {
  waitUntil(promise: Promise<unknown>): void;
};

class DailyAllowanceUnavailableError extends Error {}

function jsonResponse(
  body: unknown,
  status: number,
  origin?: string,
  extraHeaders: Record<string, string> = {},
): Response {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    ...extraHeaders,
  });

  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }

  return new Response(JSON.stringify(body), { headers, status });
}

function errorResponse(
  code: string,
  status: number,
  origin?: string,
  extraHeaders: Record<string, string> = {},
): Response {
  return jsonResponse({ error: code }, status, origin, extraHeaders);
}

function resolveDefaultCache(): CacheLike | undefined {
  const cacheStorage = (globalThis as { caches?: CacheStorageLike })
    .caches;
  return cacheStorage?.default;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function configuredOrigins(env: WorkerEnv): Set<string> {
  const origins = [env.ALLOWED_ORIGIN, env.ALLOWED_ORIGINS]
    .filter((value): value is string => typeof value === 'string')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);

  if (
    origins.length === 0 ||
    origins.some(
      (origin) => !/^chrome-extension:\/\/[a-p]{32}$/.test(origin),
    )
  ) {
    throw new Error('server_not_configured');
  }

  return new Set(origins);
}

function requireAllowedOrigin(request: Request, env: WorkerEnv): string {
  const origin = request.headers.get('Origin');
  if (!origin || !configuredOrigins(env).has(origin)) {
    throw new Error('origin_not_allowed');
  }

  return origin;
}

function requireDailyAllowanceSetting(env: WorkerEnv): boolean {
  if (env.DAILY_ALLOWANCE_ENABLED === 'true') return true;
  if (env.DAILY_ALLOWANCE_ENABLED === 'false') return false;
  throw new Error('server_not_configured');
}

async function createCacheRequest(request: BrokerRequest): Promise<Request> {
  const canonicalValue = JSON.stringify({
    candidates: request.candidates,
    level: request.level,
    model: BROKER_PROVIDER_MODEL,
    promptVersion: BROKER_PROMPT_VERSION,
    sentence: request.sentence,
    word: request.word,
  });
  const hash = await sha256Hex(canonicalValue);

  // The cache key contains only a digest so selected PDF text is not placed in
  // a URL, log, or Cloudflare cache index.
  return new Request(`https://linguaread.internal/word-help/${hash}`);
}

type ReservedDailyAllowance = DailyAllowanceReservation & {
  reservationId: string;
  stub: DailyAllowanceStub;
};

async function reserveDailyAllowance(
  clientId: string,
  env: WorkerEnv,
  nowMs: number,
): Promise<ReservedDailyAllowance> {
  const installationKey = await sha256Hex(clientId);
  const stub = env.DAILY_ALLOWANCE.getByName(installationKey);
  const reservationId = crypto.randomUUID();
  const reservation = await stub.reserve(reservationId, nowMs);
  return { ...reservation, reservationId, stub };
}

async function readJsonBody(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    throw new BrokerValidationError('The request is too large.');
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
    throw new BrokerValidationError('The request is too large.');
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new BrokerValidationError('The request body is not valid JSON.');
  }
}

async function requestProvider(
  request: BrokerRequest,
  env: WorkerEnv,
  dependencies: BrokerDependencies,
): Promise<BrokerResult> {
  if (env.GEMINI_API_KEY.trim() === '') {
    throw new Error('server_not_configured');
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    dependencies.providerTimeoutMs,
  );

  try {
    return await requestGeminiSelection(
      request,
      env.GEMINI_API_KEY,
      controller.signal,
      dependencies.fetch,
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function handleWordHelp(
  request: Request,
  env: WorkerEnv,
  context: ExecutionContextLike,
  dependencies: BrokerDependencies,
  origin: string,
  dailyAllowanceEnabled: boolean,
): Promise<Response> {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) {
    return errorResponse('content_type_required', 415, origin);
  }

  const clientId = request.headers.get('X-LinguaRead-Client') ?? '';
  if (!CLIENT_ID_PATTERN.test(clientId)) {
    return errorResponse('client_id_required', 400, origin);
  }

  const rateLimit = await env.RATE_LIMITER.limit({ key: clientId });
  if (!rateLimit.success) {
    return errorResponse('rate_limited', 429, origin);
  }

  let parsedRequest: BrokerRequest;
  try {
    parsedRequest = parseBrokerRequest(await readJsonBody(request));
  } catch (error) {
    if (error instanceof BrokerValidationError) {
      return errorResponse('invalid_request', 400, origin);
    }
    return errorResponse('request_unreadable', 400, origin);
  }

  const cacheRequest = await createCacheRequest(parsedRequest);
  const cached = await dependencies.cache?.match(cacheRequest);
  if (cached) {
    return jsonResponse(await cached.json(), 200, origin, {
      'X-LinguaRead-Cache': 'HIT',
    });
  }

  let allowance: ReservedDailyAllowance | undefined;
  if (dailyAllowanceEnabled) {
    try {
      allowance = await reserveDailyAllowance(
        clientId,
        env,
        dependencies.now(),
      );
    } catch {
      return errorResponse('allowance_unavailable', 503, origin);
    }
    if (!allowance.allowed) {
      return jsonResponse(
        {
          error: 'daily_limit_reached',
          limit: DAILY_ANALYSIS_LIMIT,
          resetAt: allowance.resetAt,
        },
        429,
        origin,
      );
    }
  }

  let allowanceCommitted = false;
  try {
    const result = await requestProvider(parsedRequest, env, dependencies);
    if (allowance) {
      const commit = await allowance.stub.commit(
        allowance.reservationId,
        dependencies.now(),
      );
      if (!commit.committed) {
        throw new DailyAllowanceUnavailableError();
      }
      allowanceCommitted = true;
    }
    const responseBody = {
      model: BROKER_RESPONSE_MODEL,
      promptVersion: BROKER_PROMPT_VERSION,
      result,
    };
    const cacheResponse = jsonResponse(responseBody, 200);
    cacheResponse.headers.set('Cache-Control', 'public, max-age=86400');
    if (dependencies.cache) {
      context.waitUntil(
        dependencies.cache.put(cacheRequest, cacheResponse.clone()),
      );
    }

    return jsonResponse(responseBody, 200, origin, {
      'X-LinguaRead-Cache': 'MISS',
    });
  } catch (error) {
    if (allowance && !allowanceCommitted) {
      await allowance.stub
        .release(allowance.reservationId, dependencies.now())
        .catch(() => undefined);
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      return errorResponse('provider_timeout', 504, origin);
    }
    if (error instanceof BrokerValidationError) {
      return errorResponse('provider_invalid', 502, origin);
    }
    if (error instanceof Error && error.message === 'server_not_configured') {
      return errorResponse('server_not_configured', 503, origin);
    }
    if (error instanceof DailyAllowanceUnavailableError) {
      return errorResponse('allowance_unavailable', 503, origin);
    }
    if (error instanceof GeminiRequestError) {
      if (error.status === 400) {
        return errorResponse('provider_request_rejected', 502, origin);
      }
      if (error.status === 401) {
        if (error.reason === 'auth_key_unsupported') {
          return errorResponse(
            'provider_auth_key_unsupported',
            502,
            origin,
          );
        }
        if (error.reason === 'key_blocked') {
          return errorResponse('provider_key_blocked', 502, origin);
        }
        return errorResponse('provider_auth_failed', 502, origin);
      }
      if (error.status === 403) {
        const safeErrorByReason = {
          api_disabled: 'provider_api_disabled',
          auth_key_unsupported: 'provider_auth_key_unsupported',
          key_blocked: 'provider_key_blocked',
          permission_denied: 'provider_permission_denied',
          project_denied: 'provider_project_denied',
          unknown: 'provider_permission_denied',
        } as const;
        return errorResponse(
          safeErrorByReason[error.reason],
          502,
          origin,
        );
      }
      if (error.status === 404) {
        return errorResponse('provider_model_unavailable', 502, origin);
      }
      if (error.status === 429) {
        return errorResponse('provider_rate_limited', 502, origin);
      }
    }
    return errorResponse('provider_unavailable', 502, origin);
  }
}

export async function handleRequest(
  request: Request,
  env: WorkerEnv,
  context: ExecutionContextLike,
  dependencies: Partial<BrokerDependencies> = {},
): Promise<Response> {
  const resolvedDependencies: BrokerDependencies = {
    cache: dependencies.cache ?? resolveDefaultCache(),
    fetch: dependencies.fetch ?? fetch,
    now: dependencies.now ?? Date.now,
    providerTimeoutMs:
      dependencies.providerTimeoutMs ?? PROVIDER_TIMEOUT_MS,
  };
  const url = new URL(request.url);

  if (url.pathname !== WORD_HELP_PATH) {
    return errorResponse('not_found', 404);
  }

  let origin: string;
  let dailyAllowanceEnabled: boolean;
  try {
    origin = requireAllowedOrigin(request, env);
    dailyAllowanceEnabled = requireDailyAllowanceSetting(env);
  } catch (error) {
    if (error instanceof Error && error.message === 'server_not_configured') {
      return errorResponse('server_not_configured', 503);
    }
    return errorResponse('origin_not_allowed', 403);
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Headers':
          'Content-Type, X-LinguaRead-Client',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      },
    });
  }

  if (request.method !== 'POST') {
    return errorResponse('method_not_allowed', 405, origin, {
      Allow: 'POST, OPTIONS',
    });
  }

  return handleWordHelp(
    request,
    env,
    context,
    resolvedDependencies,
    origin,
    dailyAllowanceEnabled,
  );
}

export default {
  fetch: handleRequest,
};
