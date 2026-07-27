import { describe, expect, it } from 'vitest';
import {
  MOCK_LANGUAGE_RESULTS,
  escapeHtml,
  renderMockText,
  toVocabularyEntry,
} from './mockLanguage';
import {
  EMPTY_VOCABULARY_STATE,
  moveVocabularyEntry,
  vocabularyListFor,
} from './vocabularyStorage';

describe('mock language renderer', () => {
  it('escapes PDF text before adding mock markup', () => {
    expect(escapeHtml('<script>bad()</script>')).toBe(
      '&lt;script&gt;bad()&lt;/script&gt;',
    );
  });

  it('marks innovation without replacing its original PDF text', () => {
    const result = renderMockText('Tradition and innovation drive each other.');

    expect(result).toContain('data-linguaread-word="innovation"');
    expect(result).toContain('data-linguaread-action="use_mandarin"');
    expect(result).toContain('>innovation<');
    expect(result).not.toContain(MOCK_LANGUAGE_RESULTS[0].displayWord);
  });

  it('marks several prepared words while preserving their source text', () => {
    const result = renderMockText(
      'The controlled strategy supported innovation and craftsmanship.',
    );

    expect(result.match(/data-linguaread-id=/g)).toHaveLength(3);
    expect(result).toContain('>controlled<');
    expect(result).toContain('>innovation<');
    expect(result).toContain('>craftsmanship<');
    expect(result).not.toContain(MOCK_LANGUAGE_RESULTS[1].displayWord);
  });

  it('leaves unrelated text unchanged', () => {
    expect(renderMockText('Ferrari builds cars.')).toBe('Ferrari builds cars.');
  });
});

describe('vocabulary state', () => {
  const innovation = toVocabularyEntry(MOCK_LANGUAGE_RESULTS[0]);

  it('starts with no assumed Learning or Known words', () => {
    expect(EMPTY_VOCABULARY_STATE).toEqual({ learning: [], known: [] });
  });

  it('moves a word between mutually exclusive lists', () => {
    const learning = moveVocabularyEntry(
      EMPTY_VOCABULARY_STATE,
      innovation,
      'learning',
    );
    expect(vocabularyListFor(learning, innovation.id)).toBe('learning');

    const known = moveVocabularyEntry(learning, innovation, 'known');
    expect(vocabularyListFor(known, innovation.id)).toBe('known');
    expect(known.learning).toHaveLength(0);
    expect(known.known).toHaveLength(1);
  });
});
