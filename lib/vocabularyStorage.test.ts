import { describe, expect, it } from 'vitest';
import {
  MOCK_LANGUAGE_RESULTS,
} from './mockLanguage';
import {
  createWordOnlyVocabularyEntry,
  dictionaryHasWord,
  EMPTY_VOCABULARY_STATE,
  findVocabularyEntry,
  normalizeVocabularyState,
  removeVocabularyEntry,
  saveVocabularyEntry,
  toVocabularyEntry,
} from './vocabularyStorage';

describe('Dictionary state', () => {
  const innovation = toVocabularyEntry(MOCK_LANGUAGE_RESULTS[0]);

  it('saves each entry once', () => {
    const saved = saveVocabularyEntry(
      saveVocabularyEntry(EMPTY_VOCABULARY_STATE, innovation),
      innovation,
    );
    expect(saved.entries).toHaveLength(1);
    expect(dictionaryHasWord(saved, innovation.sourceWord)).toBe(true);
  });

  it('saves an unknown selected word without inventing language details', () => {
    const wordOnly = createWordOnlyVocabularyEntry('championship');
    const saved = saveVocabularyEntry(EMPTY_VOCABULARY_STATE, wordOnly);
    const restored = normalizeVocabularyState(saved);

    expect(dictionaryHasWord(saved, 'Championship')).toBe(true);
    expect(restored.entries[0]).toMatchObject({
      cefr: 'unknown',
      definition: '',
      mandarin: '',
      partOfSpeech: '',
      sourceWord: 'championship',
    });
  });

  it('replaces a word-only entry when its complete entry becomes available', () => {
    const wordOnly = createWordOnlyVocabularyEntry('innovation');
    const ready = toVocabularyEntry(MOCK_LANGUAGE_RESULTS[0]);
    const saved = saveVocabularyEntry(
      saveVocabularyEntry(EMPTY_VOCABULARY_STATE, wordOnly),
      ready,
    );

    expect(saved.entries).toEqual([ready]);
  });

  it('finds and removes one saved Dictionary entry', () => {
    const saved = saveVocabularyEntry(
      EMPTY_VOCABULARY_STATE,
      innovation,
    );

    expect(
      findVocabularyEntry(saved, innovation.sourceWord),
    ).toEqual(innovation);
    expect(removeVocabularyEntry(saved, innovation.id)).toEqual({
      entries: [],
    });
  });
});
