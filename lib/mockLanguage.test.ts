import { describe, expect, it } from 'vitest';
import {
  MOCK_LANGUAGE_RESULTS,
  toVocabularyEntry,
} from './mockLanguage';
import {
  createPendingVocabularyEntry,
  dictionaryHasWord,
  EMPTY_VOCABULARY_STATE,
  normalizeVocabularyState,
  saveVocabularyEntry,
} from './vocabularyStorage';

describe('Dictionary state', () => {
  const innovation = toVocabularyEntry(MOCK_LANGUAGE_RESULTS[0]);

  it('starts with one empty Dictionary', () => {
    expect(EMPTY_VOCABULARY_STATE).toEqual({ entries: [] });
  });

  it('saves each entry once', () => {
    const saved = saveVocabularyEntry(
      saveVocabularyEntry(EMPTY_VOCABULARY_STATE, innovation),
      innovation,
    );
    expect(saved.entries).toHaveLength(1);
    expect(dictionaryHasWord(saved, innovation.sourceWord)).toBe(true);
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
