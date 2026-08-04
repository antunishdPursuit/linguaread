import { describe, expect, it, vi } from 'vitest';
import {
  createBrokerCandidates,
  createLanguageCacheKey,
  requestBrokerWordHelp,
} from './brokerLanguage';

const match = {
  headword: 'innovation',
  translations: [
    {
      gloss: 'The introduction of something new.',
      value: '創新',
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
      Array.from({ length: 12 }, (_, index) => ({
        gloss: `Meaning ${index}`,
        value: `翻譯${index}`,
      })),
    );
    expect(candidates).toHaveLength(8);
    expect(candidates[0]).toEqual({
      gloss: 'Meaning 0',
      id: 'freedict:0',
      kind: 'mandarin',
      value: '翻譯0',
    });
  });

  it('maps the selected supplied candidate into the word card', async () => {
    const fetchImplementation = vi.fn(async () =>
      new Response(
        JSON.stringify({
          model: 'gemini-3.5-flash',
          promptVersion: 'candidate-selector-v1',
          result: {
            candidateId: 'freedict:0',
            confidence: 0.96,
            decision: 'use_candidate',
            reason: 'This translation fits the sentence.',
            tokenType: 'common_word',
          },
        }),
      ),
    );

    const result = await requestBrokerWordHelp(
      {
        match,
        sentenceContext: 'The company invested in innovation.',
        sourceWord: 'innovation',
      },
      fetchImplementation,
      storage(),
    );

    expect(result).toMatchObject({
      action: 'use_mandarin',
      cefr: 'B2',
      definition: 'The introduction of something new.',
      lemma: 'innovation',
      mandarin: '創新',
      pinyin: 'chuàng xīn',
      sourceWord: 'innovation',
    });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it('rejects keep-English decisions without inventing a translation', async () => {
    const fetchImplementation = vi.fn(async () =>
      new Response(
        JSON.stringify({
          model: 'gemini-3.5-flash',
          promptVersion: 'candidate-selector-v1',
          result: {
            candidateId: null,
            confidence: 0.92,
            decision: 'keep_english',
            reason: 'The selected word is a proper name.',
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
