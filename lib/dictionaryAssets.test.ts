import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearEcDictShardCacheForTests,
  findEcDictLookup,
  findEcDictMatch,
} from './ecDict';
import {
  clearFreeDictShardCacheForTests,
  findFreeDictMatch,
} from './freeDict';
import { findLocalDictionaryMatch } from './localDictionary';

function assetDependencies() {
  return {
    fetch: async (input: string) => {
      const relativePath = input.replace('extension://', '');
      const body = await readFile(
        resolve(process.cwd(), 'public', relativePath),
        'utf8',
      );
      return new Response(body);
    },
    getAssetUrl: (path: string) => `extension://${path}`,
  };
}

beforeEach(() => {
  clearEcDictShardCacheForTests();
  clearFreeDictShardCacheForTests();
});

describe('packaged dictionary assets', () => {
  it.each(['further', 'without', 'terms', 'pursuing'])(
    'keeps a compact single-word candidate for %s',
    async (word) => {
      const dependencies = assetDependencies();
      const [freeDict, ecDict] = await Promise.all([
        findFreeDictMatch(word, dependencies),
        findEcDictMatch(word, dependencies),
      ]);

      expect(freeDict ?? ecDict).not.toBeNull();
    },
  );

  it('packages exact and base-form data without custom suffix rules', async () => {
    const dependencies = assetDependencies();

    await expect(
      findEcDictLookup('pursuing', dependencies),
    ).resolves.toMatchObject({
      lemma: 'pursue',
      match: { headword: 'pursuing' },
    });
    await expect(findEcDictLookup('went', dependencies)).resolves.toEqual({
      lemma: 'go',
      match: null,
    });
    await expect(findEcDictLookup('morning', dependencies)).resolves.toEqual({
      lemma: null,
      match: expect.objectContaining({ headword: 'morning' }),
    });
  });

  it('ranks exact forms before base forms in the packaged lookup path', async () => {
    const dependencies = assetDependencies();
    const localDependencies = {
      findEcDictLookup: (word: string) =>
        findEcDictLookup(word, dependencies),
      findFreeDictMatch: (word: string) =>
        findFreeDictMatch(word, dependencies),
    };
    const pursuing = await findLocalDictionaryMatch(
      'pursuing',
      localDependencies,
    );
    const went = await findLocalDictionaryMatch('went', localDependencies);

    expect(pursuing).toMatchObject({ headword: 'pursue' });
    expect(pursuing?.translations[0]).toMatchObject({
      headword: 'pursuing',
      lookup: 'exact',
    });
    expect(pursuing?.translations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          headword: 'pursue',
          lookup: 'lemma',
        }),
      ]),
    );
    expect(went).toMatchObject({ headword: 'go' });
    expect(went?.translations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          headword: 'go',
          lookup: 'lemma',
        }),
      ]),
    );
  });

  it('retains domain-labeled translations such as automotive performance', async () => {
    const match = await findEcDictMatch('performance', assetDependencies());

    expect(match?.translations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: '性能' }),
      ]),
    );
  });
});
