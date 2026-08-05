import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearEcDictShardCacheForTests,
  findEcDictMatch,
} from './ecDict';

beforeEach(() => {
  clearEcDictShardCacheForTests();
});

describe('ECDICT lookup', () => {
  it('loads the two-letter shard and expands its compact entry', async () => {
    const fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          further: [
            'To or at a greater extent or degree.',
            ['更远的', '更进一步地', '此外'],
          ],
        }),
      ),
    );

    await expect(
      findEcDictMatch('further', {
        fetch,
        getAssetUrl: (path) => `extension://${path}`,
      }),
    ).resolves.toEqual({
      headword: 'further',
      translations: [
        { gloss: 'To or at a greater extent or degree.', value: '更远的' },
        { gloss: 'To or at a greater extent or degree.', value: '更进一步地' },
        { gloss: 'To or at a greater extent or degree.', value: '此外' },
      ],
    });
    expect(fetch).toHaveBeenCalledWith('extension://data/ecdict/fu.json');
  });

  it('returns null for a missing or malformed entry', async () => {
    await expect(
      findEcDictMatch('without', {
        fetch: async () =>
          new Response(JSON.stringify({ without: ['definition', []] })),
        getAssetUrl: (path) => `extension://${path}`,
      }),
    ).resolves.toBeNull();
  });
});
