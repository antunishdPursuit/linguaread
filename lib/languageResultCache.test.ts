import { describe, expect, it } from 'vitest';
import {
  LANGUAGE_RESULT_CACHE_STORAGE_KEY,
  readCachedLanguageResult,
  readCachedLanguageResultKeys,
  writeCachedLanguageResult,
} from './languageResultCache';
import { MOCK_LANGUAGE_RESULT } from './mockLanguage';

function memoryStorage(initial: Record<string, unknown> = {}) {
  const values = { ...initial };
  return {
    get: async (key: string) => ({ [key]: values[key] }),
    set: async (items: Record<string, unknown>) => {
      Object.assign(values, items);
    },
  };
}

describe('language result cache', () => {
  it('writes and reads a validated language result', async () => {
    const storage = memoryStorage();

    await writeCachedLanguageResult(
      'context-key',
      MOCK_LANGUAGE_RESULT,
      storage,
    );

    await expect(
      readCachedLanguageResult('context-key', storage),
    ).resolves.toEqual(MOCK_LANGUAGE_RESULT);
    await expect(readCachedLanguageResultKeys(storage)).resolves.toEqual(
      new Set(['context-key']),
    );
  });

  it('ignores malformed cached records', async () => {
    const storage = memoryStorage({
      [LANGUAGE_RESULT_CACHE_STORAGE_KEY]: {
        broken: { id: 'broken', sourceWord: 'broken' },
      },
    });

    await expect(
      readCachedLanguageResult('broken', storage),
    ).resolves.toBeNull();
    await expect(readCachedLanguageResultKeys(storage)).resolves.toEqual(
      new Set(),
    );
  });
});
