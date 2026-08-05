import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearEcDictShardCacheForTests,
  findEcDictMatch,
} from './ecDict';
import {
  clearFreeDictShardCacheForTests,
  findFreeDictMatch,
} from './freeDict';

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
});

