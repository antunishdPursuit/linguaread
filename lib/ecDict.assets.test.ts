import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

type EcDictEntry = [definition: string, translations: string[]];
type EcDictShard = [
  entries: Record<string, EcDictEntry>,
  lemmas: Record<string, string>,
];

async function readShard(name: string): Promise<EcDictShard> {
  const url = new URL(`../public/data/ecdict/${name}.json`, import.meta.url);
  return JSON.parse(await readFile(url, 'utf-8')) as EcDictShard;
}

describe('packaged ECDICT assets', () => {
  it('includes clean candidates for the reported lookup failures', async () => {
    const [furtherShard, withoutShard] = await Promise.all([
      readShard('fu'),
      readShard('wi'),
    ]);

    expect(furtherShard[0].further).toEqual([
      expect.any(String),
      expect.arrayContaining(['更进一步地']),
    ]);
    expect(withoutShard[0].without).toEqual([
      expect.any(String),
      expect.arrayContaining(['没有', '不', '在...之外']),
    ]);
  });
});
