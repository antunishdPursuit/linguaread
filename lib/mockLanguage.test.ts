import { describe, expect, it } from 'vitest';
import {
  MOCK_LANGUAGE_RESULTS,
  escapeHtml,
  renderInteractiveText,
  toVocabularyEntry,
} from './mockLanguage';
import {
  EMPTY_VOCABULARY_STATE,
  dictionaryHasEntry,
  normalizeVocabularyState,
  removeVocabularyEntry,
  saveVocabularyEntry,
} from './vocabularyStorage';

describe('interactive PDF text renderer', () => {
  it('escapes PDF text before adding markup', () => {
    expect(escapeHtml('<script>bad()</script>')).toBe(
      '&lt;script&gt;bad()&lt;/script&gt;',
    );
  });

  it('makes every English word interactive without replacing source text', () => {
    const result = renderInteractiveText(
      'Tradition and innovation drive each other.',
      EMPTY_VOCABULARY_STATE,
    );

    expect(result.match(/data-linguaread-word=/g)).toHaveLength(6);
    expect(result).toContain('data-linguaread-word="innovation"');
    expect(result).toContain('is-candidate');
    expect(result).toContain('>innovation<');
    expect(result).not.toContain(MOCK_LANGUAGE_RESULTS[0].displayWord);
  });

  it('removes a candidate marker without removing word interaction', () => {
    const result = renderInteractiveText(
      'Innovation matters.',
      EMPTY_VOCABULARY_STATE,
      new Set(['innovation']),
    );

    expect(result).toContain('data-linguaread-word="Innovation"');
    expect(result).not.toContain('is-candidate');
  });
});

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
});
