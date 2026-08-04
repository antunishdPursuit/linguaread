import { describe, expect, it, vi } from 'vitest';
import { handleRequest } from './index';

const allowedOrigin = 'chrome-extension://abcdefghijklmnop';
const apiKey = 'private-server-key';

const validRequest = {
  candidates: [
    {
      gloss: 'a new idea or method',
      id: 'freedict:innovation:1',
      kind: 'mandarin',
      value: '创新',
    },
    {
      gloss: 'a new idea',
      id: 'wordnet:new-idea',
      kind: 'simpler_english',
      value: 'new idea',
    },
  ],
  level: 'B2',
  sentence: 'The company invested in innovation.',
  word: 'innovation',
};

function interactionWithResult(result: unknown) {
  return {
    steps: [
      {
        content: [{ text: JSON.stringify(result), type: 'text' }],
        type: 'model_output',
      },
    ],
  };
}

function validProviderResult() {
  return {
    candidateId: 'freedict:innovation:1',
    confidence: 0.94,
    decision: 'use_candidate',
    reason: 'This candidate preserves the meaning in the sentence.',
    tokenType: 'common_word',
  };
}

function createRequest(
  body: unknown = validRequest,
  options: {
    clientId?: string;
    method?: string;
    origin?: string;
  } = {},
) {
  return new Request('https://broker.example/v1/word-help', {
    method: options.method ?? 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: options.origin ?? allowedOrigin,
      'X-LinguaRead-Client':
        options.clientId ?? 'test-client-1234567890',
    },
    body:
      (options.method ?? 'POST') === 'POST'
        ? JSON.stringify(body)
        : undefined,
  });
}

function createCache() {
  const values = new Map<string, Response>();
  return {
    match: vi.fn(async (request: Request) =>
      values.get(request.url)?.clone(),
    ),
    put: vi.fn(async (request: Request, response: Response) => {
      values.set(request.url, response.clone());
    }),
  };
}

function createContext() {
  const pending: Promise<unknown>[] = [];
  return {
    pending,
    waitUntil(promise: Promise<unknown>) {
      pending.push(promise);
    },
  };
}

function createEnv(rateLimitSuccess = true, key = apiKey) {
  return {
    ALLOWED_ORIGIN: allowedOrigin,
    GEMINI_API_KEY: key,
    RATE_LIMITER: {
      limit: vi.fn().mockResolvedValue({ success: rateLimitSuccess }),
    },
  };
}

function successfulProvider() {
  return vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify(interactionWithResult(validProviderResult())),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      },
    ),
  );
}

