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
    { gloss: 'Outside of.', value: '在外' },
  ],
};

describe('local dictionary', () => {
  it('interleaves sources and removes duplicate Chinese candidates', () => {
    expect(
      mergeDictionaryMatches(
        [
          { lookup: 'exact', match: freeDict, source: 'freedict' },
          { lookup: 'exact', match: ecDict, source: 'ecdict' },
        ],
        'without',
      ),
    ).toEqual({
      headword: 'without',
      translations: [
        {
          gloss: 'Not doing something.',
          headword: 'without',
          lookup: 'exact',
          source: 'freedict',
          value: '没有',
        },
        {
          gloss: 'Outside.',
          headword: 'without',
          lookup: 'exact',
          source: 'freedict',
          value: '外面',
        },
        {
          gloss: 'Not.',
          headword: 'without',
          lookup: 'exact',
          source: 'ecdict',
          value: '不',
        },
        {
          gloss: 'Outside of.',
          headword: 'without',
          lookup: 'exact',
          source: 'ecdict',
          value: '在外',
        },
      ],
    });
  });

  it('loads both sources and keeps a single-source result', async () => {
    const findFreeDictMatch = vi.fn().mockResolvedValue(null);
    const findEcDictLookup = vi
      .fn()
      .mockResolvedValue({ lemma: null, match: ecDict });

    await expect(
      findLocalDictionaryMatch('without', {
        findEcDictLookup,
        findFreeDictMatch,
      }),
    ).resolves.toMatchObject({
      headword: 'without',
      translations: [
        { source: 'ecdict', value: '没有' },
        { source: 'ecdict', value: '不' },
        { source: 'ecdict', value: '在外' },
      ],
    });
    expect(findFreeDictMatch).toHaveBeenCalledOnce();
    expect(findEcDictLookup).toHaveBeenCalledOnce();
  });

  it('uses one dictionary when the other source is temporarily unavailable', async () => {
    await expect(
      findLocalDictionaryMatch('without', {
        findEcDictLookup: vi
          .fn()
          .mockResolvedValue({ lemma: null, match: ecDict }),
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
        findEcDictLookup: vi.fn().mockRejectedValue(new Error('unavailable')),
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

    const merged = mergeDictionaryMatches(
      [
        { lookup: 'exact', match: narrowFreeDict, source: 'freedict' },
        { lookup: 'exact', match: broadEcDict, source: 'ecdict' },
      ],
      'further',
    );
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

  it('ranks exact inflected candidates before verified lemma candidates', async () => {
    const exactPursuing = {
      headword: 'pursuing',
      translations: [{ gloss: 'Continuing.', value: '进行' }],
    };
    const basePursue = {
      headword: 'pursue',
      translations: [{ gloss: 'Follow an objective.', value: '追求' }],
    };
    const findEcDictLookup = vi.fn(async (word: string) =>
      word === 'pursuing'
        ? { lemma: 'pursue', match: exactPursuing }
        : { lemma: null, match: basePursue },
    );
    const findFreeDictMatch = vi.fn(async (word: string) =>
      word === 'pursue' ? basePursue : null,
    );

    await expect(
      findLocalDictionaryMatch('Pursuing,', {
        findEcDictLookup,
        findFreeDictMatch,
      }),
    ).resolves.toMatchObject({
      headword: 'pursue',
      translations: [
        {
          headword: 'pursuing',
          lookup: 'exact',
          value: '进行',
        },
        {
          headword: 'pursue',
          lookup: 'lemma',
          value: '追求',
        },
      ],
    });
    expect(findEcDictLookup).toHaveBeenNthCalledWith(1, 'pursuing');
    expect(findEcDictLookup).toHaveBeenNthCalledWith(2, 'pursue');
  });

  it('does not derive a suffix-based lemma when metadata has none', async () => {
    const morning = {
      headword: 'morning',
      translations: [{ gloss: 'Time before noon.', value: '早晨' }],
    };
    const findEcDictLookup = vi
      .fn()
      .mockResolvedValue({ lemma: null, match: morning });
    const findFreeDictMatch = vi.fn().mockResolvedValue(null);

    await expect(
      findLocalDictionaryMatch('morning', {
        findEcDictLookup,
        findFreeDictMatch,
      }),
    ).resolves.toMatchObject({
      headword: 'morning',
      translations: [{ headword: 'morning', lookup: 'exact' }],
    });
    expect(findEcDictLookup).toHaveBeenCalledOnce();
    expect(findFreeDictMatch).toHaveBeenCalledOnce();
  });
});
