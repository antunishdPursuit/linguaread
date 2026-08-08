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
  const stringFields = [
    'contextualExample',
    'definition',
    'displayWord',
    'id',
    'lemma',
    'mandarin',
    'partOfSpeech',
    'pinyin',
    'shortMeaning',
    'sourceWord',
    'usageNote',
  ] as const;
  if (
    !stringFields.every(
      (field) =>
        typeof candidate[field] === 'string' &&
        (field === 'partOfSpeech' || candidate[field].trim() !== ''),
    ) ||
    !['keep_english', 'use_mandarin', 'use_synonym'].includes(
      String(candidate.action),
    ) ||
    !['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'unknown'].includes(
      String(candidate.cefr),
    ) ||
    typeof candidate.confidence !== 'number' ||
    candidate.confidence < 0 ||
    candidate.confidence > 1
  ) {
    return null;
  }

  return candidate as LanguageResult;
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
