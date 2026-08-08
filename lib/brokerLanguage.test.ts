import { describe, expect, it, vi } from 'vitest';
import {
  createBrokerCandidates,
  createLanguageCacheKey,
  requestBrokerWordHelp,
} from './brokerLanguage';

const match = {
  headword: 'produce',
  translations: [
    {
      gloss:
        'n. fresh fruits and vegetable grown for the market v. bring forth or yield v. create or manufacture a man-made product',
      headword: 'produce',
      lookup: 'lemma' as const,
      source: 'ecdict' as const,
      value: '生产',
    },
  ],
};

function storage() {
  return {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue(undefined),
  };
}

describe('language broker client', () => {
  it('bounds local candidates for the broker contract', () => {
    const candidates = createBrokerCandidates(
      Array.from({ length: 16 }, (_, index) => ({
        gloss: `Meaning ${index}`,
        headword: 'example',
        lookup: 'exact' as const,
        source: index % 2 === 0 ? ('freedict' as const) : ('ecdict' as const),
        value: `翻譯${index}`,
      })),
    );
    expect(candidates).toHaveLength(12);
    expect(candidates[0]).toEqual({
      gloss: 'Meaning 0',
      id: 'freedict:0',
      kind: 'mandarin',
      value: '翻譯0',
    });
  });

  it('maps the selected context-matched sense into the complete word card', async () => {
    const fetchImplementation = vi.fn(async () =>
      new Response(
        JSON.stringify({
          model: 'gemini-3.5-flash',
          promptVersion: 'candidate-selector-v2',
          result: {
            candidateId: 'ecdict:0',
            confidence: 0.96,
            decision: 'use_candidate',
            reason: "This translation fits the sentence (ecdict:0).",
            selectedSense: 'create or manufacture a man-made product',
            tokenType: 'common_word',
          },
        }),
      ),
    );

    const result = await requestBrokerWordHelp(
      {
        match,
        sentenceContext:
          'They have a track record of producing powerful automobiles.',
        sourceWord: 'producing',
      },
      fetchImplementation,
      storage(),
    );

    expect(result).toMatchObject({
      action: 'use_mandarin',
      cefr: 'B2',
      contextualExample:
        'They have a track record of producing powerful automobiles.',
      definition: 'Create or manufacture a man-made product.',
      simplerEnglish: 'create or manufacture a man-made product',
      lemma: 'produce',
      mandarin: '生产',
      pinyin: 'shēng chǎn',
      sourceWord: 'producing',
      usageNote: 'This translation fits the sentence.',
    });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it('rejects keep-English decisions without inventing a translation', async () => {
    const fetchImplementation = vi.fn(async () =>
      new Response(
        JSON.stringify({
          model: 'gemini-3.5-flash',
          promptVersion: 'candidate-selector-v2',
          result: {
            candidateId: null,
            confidence: 0.92,
            decision: 'keep_english',
            reason: 'The selected word is a proper name.',
            selectedSense: null,
            tokenType: 'proper_name',
          },
        }),
      ),
    );

    await expect(
      requestBrokerWordHelp(
        {
          match,
          sentenceContext: 'Innovation spoke at the event.',
          sourceWord: 'Innovation',
        },
        fetchImplementation,
        storage(),
      ),
    ).rejects.toMatchObject({ code: 'candidate_rejected' });
  });

  it('creates a stable cache key for the approved broker version', () => {
    expect(
      createLanguageCacheKey(
        'Innovation',
        'The company invested in innovation.',
      ),
    ).toBe(
      createLanguageCacheKey(
        ' innovation ',
        'The   company invested in innovation.',
      ),
    );
  });
});
