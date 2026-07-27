export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'unknown';

export type LanguageAction =
  | 'keep_english'
  | 'use_synonym'
  | 'use_mandarin';

export type LanguageResult = {
  id: string;
  sourceWord: string;
  lemma: string;
  cefr: CefrLevel;
  action: LanguageAction;
  displayWord: string;
  mandarin: string;
  pinyin: string;
  shortMeaning: string;
  confidence: number;
};

export type VocabularyEntry = Pick<
  LanguageResult,
  | 'id'
  | 'sourceWord'
  | 'displayWord'
  | 'mandarin'
  | 'pinyin'
  | 'shortMeaning'
  | 'cefr'
  | 'action'
>;

export type VocabularyState = {
  learning: VocabularyEntry[];
  known: VocabularyEntry[];
};

export type VocabularyList = keyof VocabularyState;
