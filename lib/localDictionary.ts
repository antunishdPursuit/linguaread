import {
  findEcDictLookup,
  type EcDictLookup,
} from './ecDict';
import { normalizeLookupWord } from './dictionaryLookup';
import {
  findFreeDictMatch,
  type FreeDictMatch,
  type FreeDictTranslation,
} from './freeDict';

export type DictionarySource = 'ecdict' | 'freedict';

export type LocalDictionaryTranslation = FreeDictTranslation & {
  headword: string;
  lookup: 'exact' | 'lemma';
  source: DictionarySource;
};

export type LocalDictionaryMatch = {
  headword: string;
  translations: LocalDictionaryTranslation[];
};

type LocalDictionaryDependencies = {
  findEcDictLookup(sourceWord: string): Promise<EcDictLookup>;
  findFreeDictMatch(sourceWord: string): Promise<FreeDictMatch | null>;
};

const MAX_COMBINED_TRANSLATIONS = 12;

const defaultDependencies: LocalDictionaryDependencies = {
  findEcDictLookup,
  findFreeDictMatch,
};

export class LocalDictionaryUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super('Both local dictionary sources are unavailable.', options);
    this.name = 'LocalDictionaryUnavailableError';
  }
}

function candidateIdentity(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, '');
}

export function mergeDictionaryMatches(
  groups: readonly {
    lookup: 'exact' | 'lemma';
    match: FreeDictMatch | null;
    source: DictionarySource;
  }[],
  headword: string,
): LocalDictionaryMatch | null {
  if (!groups.some(({ match }) => match)) return null;

  const translations: LocalDictionaryTranslation[] = [];
  const seen = new Set<string>();
  for (const lookup of ['exact', 'lemma'] as const) {
    const tier = groups.filter((group) => group.lookup === lookup);
    const tierLength = Math.max(
      0,
      ...tier.map(({ match }) => match?.translations.length ?? 0),
    );

    // Interleave dictionary sources inside each tier, but always rank exact
    // surface-form candidates before candidates reached through a lemma.
    for (
      let index = 0;
      index < tierLength && translations.length < MAX_COMBINED_TRANSLATIONS;
      index += 1
    ) {
      for (const { match, source } of tier) {
        const translation = match?.translations[index];
        if (!translation || !match) continue;

        const identity = candidateIdentity(translation.value);
        if (!identity || seen.has(identity)) continue;
        seen.add(identity);
        translations.push({
          ...translation,
          headword: match.headword,
          lookup,
          source,
        });
        if (translations.length >= MAX_COMBINED_TRANSLATIONS) break;
      }
    }
  }

  if (translations.length === 0) return null;
  return { headword, translations };
}

export async function findLocalDictionaryMatch(
  sourceWord: string,
  dependencies: LocalDictionaryDependencies = defaultDependencies,
): Promise<LocalDictionaryMatch | null> {
  const normalizedWord = normalizeLookupWord(sourceWord);
  if (!normalizedWord) return null;

  const [freeDictResult, ecDictResult] = await Promise.allSettled([
    dependencies.findFreeDictMatch(normalizedWord),
    dependencies.findEcDictLookup(normalizedWord),
  ]);

  if (
    freeDictResult.status === 'rejected' &&
    ecDictResult.status === 'rejected'
  ) {
    throw new LocalDictionaryUnavailableError({
      cause: [freeDictResult.reason, ecDictResult.reason],
    });
  }

  const freeDict =
    freeDictResult.status === 'fulfilled' ? freeDictResult.value : null;
  const ecDict =
    ecDictResult.status === 'fulfilled'
      ? ecDictResult.value
      : { lemma: null, match: null };
  const lemma =
    ecDict.lemma && ecDict.lemma !== normalizedWord ? ecDict.lemma : null;

  const groups: {
    lookup: 'exact' | 'lemma';
    match: FreeDictMatch | null;
    source: DictionarySource;
  }[] = [
    { lookup: 'exact', match: freeDict, source: 'freedict' },
    { lookup: 'exact', match: ecDict.match, source: 'ecdict' },
  ];

  if (lemma) {
    const [lemmaFreeDict, lemmaEcDict] = await Promise.allSettled([
      dependencies.findFreeDictMatch(lemma),
      dependencies.findEcDictLookup(lemma),
    ]);
    groups.push(
      {
        lookup: 'lemma',
        match:
          lemmaFreeDict.status === 'fulfilled' ? lemmaFreeDict.value : null,
        source: 'freedict',
      },
      {
        lookup: 'lemma',
        match:
          lemmaEcDict.status === 'fulfilled'
            ? lemmaEcDict.value.match
            : null,
        source: 'ecdict',
      },
    );
  }

  return mergeDictionaryMatches(groups, lemma ?? normalizedWord);
}
