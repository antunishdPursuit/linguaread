import { describe, expect, it } from 'vitest';
import { isPdfUrl, pdfNameFromUrl } from './pdfLaunch';

describe('PDF launch helpers', () => {
  it('accepts local and web PDF URLs', () => {
    expect(isPdfUrl('file:///C:/Users/Dennis/Downloads/example.pdf')).toBe(true);
    expect(isPdfUrl('https://example.com/files/reading.PDF?download=1')).toBe(
      true,
    );
  });

  it('rejects unsupported pages and protocols', () => {
    expect(isPdfUrl('https://example.com/article')).toBe(false);
    expect(isPdfUrl('chrome://extensions/')).toBe(false);
    expect(isPdfUrl('not a URL')).toBe(false);
  });

  it('returns a readable PDF name', () => {
    expect(
      pdfNameFromUrl(
        'https://example.com/files/MIT%20CASE%20-%20Ferrari%202025.pdf',
      ),
    ).toBe('MIT CASE - Ferrari 2025.pdf');
  });
});
