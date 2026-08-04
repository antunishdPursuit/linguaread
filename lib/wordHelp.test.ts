import { describe, expect, it, vi } from 'vitest';
import { MOCK_LANGUAGE_RESULT } from './mockLanguage';
import { loadWordHelp } from './wordHelp';

function dependencies(
  overrides: Partial<Parameters<typeof loadWordHelp>[2]> = {},
) {
  return {
    findMatch: vi.fn().mockResolvedValue({
      headword: 'innovation',
      translations: [
        {
          gloss: 'The introduction of something new.',
          value: '創新',
        },
      ],
    }),
    readCache: vi.fn().mockResolvedValue(null),
    request: vi.fn().mockResolvedValue(MOCK_LANGUAGE_RESULT),
    writeCache: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('word help flow', () => {
  it('uses a cached result without loading candidates or calling the broker', async () => {
    const services = dependencies({
      readCache: vi.fn().mockResolvedValue(MOCK_LANGUAGE_RESULT),
    });

    await expect(
      loadWordHelp(
        'innovation',
        'The company invested in innovation.',
        services,
      ),
    ).resolves.toMatchObject({ source: 'cache', status: 'ready' });
    expect(services.findMatch).not.toHaveBeenCalled();
    expect(services.request).not.toHaveBeenCalled();
  });

  it('keeps English unchanged when the local dictionary has no match', async () => {
    const services = dependencies({
      findMatch: vi.fn().mockResolvedValue(null),
    });

    await expect(
      loadWordHelp(
        'innovation',
        'The company invested in innovation.',
        services,
      ),
    ).resolves.toMatchObject({
      message: expect.stringContaining('local dictionary'),
      status: 'error',
    });
    expect(services.request).not.toHaveBeenCalled();
  });

  it('requests and caches one validated result', async () => {
    const services = dependencies();

    await expect(
      loadWordHelp(
        'innovation',
        'The company invested in innovation.',
        services,
      ),
    ).resolves.toMatchObject({ source: 'broker', status: 'ready' });
    expect(services.request).toHaveBeenCalledTimes(1);
    expect(services.writeCache).toHaveBeenCalledTimes(1);
  });

  it('keeps the English word unchanged when confidence is low', async () => {
    const services = dependencies({
      request: vi.fn().mockResolvedValue({
        ...MOCK_LANGUAGE_RESULT,
        confidence: 0.4,
      }),
    });

    await expect(
      loadWordHelp(
        'innovation',
        'The company invested in innovation.',
        services,
      ),
    ).resolves.toMatchObject({ status: 'error' });
    expect(services.writeCache).not.toHaveBeenCalled();
  });
});
