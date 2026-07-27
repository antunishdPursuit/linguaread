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

  it('adds the Mandarin mock target to innovation', () => {
    const result = renderMockText('Tradition and innovation drive each other.');

    expect(result).toContain('data-linguaread-word="innovation"');
    expect(result).toContain('创新');
    expect(result).not.toContain('>innovation<');
  });

  it('marks several prepared words without processing unrelated words', () => {
    const result = renderMockText(
      'The controlled strategy supported innovation and craftsmanship.',
    );

    expect(result.match(/data-linguaread-id=/g)).toHaveLength(3);
    expect(result).toContain('managed');
    expect(result).toContain('创新');
    expect(result).toContain('工艺');
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
