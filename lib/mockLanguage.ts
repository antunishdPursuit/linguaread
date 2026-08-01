import type {
  LanguageResult,
  VocabularyEntry,
  VocabularyState,
} from './types';

// These records are UI fixtures, not the production B2 candidate source.
export const MOCK_LANGUAGE_RESULTS: LanguageResult[] = [
  {
    id: 'innovation-mock-v3',
    sourceWord: 'innovation',
    lemma: 'innovation',
    cefr: 'B2',
    action: 'use_mandarin',
    displayWord: '创新',
    mandarin: '创新',
    pinyin: 'chuàng xīn',
    simplerEnglish: 'new idea',
    shortMeaning: 'a new idea or way of doing something',
    definition: 'a new idea, method, or way of doing something',
    contextualExample:
      'Ferrari balanced tradition and innovation as it planned for growth.',
    usageNote:
      'Usually uncountable when it means the process of introducing new ideas.',
    confidence: 1,
  },
  {
    id: 'controlled-mock-v3',
    sourceWord: 'controlled',
    lemma: 'control',
    cefr: 'B2',
    action: 'use_synonym',
    displayWord: 'managed',
    mandarin: '受控的',
    pinyin: 'shòu kòng de',
    simplerEnglish: 'managed',
    shortMeaning: 'kept within planned limits',
    definition: 'managed or limited so that it stays within a plan',
    contextualExample: 'Ferrari was pursuing a strategy of controlled growth.',
    usageNote:
      'Here, controlled describes growth that is deliberate rather than unlimited.',
    confidence: 1,
  },
  {
    id: 'craftsmanship-mock-v3',
    sourceWord: 'craftsmanship',
    lemma: 'craftsmanship',
    cefr: 'C1',
    action: 'use_mandarin',
    displayWord: '工艺',
    mandarin: '工艺',
    pinyin: 'gōng yì',
    simplerEnglish: 'making skill',
    shortMeaning: 'skill in making something well',
    definition: 'the skill and care used to make a high-quality object',
    contextualExample:
      'Ferrari connected technological solutions with artisanal craftsmanship.',
    usageNote: 'An uncountable noun used to praise the quality of skilled work.',
    confidence: 1,
  },
  {
    id: 'revolutionary-mock-v3',
    sourceWord: 'revolutionary',
    lemma: 'revolutionary',
    cefr: 'C1',
    action: 'use_synonym',
    displayWord: 'groundbreaking',
    mandarin: '革命性的',
    pinyin: 'gé mìng xìng de',
    simplerEnglish: 'groundbreaking',
    shortMeaning: 'causing a major change',
    definition: 'causing or relating to a very large change',
    contextualExample:
      'The company described its technological solutions as revolutionary.',
    usageNote:
      'In business writing, this adjective often means highly innovative.',
    confidence: 1,
  },
  {
    id: 'exclusivity-mock-v3',
    sourceWord: 'exclusivity',
    lemma: 'exclusivity',
    cefr: 'C1',
    action: 'use_mandarin',
    displayWord: '独特性',
    mandarin: '独特性',
    pinyin: 'dú tè xìng',
    simplerEnglish: 'being limited',
    shortMeaning: 'the quality of being limited or special',
    definition: 'the quality of being available only to a small group',
    contextualExample:
      'Ferrari wanted to grow without reducing the exclusivity of its brand.',
    usageNote:
      'Often used for products, groups, or access that is deliberately limited.',
    confidence: 1,
  },
  {
    id: 'aspired-mock-v3',
    sourceWord: 'aspired',
    lemma: 'aspire',
    cefr: 'C1',
    action: 'use_synonym',
    displayWord: 'aimed',
    mandarin: '渴望',
    pinyin: 'kě wàng',
    simplerEnglish: 'aimed',
    shortMeaning: 'strongly hoped to achieve something',
    definition: 'had a strong hope or ambition to achieve something',
    contextualExample:
      'The company aspired to grow without weakening its brand.',
    usageNote: 'Usually followed by “to” and a verb: aspire to build, grow, or lead.',
    confidence: 1,
  },
];

export const MOCK_LANGUAGE_RESULT = MOCK_LANGUAGE_RESULTS[0];

const RESULTS_BY_WORD = new Map(
  MOCK_LANGUAGE_RESULTS.map((result) => [
    result.sourceWord.toLowerCase(),
    result,
  ]),
);

export function languageFixtureForWord(
  sourceWord: string,
): LanguageResult | null {
  return RESULTS_BY_WORD.get(sourceWord.toLowerCase()) ?? null;
}

export function toVocabularyEntry(result: LanguageResult): VocabularyEntry {
  const { confidence: _confidence, ...entry } = result;
  return entry;
}

export const MOCK_VOCABULARY: VocabularyState = {
  entries: [
    toVocabularyEntry(MOCK_LANGUAGE_RESULTS[2]),
    toVocabularyEntry(MOCK_LANGUAGE_RESULTS[1]),
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

export function renderInteractiveText(
  value: string,
  vocabulary: VocabularyState,
  unmarkedWords: ReadonlySet<string> = new Set(),
): string {
  const wordPattern = /[A-Za-z]+(?:['’\-][A-Za-z]+)*/g;
  let cursor = 0;
  let markup = '';

  for (const match of value.matchAll(wordPattern)) {
    const sourceWord = match[0];
    const start = match.index;
    markup += escapeHtml(value.slice(cursor, start));

    const normalizedWord = sourceWord.toLowerCase();
    const result = RESULTS_BY_WORD.get(normalizedWord);
    const isMarked = Boolean(result) && !unmarkedWords.has(normalizedWord);
    const isSaved = Boolean(
      result &&
        vocabulary.entries.some((entry) => entry.id === result.id),
    );
    const classes = [
      'linguaread-word',
      isMarked ? 'is-candidate' : '',
      isMarked && result?.action === 'use_mandarin' ? 'is-mandarin' : '',
      isMarked && result?.action === 'use_synonym' ? 'is-synonym' : '',
      isSaved ? 'is-saved' : '',
    ]
      .filter(Boolean)
      .join(' ');

    // All words can be double-clicked. Only prepared candidates enter the tab order.
    markup += `<span class="${classes}" data-linguaread-word="${escapeHtml(
      sourceWord,
    )}"${result ? ` data-linguaread-id="${escapeHtml(result.id)}"` : ''}${
      isMarked ? ' data-linguaread-candidate="true" tabindex="0" role="button"' : ''
    }>${escapeHtml(sourceWord)}</span>`;
    cursor = start + sourceWord.length;
  }

  return markup + escapeHtml(value.slice(cursor));
}

export const renderMockText = renderInteractiveText;
