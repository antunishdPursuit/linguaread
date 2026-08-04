import { describe, expect, it } from 'vitest';
import {
  acceptLanguageDisclosure,
  hasAcceptedLanguageDisclosure,
  LANGUAGE_DISCLOSURE_STORAGE_KEY,
} from './languageDisclosure';

function memoryStorage(initial: Record<string, unknown> = {}) {
  const values = { ...initial };
  return {
    get: async (key: string) => ({ [key]: values[key] }),
    set: async (items: Record<string, unknown>) => {
      Object.assign(values, items);
    },
    values,
  };
}

describe('language-service disclosure', () => {
  it('is not accepted before the user continues', async () => {
    await expect(
      hasAcceptedLanguageDisclosure(memoryStorage()),
    ).resolves.toBe(false);
  });

  it('persists acceptance without storing selected text', async () => {
    const storage = memoryStorage();

    await acceptLanguageDisclosure(storage);

    await expect(hasAcceptedLanguageDisclosure(storage)).resolves.toBe(true);
    expect(storage.values[LANGUAGE_DISCLOSURE_STORAGE_KEY]).toEqual({
      accepted: true,
      version: 1,
    });
  });

  it('requires the current disclosure version', async () => {
    const storage = memoryStorage({
      [LANGUAGE_DISCLOSURE_STORAGE_KEY]: {
        accepted: true,
        version: 0,
      },
    });

    await expect(hasAcceptedLanguageDisclosure(storage)).resolves.toBe(false);
  });
});
