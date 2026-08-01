import { describe, expect, it } from 'vitest';
import {
  MOCK_LANGUAGE_RESULTS,
  toVocabularyEntry,
} from './mockLanguage';
import {
  createPendingVocabularyEntry,
  dictionaryHasEntry,
  dictionaryHasWord,
  EMPTY_VOCABULARY_STATE,
  normalizeVocabularyState,
  removeVocabularyEntry,
  saveVocabularyEntry,
} from './vocabularyStorage';

describe('Dictionary state', () => {
  const innovation = toVocabularyEntry(MOCK_LANGUAGE_RESULTS[0]);

  it('starts with one empty Dictionary', () => {
    expect(EMPTY_VOCABULARY_STATE).toEqual({ entries: [] });
  });

  it('saves each entry once and removes it deliberately', () => {
    const saved = saveVocabularyEntry(
      saveVocabularyEntry(EMPTY_VOCABULARY_STATE, innovation),
      innovation,
    );
    expect(saved.entries).toHaveLength(1);
    expect(dictionaryHasEntry(saved, innovation.id)).toBe(true);

    const removed = removeVocabularyEntry(saved, innovation.id);
    expect(dictionaryHasEntry(removed, innovation.id)).toBe(false);
  });

  it('migrates legacy Learning and Known entries into one Dictionary', () => {
    const migrated = normalizeVocabularyState({
      learning: [innovation],
      known: [innovation],
    });

    expect(migrated.entries).toHaveLength(1);
  });

  it('saves an unknown selected word without inventing language details', () => {
    const pending = createPendingVocabularyEntry('championship');
    const saved = saveVocabularyEntry(EMPTY_VOCABULARY_STATE, pending);

    expect(dictionaryHasWord(saved, 'Championship')).toBe(true);
    expect(saved.entries[0]).toMatchObject({
      cefr: 'unknown',
      definition: '',
      mandarin: '',
      sourceWord: 'championship',
    });
  });

  it('replaces a pending word when its complete entry becomes available', () => {
    const pending = createPendingVocabularyEntry('innovation');
    const ready = toVocabularyEntry(MOCK_LANGUAGE_RESULTS[0]);
    const saved = saveVocabularyEntry(
      saveVocabularyEntry(EMPTY_VOCABULARY_STATE, pending),
      ready,
    );

    expect(saved.entries).toEqual([ready]);
  });
});
