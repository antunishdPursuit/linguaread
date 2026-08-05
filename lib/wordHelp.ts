import {
  createLanguageCacheKey,
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
      reason: 'dictionary_unavailable' | 'no_match' | 'provider_error';
      status: 'error';
    };

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

async function requestOnce(
  cacheKey: string,
  match: LocalDictionaryMatch,
  sourceWord: string,
  sentenceContext: string,
  dependencies: WordHelpDependencies,
): Promise<LanguageResult> {
  const existingRequest = pendingRequests.get(cacheKey);
  if (existingRequest) return existingRequest;

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );
  const request = dependencies
    .request({
      match,
      sentenceContext,
      signal: controller.signal,
      sourceWord,
    })
    .then(async (result) => {
      if (result.confidence < MINIMUM_CONFIDENCE) {
        throw new Error('low_confidence');
      }
      await dependencies.writeCache(cacheKey, result).catch(() => undefined);
      return result;
    })
    .finally(() => {
      globalThis.clearTimeout(timeout);
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
  } catch {
    return {
      message:
        'LinguaRead could not confirm safe word help. The original English stays unchanged.',
      reason: 'provider_error',
      status: 'error',
    };
  }
}
