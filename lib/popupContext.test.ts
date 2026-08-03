import { describe, expect, it } from 'vitest';
import {
  popupContextForUrl,
  toolbarTitleForContext,
} from './popupContext';

const READER_URL = 'chrome-extension://example/viewer.html';

describe('popup context', () => {
  it('recognizes local and remote PDFs', () => {
    expect(
      popupContextForUrl(
        'file:///C:/Users/Dennis/Downloads/example.pdf',
        READER_URL,
      ),
    ).toBe('pdf');
    expect(
      popupContextForUrl(
        'https://example.com/reading.PDF?download=1',
        READER_URL,
      ),
    ).toBe('pdf');
  });

  it('recognizes the LinguaRead reader', () => {
    expect(
      popupContextForUrl(
        `${READER_URL}?source=https%3A%2F%2Fexample.com%2Freading.pdf`,
        READER_URL,
      ),
    ).toBe('reader');
  });

  it('uses the standalone reader action for regular and unsupported pages', () => {
    expect(
      popupContextForUrl('https://example.com/article', READER_URL),
    ).toBe('page');
    expect(popupContextForUrl('chrome://extensions/', READER_URL)).toBe(
      'page',
    );
    expect(popupContextForUrl(undefined, READER_URL)).toBe('page');
  });

  it('describes the useful non-PDF toolbar action', () => {
    expect(toolbarTitleForContext('page')).toBe('Open LinguaRead');
    expect(toolbarTitleForContext('reader')).toBe('Open Dictionary');
  });
});
