import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearFreeDictShardCacheForTests,
  createHeadwordCandidates,
  findFreeDictMatch,
} from './freeDict';

beforeEach(() => {
  clearFreeDictShardCacheForTests();
});

describe('FreeDict lookup', () => {
  it('creates conservative lookup forms for common inflections', () => {
    expect(createHeadwordCandidates('Controlled')).toContain('control');
    expect(createHeadwordCandidates('producing')).toContain('produce');
    expect(createHeadwordCandidates('attributed')).toContain('attribute');
    expect(createHeadwordCandidates('Innovation')).toEqual(['innovation']);
  });

  it('returns the first available normalized headword', async () => {
    const fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          control: [['To exercise influence over.', '控制']],
        }),
      ),
    );

    await expect(
      findFreeDictMatch('controlled', {
        fetch,
        getAssetUrl: (path) => `extension://${path}`,
      }),
    ).resolves.toEqual({
      headword: 'control',
      translations: [
        { gloss: 'To exercise influence over.', value: '控制' },
      ],
    });
    expect(fetch).toHaveBeenCalledOnce();
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
