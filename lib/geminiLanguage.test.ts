import { describe, expect, it, vi } from 'vitest';
import {
  buildGeminiInteractionBody,
  createGeminiLanguageCacheKey,
  GeminiLanguageError,
  requestGeminiWordHelp,
} from './geminiLanguage';

const validFields = {
  action: 'use_synonym',
  cefr: 'B2',
  confidence: 0.92,
  contextualExample: 'The company attributed its success to careful planning.',
  definition: 'said or believed that something was caused by something else',
  displayWord: 'linked',
  lemma: 'attribute',
  mandarin: '归因于',
  pinyin: 'guī yīn yú',
  shortMeaning: 'said something was caused by something else',
  simplerEnglish: 'linked',
  usageNote: 'Often used as “attribute something to something.”',
};

function interactionWithText(text: string) {
  return {
    steps: [
      {
        type: 'model_output',
        content: [{ type: 'text', text }],
      },
    ],
  };
}

describe('Gemini language service', () => {
  it('builds a structured B2 request without including an API key', () => {
    const body = buildGeminiInteractionBody(
      'attributed',
      'Ferrari leaders attributed the company’s success to its history.',
    );
    const serialized = JSON.stringify(body);

    expect(body.model).toBe('gemini-3.1-flash-lite');
    expect(body.response_format).toMatchObject({
      mime_type: 'application/json',
      type: 'text',
    });
    expect(serialized).toContain('B2 level');
    expect(serialized).toContain('<word>attributed</word>');
    expect(serialized).not.toContain('apiKey');
  });

  it('parses a structured Interactions API response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(interactionWithText(JSON.stringify(validFields))), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await requestGeminiWordHelp(
      {
        apiKey: 'tester-key',
        sourceWord: 'attributed',
        sentenceContext:
          'Ferrari leaders attributed the company’s success to its history.',
      },
      fetchMock,
    );

    expect(result).toMatchObject({
      ...validFields,
      sourceWord: 'attributed',
    });
    expect(result.id).toMatch(/^attribute-/);

    const [, options] = fetchMock.mock.calls[0];
    expect(options?.headers).toMatchObject({
      'x-goog-api-key': 'tester-key',
    });
    expect(options?.body).not.toContain('tester-key');
  });

  it('rejects malformed model output instead of inventing missing fields', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify(
          interactionWithText(
            JSON.stringify({ ...validFields, mandarin: '' }),
          ),
        ),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(
      requestGeminiWordHelp(
        {
          apiKey: 'tester-key',
          sourceWord: 'attributed',
          sentenceContext:
            'Ferrari leaders attributed the company’s success to its history.',
        },
        fetchMock,
      ),
    ).rejects.toMatchObject({
      code: 'response_invalid',
    });
  });

  it('reports request failures without exposing the tester key', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('rate limited', { status: 429 }),
    );

    const error = await requestGeminiWordHelp(
      {
        apiKey: 'private-tester-key',
        sourceWord: 'attributed',
        sentenceContext:
          'Ferrari leaders attributed the company’s success to its history.',
      },
      fetchMock,
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(GeminiLanguageError);
    expect((error as Error).message).toContain('429');
    expect((error as Error).message).not.toContain('private-tester-key');
  });

  it('creates stable context-specific cache keys', () => {
    const first = createGeminiLanguageCacheKey(
      'Attributed',
      'The result was attributed to planning.',
    );
    const same = createGeminiLanguageCacheKey(
      'attributed',
      'The   result was attributed to planning.',
    );
    const different = createGeminiLanguageCacheKey(
      'attributed',
      'The delay was attributed to weather.',
    );

    expect(first).toBe(same);
    expect(first).not.toBe(different);
  });
});
