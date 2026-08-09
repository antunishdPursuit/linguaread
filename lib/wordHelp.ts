import {
  createLanguageCacheKey,
  BrokerLanguageError,
  requestBrokerWordHelp,
} from './brokerLanguage';
import {
  readCachedLanguageResult,
  writeCachedLanguageResult,
} from './languageResultCache';
import {
  findLocalDictionaryMatch,
  LocalDictionaryUnavailableError,
  type LocalDictionaryMatch,
} from './localDictionary';
import type { LanguageResult } from './types';

const MINIMUM_CONFIDENCE = 0.7;
const REQUEST_TIMEOUT_MS = 15_000;
const pendingRequests = new Map<string, Promise<LanguageResult>>();

export type WordHelpOutcome =
  | {
      result: LanguageResult;
      source: 'broker' | 'cache';
      status: 'ready';
    }
  | {
      message: string;
      reason:
        | 'candidate_rejected'
        | 'daily_limit_reached'
        | 'dictionary_unavailable'
        | 'no_match'
        | 'provider_error';
      status: 'error';
  };

export type WordHelpErrorReason = Extract<
  WordHelpOutcome,
  { status: 'error' }
>['reason'];

export type WordHelpDependencies = {
  findMatch(sourceWord: string): Promise<LocalDictionaryMatch | null>;
  readCache(cacheKey: string): Promise<LanguageResult | null>;
  request(request: {
    match: LocalDictionaryMatch;
    sentenceContext: string;
    signal?: AbortSignal;
    sourceWord: string;
  }): Promise<LanguageResult>;
  writeCache(cacheKey: string, result: LanguageResult): Promise<void>;
};

const defaultDependencies: WordHelpDependencies = {
  findMatch: findLocalDictionaryMatch,
  readCache: readCachedLanguageResult,
  request: requestBrokerWordHelp,
  writeCache: writeCachedLanguageResult,
};

const MAX_BROKER_ATTEMPTS = 2;
const BROKER_RETRY_DELAY_MS = 250;

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'AbortError'
  );
}

function isRetryableBrokerError(error: unknown): boolean {
  if (error instanceof BrokerLanguageError) {
    return (
      error.code === 'request_failed' &&
      (error.status === undefined ||
        error.status === 408 ||
        error.status === 429 ||
        error.status >= 500)
    );
  }

  return error instanceof TypeError || isAbortError(error);
}

function waitForBrokerRetry(): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, BROKER_RETRY_DELAY_MS);
  });
}

function dailyLimitMessage(resetAt?: string): string {
  const resetTime = resetAt ? new Date(resetAt) : null;
  const resetLabel =
    resetTime && Number.isFinite(resetTime.getTime())
      ? new Intl.DateTimeFormat(undefined, {
          hour: 'numeric',
          minute: '2-digit',
        }).format(resetTime)
      : 'the daily reset';
  return `You've used today's 3 word analyses. More will be available at ${resetLabel}. Saved and previously analyzed words are still available.`;
}

async function requestOnce(
  cacheKey: string,
  match: LocalDictionaryMatch,
  sourceWord: string,
  sentenceContext: string,
  dependencies: WordHelpDependencies,
): Promise<LanguageResult> {
  const existingRequest = pendingRequests.get(cacheKey);
  if (existingRequest) return existingRequest;

  const request = (async () => {
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_BROKER_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timeout = globalThis.setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS,
      );

      try {
        const result = await dependencies.request({
          match,
          sentenceContext,
          signal: controller.signal,
          sourceWord,
        });
        if (result.confidence < MINIMUM_CONFIDENCE) {
          throw new Error('low_confidence');
        }
        await dependencies.writeCache(cacheKey, result).catch(() => undefined);
        return result;
      } catch (error) {
        lastError = error;
        if (
          attempt + 1 < MAX_BROKER_ATTEMPTS &&
          isRetryableBrokerError(error)
        ) {
          await waitForBrokerRetry();
          continue;
        }
        throw error;
      } finally {
        globalThis.clearTimeout(timeout);
      }
    }

    throw lastError ?? new Error('Word help request failed.');
  })().finally(() => {
    pendingRequests.delete(cacheKey);
  });

  pendingRequests.set(cacheKey, request);
  return request;
}

export async function loadWordHelp(
  sourceWord: string,
  sentenceContext: string,
  dependencies: WordHelpDependencies = defaultDependencies,
): Promise<WordHelpOutcome> {
  const cacheKey = createLanguageCacheKey(
    sourceWord,
    sentenceContext,
  );

  const cached = await dependencies
    .readCache(cacheKey)
    .catch(() => null);
  if (cached) {
    return { result: cached, source: 'cache', status: 'ready' };
  }

  let match: LocalDictionaryMatch | null;
  try {
    match = await dependencies.findMatch(sourceWord);
  } catch (error) {
    return {
      message:
        error instanceof LocalDictionaryUnavailableError
          ? 'LinguaRead could not load its local dictionaries. Try again.'
          : 'LinguaRead could not check its local dictionaries. Try again.',
      reason: 'dictionary_unavailable',
      status: 'error',
    };
  }
  if (!match) {
    return {
      message:
        'Chinese translation is unavailable in the local dictionaries. The original English stays unchanged.',
      reason: 'no_match',
      status: 'error',
    };
  }

  try {
    const result = await requestOnce(
      cacheKey,
      match,
      sourceWord,
      sentenceContext,
      dependencies,
    );
    return { result, source: 'broker', status: 'ready' };
  } catch (error) {
    if (
      error instanceof BrokerLanguageError &&
      error.code === 'daily_limit_reached'
    ) {
      return {
        message: dailyLimitMessage(error.resetAt),
        reason: 'daily_limit_reached',
        status: 'error',
      };
    }
    if (
      error instanceof BrokerLanguageError &&
      error.code === 'candidate_rejected'
    ) {
      return {
        message:
          'No safe translation matched this sentence. The original English stays unchanged.',
        reason: 'candidate_rejected',
        status: 'error',
      };
    }

    return {
      message:
        'LinguaRead could not confirm safe word help. The original English stays unchanged.',
      reason: 'provider_error',
      status: 'error',
    };
  }
}
