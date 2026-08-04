import { readGeminiApiKey } from './geminiKeyStorage';
import {
  createGeminiLanguageCacheKey,
  requestGeminiWordHelp,
} from './geminiLanguage';
import {
  readCachedLanguageResult,
  writeCachedLanguageResult,
} from './languageResultCache';
import type { LanguageResult } from './types';

const MINIMUM_CONFIDENCE = 0.7;
const REQUEST_TIMEOUT_MS = 15_000;
const pendingRequests = new Map<string, Promise<LanguageResult>>();

export type WordHelpOutcome =
  | {
      result: LanguageResult;
      source: 'cache' | 'gemini';
      status: 'ready';
    }
  | {
      message: string;
      status: 'error';
    }
  | {
      status: 'needs_key';
    };

type WordHelpDependencies = {
  readApiKey(): Promise<string | null>;
  readCache(cacheKey: string): Promise<LanguageResult | null>;
  request(request: {
    apiKey: string;
    sentenceContext: string;
    signal?: AbortSignal;
    sourceWord: string;
  }): Promise<LanguageResult>;
  writeCache(cacheKey: string, result: LanguageResult): Promise<void>;
};

const defaultDependencies: WordHelpDependencies = {
  readApiKey: readGeminiApiKey,
  readCache: readCachedLanguageResult,
  request: requestGeminiWordHelp,
  writeCache: writeCachedLanguageResult,
};

async function requestOnce(
  cacheKey: string,
  apiKey: string,
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
      apiKey,
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
  const cacheKey = createGeminiLanguageCacheKey(
    sourceWord,
    sentenceContext,
  );

  const cached = await dependencies
    .readCache(cacheKey)
    .catch(() => null);
  if (cached) {
    return { result: cached, source: 'cache', status: 'ready' };
  }

  const apiKey = await dependencies.readApiKey().catch(() => null);
  if (!apiKey) return { status: 'needs_key' };

  try {
    const result = await requestOnce(
      cacheKey,
      apiKey,
      sourceWord,
      sentenceContext,
      dependencies,
    );
    return { result, source: 'gemini', status: 'ready' };
  } catch {
    return {
      message:
        'LinguaRead could not confirm safe word help. The original English stays unchanged.',
      status: 'error',
    };
  }
}
