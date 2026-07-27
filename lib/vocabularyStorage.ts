import type {
  VocabularyEntry,
  VocabularyList,
  VocabularyState,
} from './types';

export const VOCABULARY_STORAGE_KEY = 'linguaread-vocabulary-v1';

export const EMPTY_VOCABULARY_STATE: VocabularyState = {
  learning: [],
  known: [],
};

export function moveVocabularyEntry(
  state: VocabularyState,
  entry: VocabularyEntry,
  destination: VocabularyList,
): VocabularyState {
  const withoutEntry = {
    learning: state.learning.filter((item) => item.id !== entry.id),
    known: state.known.filter((item) => item.id !== entry.id),
  };

  return {
    ...withoutEntry,
    [destination]: [entry, ...withoutEntry[destination]],
  };
}

export function vocabularyListFor(
  state: VocabularyState,
  entryId: string,
): VocabularyList | null {
  if (state.learning.some((entry) => entry.id === entryId)) return 'learning';
  if (state.known.some((entry) => entry.id === entryId)) return 'known';
  return null;
}

function isVocabularyEntry(value: unknown): value is VocabularyEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<VocabularyEntry>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.sourceWord === 'string' &&
    typeof entry.displayWord === 'string' &&
    typeof entry.mandarin === 'string' &&
    typeof entry.pinyin === 'string' &&
    typeof entry.shortMeaning === 'string' &&
    typeof entry.cefr === 'string' &&
    typeof entry.action === 'string'
  );
}

function normalizeState(value: unknown): VocabularyState {
  if (!value || typeof value !== 'object') return EMPTY_VOCABULARY_STATE;
  const candidate = value as Partial<VocabularyState>;
  return {
    learning: Array.isArray(candidate.learning)
      ? candidate.learning.filter(isVocabularyEntry)
      : [],
    known: Array.isArray(candidate.known)
      ? candidate.known.filter(isVocabularyEntry)
      : [],
  };
}

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

export async function readVocabularyState(): Promise<VocabularyState> {
  if (!hasChromeStorage()) {
    const saved = globalThis.localStorage?.getItem(VOCABULARY_STORAGE_KEY);
    if (!saved) return EMPTY_VOCABULARY_STATE;
    try {
      return normalizeState(JSON.parse(saved));
    } catch {
      return EMPTY_VOCABULARY_STATE;
    }
  }

  const result = await chrome.storage.local.get(VOCABULARY_STORAGE_KEY);
  return normalizeState(result[VOCABULARY_STORAGE_KEY]);
}

export async function writeVocabularyState(
  state: VocabularyState,
): Promise<void> {
  if (!hasChromeStorage()) {
    globalThis.localStorage?.setItem(
      VOCABULARY_STORAGE_KEY,
      JSON.stringify(state),
    );
    return;
  }

  await chrome.storage.local.set({ [VOCABULARY_STORAGE_KEY]: state });
}

export function subscribeToVocabularyState(
  listener: (state: VocabularyState) => void,
): () => void {
  if (!hasChromeStorage()) {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== VOCABULARY_STORAGE_KEY || !event.newValue) return;
      try {
        listener(normalizeState(JSON.parse(event.newValue)));
      } catch {
        listener(EMPTY_VOCABULARY_STATE);
      }
    };
    globalThis.addEventListener?.('storage', handleStorage);
    return () => globalThis.removeEventListener?.('storage', handleStorage);
  }

  const handleChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== 'local') return;
    const change = changes[VOCABULARY_STORAGE_KEY];
    if (!change) return;
    listener(normalizeState(change.newValue));
  };

  chrome.storage.onChanged.addListener(handleChange);
  return () => chrome.storage.onChanged.removeListener(handleChange);
}
