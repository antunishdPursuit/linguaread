import { findEcDictMatch } from './ecDict';
import {
  findFreeDictMatch,
  type FreeDictMatch,
  type FreeDictTranslation,
} from './freeDict';

export type DictionarySource = 'ecdict' | 'freedict';

export type LocalDictionaryTranslation = FreeDictTranslation & {
  source: DictionarySource;
};

export type LocalDictionaryMatch = {
  headword: string;
  translations: LocalDictionaryTranslation[];
};

type LocalDictionaryDependencies = {
  findEcDictMatch(sourceWord: string): Promise<FreeDictMatch | null>;
  findFreeDictMatch(sourceWord: string): Promise<FreeDictMatch | null>;
};

const MAX_COMBINED_TRANSLATIONS = 12;

const defaultDependencies: LocalDictionaryDependencies = {
  findEcDictMatch,
  findFreeDictMatch,
};

function candidateIdentity(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, '');
}

export function mergeDictionaryMatches(
  freeDict: FreeDictMatch | null,
  ecDict: FreeDictMatch | null,
): LocalDictionaryMatch | null {
  if (!freeDict && !ecDict) return null;

  const translations: LocalDictionaryTranslation[] = [];
  const seen = new Set<string>();
  const sources = [
    { match: freeDict, source: 'freedict' as const },
    { match: ecDict, source: 'ecdict' as const },
  ];
  const sourceLength = Math.max(
    freeDict?.translations.length ?? 0,
    ecDict?.translations.length ?? 0,
  );

  // Interleave the sources so one broad dictionary cannot consume the cap.
  for (
    let index = 0;
    index < sourceLength && translations.length < MAX_COMBINED_TRANSLATIONS;
    index += 1
  ) {
    for (const { match, source } of sources) {
      const translation = match?.translations[index];
      if (!translation) continue;

      const identity = candidateIdentity(translation.value);
      if (!identity || seen.has(identity)) continue;
      seen.add(identity);
      translations.push({ ...translation, source });
      if (translations.length >= MAX_COMBINED_TRANSLATIONS) break;
    }
  }

  if (translations.length === 0) return null;
  return {
    headword: freeDict?.headword ?? ecDict!.headword,
    translations,
  };
}

export async function findLocalDictionaryMatch(
  sourceWord: string,
  dependencies: LocalDictionaryDependencies = defaultDependencies,
): Promise<LocalDictionaryMatch | null> {
  const [freeDict, ecDict] = await Promise.all([
    dependencies.findFreeDictMatch(sourceWord),
    dependencies.findEcDictMatch(sourceWord),
  ]);
  return mergeDictionaryMatches(freeDict, ecDict);
}
