export const GEMINI_API_KEY_STORAGE_KEY = 'geminiApiKey';

type SessionStorageArea = {
  get(key: string): Promise<Record<string, unknown>>;
  remove(key: string): Promise<void>;
  set(items: Record<string, unknown>): Promise<void>;
};

function sessionStorage(): SessionStorageArea {
  return browser.storage.session;
}

export async function readGeminiApiKey(
  storage: SessionStorageArea = sessionStorage(),
): Promise<string | null> {
  const stored = await storage.get(GEMINI_API_KEY_STORAGE_KEY);
  const value = stored[GEMINI_API_KEY_STORAGE_KEY];

  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : null;
}

export async function storeGeminiApiKey(
  apiKey: string,
  storage: SessionStorageArea = sessionStorage(),
): Promise<void> {
  const normalized = apiKey.trim();
  if (normalized === '') {
    throw new Error('Enter a Gemini API key.');
  }

  // Session storage keeps tester credentials out of persistent extension data.
  await storage.set({ [GEMINI_API_KEY_STORAGE_KEY]: normalized });
}

export async function clearGeminiApiKey(
  storage: SessionStorageArea = sessionStorage(),
): Promise<void> {
  await storage.remove(GEMINI_API_KEY_STORAGE_KEY);
}
