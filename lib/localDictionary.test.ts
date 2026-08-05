import { describe, expect, it, vi } from 'vitest';
import {
  findLocalDictionaryMatch,
  LocalDictionaryUnavailableError,
  mergeDictionaryMatches,
} from './localDictionary';

const freeDict = {
  headword: 'without',
  translations: [
    { gloss: 'Not doing something.', value: '没有' },
    { gloss: 'Outside.', value: '外面' },
  ],
};

const ecDict = {
  headword: 'without',
  translations: [
    { gloss: 'In the absence of.', value: '没有' },
    { gloss: 'Not.', value: '不' },
    { gloss: 'Outside of.', value: '在...之外' },
  ],
};

describe('local dictionary', () => {
  it('interleaves sources and removes duplicate Chinese candidates', () => {
    expect(mergeDictionaryMatches(freeDict, ecDict)).toEqual({
      headword: 'without',
      translations: [
        { gloss: 'Not doing something.', source: 'freedict', value: '没有' },
        { gloss: 'Outside.', source: 'freedict', value: '外面' },
        { gloss: 'Not.', source: 'ecdict', value: '不' },
        { gloss: 'Outside of.', source: 'ecdict', value: '在...之外' },
      ],
    });
  });

  it('loads both sources and keeps a single-source result', async () => {
    const findFreeDictMatch = vi.fn().mockResolvedValue(null);
    const findEcDictMatch = vi.fn().mockResolvedValue(ecDict);

    await expect(
      findLocalDictionaryMatch('without', {
        findEcDictMatch,
        findFreeDictMatch,
      }),
    ).resolves.toMatchObject({
      headword: 'without',
      translations: [
        { source: 'ecdict', value: '没有' },
        { source: 'ecdict', value: '不' },
        { source: 'ecdict', value: '在...之外' },
      ],
    });
    expect(findFreeDictMatch).toHaveBeenCalledOnce();
    expect(findEcDictMatch).toHaveBeenCalledOnce();
  });

  it('uses one dictionary when the other source is temporarily unavailable', async () => {
    await expect(
      findLocalDictionaryMatch('without', {
        findEcDictMatch: vi.fn().mockResolvedValue(ecDict),
        findFreeDictMatch: vi.fn().mockRejectedValue(new Error('unavailable')),
      }),
    ).resolves.toMatchObject({
      headword: 'without',
      translations: [
        { source: 'ecdict' },
        { source: 'ecdict' },
        { source: 'ecdict' },
      ],
    });
  });

  it('reports unavailability only when both dictionary sources fail', async () => {
    await expect(
      findLocalDictionaryMatch('without', {
        findEcDictMatch: vi.fn().mockRejectedValue(new Error('unavailable')),
        findFreeDictMatch: vi.fn().mockRejectedValue(new Error('unavailable')),
      }),
    ).rejects.toBeInstanceOf(LocalDictionaryUnavailableError);
  });

  it('keeps later ECDICT senses inside the twelve-candidate broker limit', () => {
    const broadEcDict = {
      headword: 'further',
      translations: Array.from({ length: 8 }, (_, index) => ({
        gloss: `ECDICT meaning ${index}`,
        value: index === 6 ? '更进一步地' : `候选${index}`,
      })),
    };
    const narrowFreeDict = {
      headword: 'further',
      translations: Array.from({ length: 4 }, (_, index) => ({
        gloss: `FreeDict meaning ${index}`,
        value: `翻译${index}`,
      })),
    };

    const merged = mergeDictionaryMatches(narrowFreeDict, broadEcDict);
    expect(merged?.translations).toHaveLength(12);
    expect(merged?.translations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'ecdict',
          value: '更进一步地',
        }),
      ]),
    );
  });
});
