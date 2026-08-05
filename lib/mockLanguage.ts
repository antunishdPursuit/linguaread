import type {
  LanguageResult,
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
