import type { VocabularyEntry, VocabularyState } from './types';

export const VOCABULARY_STORAGE_KEY = 'linguaread-dictionary-v2';
const LEGACY_VOCABULARY_STORAGE_KEY = 'linguaread-vocabulary-v1';

export const EMPTY_VOCABULARY_STATE: VocabularyState = {
  entries: [],
};

export function saveVocabularyEntry(
  state: VocabularyState,
  entry: VocabularyEntry,
): VocabularyState {
  return {
    entries: [
      entry,
      ...state.entries.filter((candidate) => candidate.id !== entry.id),
    ],
  };
}

export function removeVocabularyEntry(
  state: VocabularyState,
  entryId: string,
): VocabularyState {
  return {
    entries: state.entries.filter((entry) => entry.id !== entryId),
  };
}

export function dictionaryHasEntry(
  state: VocabularyState,
  entryId: string,
): boolean {
  return state.entries.some((entry) => entry.id === entryId);
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

function withExpandedFields(entry: VocabularyEntry): VocabularyEntry {
  return {
    ...entry,
    contextualExample: entry.contextualExample || '',
    definition: entry.definition || entry.shortMeaning,
    lemma: entry.lemma || entry.sourceWord.toLowerCase(),
    simplerEnglish: entry.simplerEnglish || entry.displayWord,
    usageNote: entry.usageNote || '',
  };
}

function uniqueEntries(entries: VocabularyEntry[]): VocabularyEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

export function normalizeVocabularyState(value: unknown): VocabularyState {
  if (!value || typeof value !== 'object') return EMPTY_VOCABULARY_STATE;
  const candidate = value as {
    entries?: unknown[];
    known?: unknown[];
    learning?: unknown[];
  };

  if (Array.isArray(candidate.entries)) {
    return {
      entries: uniqueEntries(
        candidate.entries
          .filter(isVocabularyEntry)
          .map(withExpandedFields),
      ),
    };
  }

  // Migrate the earlier mutually exclusive lists into one Dictionary.
  const legacyEntries = [
    ...(Array.isArray(candidate.learning) ? candidate.learning : []),
    ...(Array.isArray(candidate.known) ? candidate.known : []),
  ];
  return {
    entries: uniqueEntries(
      legacyEntries.filter(isVocabularyEntry).map(withExpandedFields),
    ),
  };
}

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

export async function readVocabularyState(): Promise<VocabularyState> {
  if (!hasChromeStorage()) {
    const saved =
      globalThis.localStorage?.getItem(VOCABULARY_STORAGE_KEY) ??
      globalThis.localStorage?.getItem(LEGACY_VOCABULARY_STORAGE_KEY);
    if (!saved) return EMPTY_VOCABULARY_STATE;
    try {
      return normalizeVocabularyState(JSON.parse(saved));
    } catch {
      return EMPTY_VOCABULARY_STATE;
    }
  }

  const result = await chrome.storage.local.get([
    VOCABULARY_STORAGE_KEY,
    LEGACY_VOCABULARY_STORAGE_KEY,
  ]);
  return normalizeVocabularyState(
    result[VOCABULARY_STORAGE_KEY] ??
      result[LEGACY_VOCABULARY_STORAGE_KEY],
  );
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
        listener(normalizeVocabularyState(JSON.parse(event.newValue)));
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
    listener(normalizeVocabularyState(change.newValue));
  };

  chrome.storage.onChanged.addListener(handleChange);
  return () => chrome.storage.onChanged.removeListener(handleChange);
}
