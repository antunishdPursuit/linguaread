import type { LanguageResult, VocabularyState } from './types';

export const MOCK_LANGUAGE_RESULT: LanguageResult = {
  id: 'innovation-mock-v1',
  sourceWord: 'innovation',
  lemma: 'innovation',
  cefr: 'B2',
  action: 'use_mandarin',
  displayWord: '创新',
  mandarin: '创新',
  pinyin: 'chuàng xīn',
  shortMeaning: 'a new idea or way of doing something',
  confidence: 1,
};

export const MOCK_VOCABULARY: VocabularyState = {
  learning: [
    {
      id: MOCK_LANGUAGE_RESULT.id,
      sourceWord: MOCK_LANGUAGE_RESULT.sourceWord,
      mandarin: MOCK_LANGUAGE_RESULT.mandarin,
      pinyin: MOCK_LANGUAGE_RESULT.pinyin,
      shortMeaning: MOCK_LANGUAGE_RESULT.shortMeaning,
      cefr: MOCK_LANGUAGE_RESULT.cefr,
    },
  ],
  known: [
    {
      id: 'growth-mock-v1',
      sourceWord: 'growth',
      mandarin: '增长',
      pinyin: 'zēng zhǎng',
      shortMeaning: 'an increase in size, value, or amount',
      cefr: 'B1',
    },
  ],
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function renderMockText(value: string): string {
  const safeValue = escapeHtml(value);

  return safeValue.replace(/\binnovation\b/gi, (sourceWord) => {
    return `<span class="linguaread-word" data-linguaread-word="${sourceWord.toLowerCase()}" tabindex="0" role="button" aria-label="Innovation changed to Simplified Chinese">${MOCK_LANGUAGE_RESULT.displayWord}</span>`;
  });
}
