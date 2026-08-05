import { beforeEach, describe, expect, it } from 'vitest';
import { normalizeLookupWord } from './dictionaryLookup';
import {
  clearFreeDictShardCacheForTests,
  findFreeDictMatch,
} from './freeDict';

beforeEach(() => {
  clearFreeDictShardCacheForTests();
});

describe('FreeDict lookup', () => {
  it('normalizes formatting without changing the selected word form', () => {
    expect(normalizeLookupWord(' Controlled, ')).toBe('controlled');
    expect(normalizeLookupWord('Pursuing')).toBe('pursuing');
  });

  it('returns only the exact normalized headword', async () => {
    await expect(
      findFreeDictMatch('Controlled,', {
        fetch: async () =>
          new Response(
            JSON.stringify({
              controlled: [['Kept within limits.', '受控的']],
            }),
          ),
        getAssetUrl: (path) => `extension://${path}`,
      }),
    ).resolves.toEqual({
      headword: 'controlled',
      translations: [{ gloss: 'Kept within limits.', value: '受控的' }],
    });
  });

  it('does not invent a base form when the exact headword is absent', async () => {
    await expect(
      findFreeDictMatch('controlled', {
        fetch: async () =>
          new Response(
            JSON.stringify({
              control: [['To exercise influence over.', '控制']],
            }),
          ),
        getAssetUrl: (path) => `extension://${path}`,
      }),
    ).resolves.toBeNull();
  });

  it('returns null when the local dictionary has no candidate', async () => {
    await expect(
      findFreeDictMatch('qwertyuiop', {
        fetch: async () => new Response('{}'),
        getAssetUrl: (path) => `extension://${path}`,
      }),
    ).resolves.toBeNull();
  });
});
