import { loadCachedDictionaryShard } from './dictionaryShard';
import { normalizeLookupWord } from './dictionaryLookup';
import type {
  FreeDictMatch,
  FreeDictTranslation,
} from './freeDict';

type EcDictEntry = [gloss: string, values: string[]];
type EcDictEntries = Record<string, EcDictEntry>;
type EcDictLemmas = Record<string, string>;
type EcDictShard = [entries: EcDictEntries, lemmas: EcDictLemmas];

export type EcDictLookup = {
  lemma: string | null;
  match: FreeDictMatch | null;
};

type EcDictDependencies = {
  fetch(input: string): Promise<Response>;
  getAssetUrl(path: string): string;
};

const shardCache = new Map<string, Promise<EcDictShard>>();

const defaultDependencies: EcDictDependencies = {
  fetch: (input) => fetch(input),
  getAssetUrl: (path) => chrome.runtime.getURL(path),
};

function parseShard(value: unknown): EcDictShard {
  if (!Array.isArray(value) || value.length !== 2) return [{}, {}];
  const [rawEntries, rawLemmas] = value;
  if (
    !rawEntries ||
    typeof rawEntries !== 'object' ||
    Array.isArray(rawEntries) ||
    !rawLemmas ||
    typeof rawLemmas !== 'object' ||
    Array.isArray(rawLemmas)
  ) {
    return [{}, {}];
  }

  const entries: EcDictEntries = {};
  for (const [headword, entry] of Object.entries(rawEntries)) {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      typeof entry[0] !== 'string' ||
      !Array.isArray(entry[1])
    ) {
      continue;
    }

    const values = entry[1].filter(
      (candidate): candidate is string =>
        typeof candidate === 'string' && candidate.trim() !== '',
    );
    if (values.length > 0) {
      entries[headword] = [entry[0], values];
    }
  }
  const lemmas = Object.fromEntries(
    Object.entries(rawLemmas).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === 'string' && entry[1].trim() !== '',
    ),
  );
  return [entries, lemmas];
}

function getShardName(headword: string): string {
  const prefix = headword.slice(0, 2);
  return prefix.length === 2 && /^[a-z]{2}$/.test(prefix) ? prefix : '_';
}

async function loadShard(
  name: string,
  dependencies: EcDictDependencies,
): Promise<EcDictShard> {
  return loadCachedDictionaryShard({
    cache: shardCache,
    fetch: dependencies.fetch,
    name,
    parse: parseShard,
    url: dependencies.getAssetUrl(
      `data/ecdict/${encodeURIComponent(name)}.json`,
    ),
  });
}

export async function findEcDictLookup(
  sourceWord: string,
  dependencies: EcDictDependencies = defaultDependencies,
): Promise<EcDictLookup> {
  const headword = normalizeLookupWord(sourceWord);
  if (!headword) return { lemma: null, match: null };

  const [entries, lemmas] = await loadShard(
    getShardName(headword),
    dependencies,
  );
  const entry = entries[headword];
  const match = entry
    ? {
        headword,
        translations: entry[1].map(
          (value): FreeDictTranslation => ({
            gloss: entry[0],
            value,
          }),
        ),
      }
    : null;
  return {
    lemma: lemmas[headword] ?? null,
    match,
  };
}

export async function findEcDictMatch(
  sourceWord: string,
  dependencies: EcDictDependencies = defaultDependencies,
): Promise<FreeDictMatch | null> {
  return (await findEcDictLookup(sourceWord, dependencies)).match;
}

export function clearEcDictShardCacheForTests(): void {
  shardCache.clear();
}
