export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'unknown';

export type LanguageAction =
  | 'keep_english'
  | 'use_synonym'
  | 'use_mandarin';

export type LanguageResult = {
  action: LanguageAction;
  cefr: CefrLevel;
  confidence: number;
  contextualExample: string;
  definition: string;
  displayWord: string;
  id: string;
  lemma: string;
  mandarin: string;
  pinyin: string;
  shortMeaning: string;
  simplerEnglish: string;
  sourceWord: string;
  usageNote: string;
};

export type VocabularyEntry = Pick<
  LanguageResult,
  | 'action'
  | 'cefr'
  | 'contextualExample'
  | 'definition'
  | 'displayWord'
  | 'id'
  | 'lemma'
  | 'mandarin'
  | 'pinyin'
  | 'shortMeaning'
  | 'simplerEnglish'
  | 'sourceWord'
  | 'usageNote'
>;

export type VocabularyState = {
  entries: VocabularyEntry[];
};
