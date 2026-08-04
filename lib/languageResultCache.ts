import { parseGeminiLanguageFields } from './geminiLanguage';
import type { LanguageResult } from './types';

export const LANGUAGE_RESULT_CACHE_STORAGE_KEY =
  'linguaread-language-cache-v1';

type LocalStorageArea = {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

type LanguageResultCache = Record<string, LanguageResult>;

function localStorageArea(): LocalStorageArea {
  return browser.storage.local;
}

function parseLanguageResult(value: unknown): LanguageResult | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.sourceWord !== 'string'
  ) {
    return null;
  }

  try {
    return {
      ...parseGeminiLanguageFields(candidate),
      id: candidate.id,
      sourceWord: candidate.sourceWord,
    };
  } catch {
    return null;
  }
}

function normalizeCache(value: unknown): LanguageResultCache {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, result]) => [key, parseLanguageResult(result)] as const)
      .filter(
        (entry): entry is readonly [string, LanguageResult] =>
          entry[1] !== null,
      ),
  );
}

export async function readCachedLanguageResult(
  cacheKey: string,
  storage: LocalStorageArea = localStorageArea(),
): Promise<LanguageResult | null> {
  const stored = await storage.get(LANGUAGE_RESULT_CACHE_STORAGE_KEY);
  const cache = normalizeCache(stored[LANGUAGE_RESULT_CACHE_STORAGE_KEY]);
  return cache[cacheKey] ?? null;
}

export async function writeCachedLanguageResult(
  cacheKey: string,
  result: LanguageResult,
  storage: LocalStorageArea = localStorageArea(),
): Promise<void> {
  const stored = await storage.get(LANGUAGE_RESULT_CACHE_STORAGE_KEY);
  const cache = normalizeCache(stored[LANGUAGE_RESULT_CACHE_STORAGE_KEY]);
  await storage.set({
    [LANGUAGE_RESULT_CACHE_STORAGE_KEY]: {
      ...cache,
      [cacheKey]: result,
    },
  });
}
