import { describe, expect, it, vi } from 'vitest';
import {
  DictionaryShardUnavailableError,
  loadCachedDictionaryShard,
} from './dictionaryShard';

describe('dictionary shard loading', () => {
  it('retries one transient response and caches the successful shard', async () => {
    const cache = new Map<string, Promise<Record<string, string>>>();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ innovation: '创新' })),
      );
    const options = {
      cache,
      fetch,
      name: 'in',
      parse: (value: unknown) => value as Record<string, string>,
      url: 'extension://data/in.json',
    };

    await expect(loadCachedDictionaryShard(options)).resolves.toEqual({
      innovation: '创新',
    });
    await expect(loadCachedDictionaryShard(options)).resolves.toEqual({
      innovation: '创新',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('removes a failed request from the cache so a later retry can recover', async () => {
    const cache = new Map<string, Promise<Record<string, string>>>();
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('temporary failure'))
      .mockRejectedValueOnce(new TypeError('temporary failure'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ pursuing: '追求' })),
      );
    const options = {
      cache,
      fetch,
      name: 'pu',
      parse: (value: unknown) => value as Record<string, string>,
      url: 'extension://data/pu.json',
    };

    await expect(loadCachedDictionaryShard(options)).rejects.toBeInstanceOf(
      DictionaryShardUnavailableError,
    );
    await expect(loadCachedDictionaryShard(options)).resolves.toEqual({
      pursuing: '追求',
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry a permanent missing-asset response', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response('', { status: 404 }),
    );

    await expect(
      loadCachedDictionaryShard({
        cache: new Map(),
        fetch,
        name: 'missing',
        parse: (value: unknown) => value,
        url: 'extension://data/missing.json',
      }),
    ).rejects.toBeInstanceOf(DictionaryShardUnavailableError);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
