import {
  createHeadwordCandidates,
  type FreeDictMatch,
  type FreeDictTranslation,
} from './freeDict';
import { loadCachedDictionaryShard } from './dictionaryShard';

type EcDictEntry = [gloss: string, values: string[]];
type EcDictShard = Record<string, EcDictEntry>;

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
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value).flatMap(([headword, entry]) => {
      if (
        !Array.isArray(entry) ||
        entry.length !== 2 ||
        typeof entry[0] !== 'string' ||
        !Array.isArray(entry[1])
      ) {
        return [];
      }

      const values = entry[1].filter(
        (candidate): candidate is string =>
          typeof candidate === 'string' && candidate.trim() !== '',
      );
      return values.length > 0 ? [[headword, [entry[0], values]]] : [];
    }),
  );
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

export async function findEcDictMatch(
  sourceWord: string,
  dependencies: EcDictDependencies = defaultDependencies,
): Promise<FreeDictMatch | null> {
  for (const headword of createHeadwordCandidates(sourceWord)) {
    const shard = await loadShard(getShardName(headword), dependencies);
    const entry = shard[headword];
    if (!entry) continue;

    const [gloss, values] = entry;
    const translations: FreeDictTranslation[] = values.map((value) => ({
      gloss,
      value,
    }));
    return { headword, translations };
  }

  return null;
}

export function clearEcDictShardCacheForTests(): void {
  shardCache.clear();
}