describe('Cloudflare language broker', () => {
  it('validates, calls Gemini 3.5 Flash, and returns a bounded result', async () => {
    const providerFetch = successfulProvider();
    const context = createContext();

    const response = await handleRequest(
      createRequest(),
      createEnv(),
      context,
      { fetch: providerFetch },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('X-LinguaRead-Cache')).toBe('MISS');
    await expect(response.json()).resolves.toMatchObject({
      model: 'gemini-3.5-flash',
      promptVersion: 'candidate-selector-v1',
      result: validProviderResult(),
    });

    const [, providerOptions] = providerFetch.mock.calls[0];
    expect(providerOptions?.headers).toMatchObject({
      'x-goog-api-key': apiKey,
    });
    expect(providerOptions?.body).not.toContain(apiKey);
    expect(providerOptions?.body).toContain('freedict:innovation:1');
  });

  it('serves a validated cached result without a second provider call', async () => {
    const providerFetch = successfulProvider();
    const cache = createCache();
    const firstContext = createContext();

    const first = await handleRequest(
      createRequest(),
      createEnv(),
      firstContext,
      { cache, fetch: providerFetch },
    );
    expect(first.status).toBe(200);
    await Promise.all(firstContext.pending);

    const second = await handleRequest(
      createRequest(),
      createEnv(),
      createContext(),
      { cache, fetch: providerFetch },
    );

    expect(second.status).toBe(200);
    expect(second.headers.get('X-LinguaRead-Cache')).toBe('HIT');
    expect(providerFetch).toHaveBeenCalledTimes(1);
  });

  it('rejects unexpected request fields before calling the provider', async () => {
    const providerFetch = successfulProvider();
    const response = await handleRequest(
      createRequest({ ...validRequest, fullPdf: 'not allowed' }),
      createEnv(),
      createContext(),
      { fetch: providerFetch },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'invalid_request',
    });
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('rejects a request from an unapproved origin', async () => {
    const providerFetch = successfulProvider();
    const response = await handleRequest(
      createRequest(validRequest, { origin: 'https://example.com' }),
      createEnv(),
      createContext(),
      { fetch: providerFetch },
    );

    expect(response.status).toBe(403);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('fails safely when the server secret is missing', async () => {
    const providerFetch = successfulProvider();
    const response = await handleRequest(
      createRequest(),
      createEnv(true, '  '),
      createContext(),
      { fetch: providerFetch },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'server_not_configured',
    });
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('rejects a rate-limited client before calling the provider', async () => {
    const providerFetch = successfulProvider();
    const response = await handleRequest(
      createRequest(),
      createEnv(false),
      createContext(),
      { fetch: providerFetch },
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: 'rate_limited',
    });
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('rejects a provider candidate that was not supplied', async () => {
    const providerFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify(
          interactionWithResult({
            ...validProviderResult(),
            candidateId: 'invented:translation',
          }),
        ),
        { status: 200 },
      ),
    );

    const response = await handleRequest(
      createRequest(),
      createEnv(),
      createContext(),
      { fetch: providerFetch },
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: 'provider_invalid',
    });
  });

  it.each([
    [400, 'provider_request_rejected'],
    [401, 'provider_auth_failed'],
    [403, 'provider_permission_denied'],
    [404, 'provider_model_unavailable'],
    [429, 'provider_rate_limited'],
    [500, 'provider_unavailable'],
  ])(
    'returns a safe provider error for status %i',
    async (status, expectedError) => {
      const providerFetch = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('private provider details', { status }));

      const response = await handleRequest(
        createRequest(),
        createEnv(),
        createContext(),
        { fetch: providerFetch },
      );
      const body = await response.text();

      expect(response.status).toBe(502);
      expect(body).toBe(JSON.stringify({ error: expectedError }));
      expect(body).not.toContain('private provider details');
      expect(body).not.toContain(apiKey);
    },
  );

  it.each([
    ['Your API key was reported as leaked.', 'provider_key_blocked'],
    [
      'ACCESS_TOKEN_TYPE_UNSUPPORTED',
      'provider_auth_key_unsupported',
    ],
    [
      'Your project has been denied access.',
      'provider_project_denied',
    ],
    [
      'Generative Language API has not been used in this project or it is disabled.',
      'provider_api_disabled',
    ],
  ])(
    'classifies a 403 provider response without exposing its message',
    async (providerMessage, expectedError) => {
      const providerFetch = vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(
          { error: { code: 403, message: providerMessage } },
          { status: 403 },
        ),
      );

      const response = await handleRequest(
        createRequest(),
        createEnv(),
        createContext(),
        { fetch: providerFetch },
      );
      const body = await response.text();

      expect(response.status).toBe(502);
      expect(body).toBe(JSON.stringify({ error: expectedError }));
      expect(body).not.toContain(providerMessage);
      expect(body).not.toContain(apiKey);
    },
  );

  it('returns a safe timeout without exposing the key', async () => {
    const providerFetch = vi.fn<typeof fetch>(
      (_input, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );

    const response = await handleRequest(
      createRequest(),
      createEnv(),
      createContext(),
      { fetch: providerFetch, providerTimeoutMs: 1 },
    );
    const body = await response.text();

    expect(response.status).toBe(504);
    expect(body).toContain('provider_timeout');
    expect(body).not.toContain(apiKey);
  });

  it('supports CORS preflight only for the approved extension origin', async () => {
    const response = await handleRequest(
      createRequest(undefined, { method: 'OPTIONS' }),
      createEnv(),
      createContext(),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
      allowedOrigin,
    );
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain(
      'X-LinguaRead-Client',
    );
  });
});
