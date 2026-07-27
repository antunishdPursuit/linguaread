import type {
  LanguageResult,
  VocabularyEntry,
  VocabularyState,
} from './types';

export const MOCK_LANGUAGE_RESULTS: LanguageResult[] = [
  {
    id: 'innovation-mock-v2',
    sourceWord: 'innovation',
    lemma: 'innovation',
    cefr: 'B2',
    action: 'use_mandarin',
    displayWord: '创新',
    mandarin: '创新',
    pinyin: 'chuàng xīn',
    shortMeaning: 'a new idea or way of doing something',
    confidence: 1,
  },
  {
    id: 'controlled-mock-v2',
    sourceWord: 'controlled',
    lemma: 'control',
    cefr: 'B2',
    action: 'use_synonym',
    displayWord: 'managed',
    mandarin: '受控的',
    pinyin: 'shòu kòng de',
    shortMeaning: 'kept within planned limits',
    confidence: 1,
  },
  {
    id: 'craftsmanship-mock-v2',
    sourceWord: 'craftsmanship',
    lemma: 'craftsmanship',
    cefr: 'C1',
    action: 'use_mandarin',
    displayWord: '工艺',
    mandarin: '工艺',
    pinyin: 'gōng yì',
    shortMeaning: 'skill in making something well',
    confidence: 1,
  },
  {
    id: 'revolutionary-mock-v2',
    sourceWord: 'revolutionary',
    lemma: 'revolutionary',
    cefr: 'C1',
    action: 'use_synonym',
    displayWord: 'groundbreaking',
    mandarin: '革命性的',
    pinyin: 'gé mìng xìng de',
    shortMeaning: 'causing a major change',
    confidence: 1,
  },
  {
    id: 'exclusivity-mock-v2',
    sourceWord: 'exclusivity',
    lemma: 'exclusivity',
    cefr: 'C1',
    action: 'use_mandarin',
    displayWord: '独特性',
    mandarin: '独特性',
    pinyin: 'dú tè xìng',
    shortMeaning: 'the quality of being limited or special',
    confidence: 1,
  },
  {
    id: 'aspired-mock-v2',
    sourceWord: 'aspired',
    lemma: 'aspire',
    cefr: 'C1',
    action: 'use_synonym',
    displayWord: 'aimed',
    mandarin: '渴望',
    pinyin: 'kě wàng',
    shortMeaning: 'strongly hoped to achieve something',
    confidence: 1,
  },
];

export const MOCK_LANGUAGE_RESULT = MOCK_LANGUAGE_RESULTS[0];

export function toVocabularyEntry(result: LanguageResult): VocabularyEntry {
  const {
    id,
    sourceWord,
    displayWord,
    mandarin,
    pinyin,
    shortMeaning,
    cefr,
    action,
  } = result;

  return {
    id,
    sourceWord,
    displayWord,
    mandarin,
    pinyin,
    shortMeaning,
    cefr,
    action,
  };
}

export const MOCK_VOCABULARY: VocabularyState = {
  learning: [toVocabularyEntry(MOCK_LANGUAGE_RESULTS[2])],
  known: [toVocabularyEntry(MOCK_LANGUAGE_RESULTS[1])],
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function renderMockText(
  value: string,
  vocabulary?: VocabularyState,
): string {
  const resultsByWord = new Map(
    MOCK_LANGUAGE_RESULTS.map((result) => [result.sourceWord.toLowerCase(), result]),
  );
  const expression = new RegExp(
    `\\b(${MOCK_LANGUAGE_RESULTS.map((result) => result.sourceWord).join('|')})\\b`,
    'gi',
  );

  return escapeHtml(value).replace(expression, (sourceWord) => {
    const result = resultsByWord.get(sourceWord.toLowerCase());
    if (!result) return sourceWord;

    const actionClass =
      result.action === 'use_mandarin' ? 'is-mandarin' : 'is-synonym';
    const listClass = vocabulary?.learning.some((entry) => entry.id === result.id)
      ? 'is-learning'
      : vocabulary?.known.some((entry) => entry.id === result.id)
        ? 'is-known'
        : '';

    return `<span class="linguaread-word ${actionClass} ${listClass}" data-linguaread-word="${escapeHtml(result.sourceWord)}" data-linguaread-id="${escapeHtml(result.id)}" tabindex="0" role="button" aria-label="${escapeHtml(result.sourceWord)} changed to ${escapeHtml(result.displayWord)}">${escapeHtml(result.displayWord)}</span>`;
  });
}
