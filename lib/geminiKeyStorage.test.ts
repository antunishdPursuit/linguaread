import { describe, expect, it, vi } from 'vitest';
import {
  clearGeminiApiKey,
  GEMINI_API_KEY_STORAGE_KEY,
  readGeminiApiKey,
  storeGeminiApiKey,
} from './geminiKeyStorage';

function createStorage(initial: Record<string, unknown> = {}) {
  const values = { ...initial };

  return {
    get: vi.fn(async (key: string) => ({ [key]: values[key] })),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(values, items);
    }),
    remove: vi.fn(async (key: string) => {
      delete values[key];
    }),
  };
}

describe('Gemini session key storage', () => {
  it('stores and reads a trimmed tester key', async () => {
    const storage = createStorage();

    await storeGeminiApiKey('  tester-key  ', storage);

    expect(await readGeminiApiKey(storage)).toBe('tester-key');
    expect(storage.set).toHaveBeenCalledWith({
      [GEMINI_API_KEY_STORAGE_KEY]: 'tester-key',
    });
  });

  it('does not accept an empty key', async () => {
    await expect(storeGeminiApiKey('  ', createStorage())).rejects.toThrow(
      'Enter a Gemini API key.',
    );
  });

  it('clears the active key', async () => {
    const storage = createStorage({
      [GEMINI_API_KEY_STORAGE_KEY]: 'tester-key',
    });

    await clearGeminiApiKey(storage);

    expect(await readGeminiApiKey(storage)).toBeNull();
  });
});
