export type FreeDictTranslation = {
  gloss: string;
  value: string;
};

export type FreeDictMatch = {
  headword: string;
  translations: FreeDictTranslation[];
};

type FreeDictShard = Record<string, FreeDictTranslation[]>;

type FreeDictDependencies = {
  fetch(input: string): Promise<Response>;
  getAssetUrl(path: string): string;
};

const shardCache = new Map<string, Promise<FreeDictShard>>();
const IRREGULAR_FORMS: Record<string, string> = {
  better: 'good',
  best: 'good',
  children: 'child',
  feet: 'foot',
  men: 'man',
  people: 'person',
  teeth: 'tooth',
  went: 'go',
  women: 'woman',
  worse: 'bad',
  worst: 'bad',
};

const defaultDependencies: FreeDictDependencies = {
  fetch: (input) => fetch(input),
  getAssetUrl: (path) => chrome.runtime.getURL(path),
};

function normalizeWord(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/^[^a-z]+|[^a-z]+$/g, '');
}

function addCandidate(candidates: string[], value: string): void {
  if (value.length > 1 && !candidates.includes(value)) {
    candidates.push(value);
  }
}

export function createHeadwordCandidates(sourceWord: string): string[] {
  const word = normalizeWord(sourceWord);
  if (!word) return [];

  const candidates = [word];
  const irregular = IRREGULAR_FORMS[word];
  if (irregular) addCandidate(candidates, irregular);

  if (word.endsWith('ies') && word.length > 4) {
    addCandidate(candidates, `${word.slice(0, -3)}y`);
  }
  if (word.endsWith('ied') && word.length > 4) {
    addCandidate(candidates, `${word.slice(0, -3)}y`);
  }
  if (word.endsWith('ing') && word.length > 5) {
    const stem = word.slice(0, -3);
    addCandidate(candidates, stem);
    addCandidate(candidates, `${stem}e`);
    if (stem.at(-1) === stem.at(-2)) {
      addCandidate(candidates, stem.slice(0, -1));
    }
  }
  if (word.endsWith('ed') && word.length > 4) {
    const stem = word.slice(0, -2);
    addCandidate(candidates, stem);
    addCandidate(candidates, `${stem}e`);
    if (stem.at(-1) === stem.at(-2)) {
      addCandidate(candidates, stem.slice(0, -1));
    }
  }
  if (word.endsWith('es') && word.length > 4) {
    addCandidate(candidates, word.slice(0, -2));
    addCandidate(candidates, word.slice(0, -1));
  } else if (word.endsWith('s') && word.length > 3) {
    addCandidate(candidates, word.slice(0, -1));
  }
  if (word.endsWith('er') && word.length > 4) {
    addCandidate(candidates, word.slice(0, -2));
    addCandidate(candidates, `${word.slice(0, -1)}e`);
  }
  if (word.endsWith('est') && word.length > 5) {
    addCandidate(candidates, word.slice(0, -3));
    addCandidate(candidates, `${word.slice(0, -2)}e`);
  }

  return candidates;
}

function parseShard(value: unknown): FreeDictShard {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value).flatMap(([headword, translations]) => {
      if (!Array.isArray(translations)) return [];
      const valid = translations.filter(
        (translation): translation is FreeDictTranslation =>
          Boolean(
            translation &&
              typeof translation === 'object' &&
              typeof (translation as FreeDictTranslation).gloss === 'string' &&
              typeof (translation as FreeDictTranslation).value === 'string',
          ),
      );
      return valid.length > 0 ? [[headword, valid]] : [];
    }),
  );
}

async function loadShard(
  name: string,
  dependencies: FreeDictDependencies,
): Promise<FreeDictShard> {
  const existing = shardCache.get(name);
  if (existing) return existing;

  const request = dependencies
    .fetch(
      dependencies.getAssetUrl(`data/freedict/${encodeURIComponent(name)}.json`),
    )
    .then(async (response) => {
      if (!response.ok) return {};
      return parseShard(await response.json());
    })
    .catch(() => ({}));

  shardCache.set(name, request);
  return request;
}

export async function findFreeDictMatch(
  sourceWord: string,
  dependencies: FreeDictDependencies = defaultDependencies,
): Promise<FreeDictMatch | null> {
  for (const headword of createHeadwordCandidates(sourceWord)) {
    const first = headword[0];
    const shardName =
      first && first >= 'a' && first <= 'z' ? first : '_';
    const shard = await loadShard(shardName, dependencies);
    const translations = shard[headword];
    if (translations?.length) {
      return { headword, translations };
    }
  }

  return null;
}

export function clearFreeDictShardCacheForTests(): void {
  shardCache.clear();
}
