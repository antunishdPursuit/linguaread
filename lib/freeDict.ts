import { loadCachedDictionaryShard } from './dictionaryShard';
import { normalizeLookupWord } from './dictionaryLookup';

export type FreeDictTranslation = {
  gloss: string;
  value: string;
};

export type FreeDictMatch = {
  headword: string;
  translations: FreeDictTranslation[];
};

type FreeDictEntry = [gloss: string, value: string];
type FreeDictShard = Record<string, FreeDictEntry[]>;

type FreeDictDependencies = {
  fetch(input: string): Promise<Response>;
  getAssetUrl(path: string): string;
};

const shardCache = new Map<string, Promise<FreeDictShard>>();

const defaultDependencies: FreeDictDependencies = {
  fetch: (input) => fetch(input),
  getAssetUrl: (path) => chrome.runtime.getURL(path),
};

function parseShard(value: unknown): FreeDictShard {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value).flatMap(([headword, translations]) => {
      if (!Array.isArray(translations)) return [];
      const valid = translations.filter(
        (translation): translation is FreeDictEntry =>
          Array.isArray(translation) &&
          translation.length === 2 &&
          typeof translation[0] === 'string' &&
          typeof translation[1] === 'string',
      );
      return valid.length > 0 ? [[headword, valid]] : [];
    }),
  );
}

async function loadShard(
  name: string,
  dependencies: FreeDictDependencies,
): Promise<FreeDictShard> {
  return loadCachedDictionaryShard({
    cache: shardCache,
    fetch: dependencies.fetch,
    name,
    parse: parseShard,
    url: dependencies.getAssetUrl(
      `data/freedict/${encodeURIComponent(name)}.json`,
    ),
  });
}

export async function findFreeDictMatch(
  sourceWord: string,
  dependencies: FreeDictDependencies = defaultDependencies,
): Promise<FreeDictMatch | null> {
  const headword = normalizeLookupWord(sourceWord);
  if (!headword) return null;

  const first = headword[0];
  const shardName = first && first >= 'a' && first <= 'z' ? first : '_';
  const shard = await loadShard(shardName, dependencies);
  const entry = shard[headword];
  if (entry?.length) {
    return {
      headword,
      translations: entry.map(([gloss, value]) => ({ gloss, value })),
    };
  }

  return null;
}

export function clearFreeDictShardCacheForTests(): void {
  shardCache.clear();
}
