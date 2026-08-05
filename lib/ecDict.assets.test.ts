import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function readShard(name: string): Promise<Record<string, unknown>> {
  const url = new URL(`../public/data/ecdict/${name}.json`, import.meta.url);
  return JSON.parse(await readFile(url, 'utf-8')) as Record<string, unknown>;
}

describe('packaged ECDICT assets', () => {
  it('includes clean candidates for the reported lookup failures', async () => {
    const [furtherShard, withoutShard] = await Promise.all([
      readShard('fu'),
      readShard('wi'),
    ]);

    expect(furtherShard.further).toEqual([
      expect.any(String),
      expect.arrayContaining(['更进一步地']),
    ]);
    expect(withoutShard.without).toEqual([
      expect.any(String),
      expect.arrayContaining(['没有', '不', '在...之外']),
    ]);
  });
});
