import { describe, expect, it } from 'vitest';
import {
  isPdfUrl,
  pdfNameFromUrl,
  toolbarTitleForPdf,
  viewerUrlForPdf,
} from './pdfLaunch';

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

  it('passes the selected PDF to the extension reader', () => {
    const source = 'https://example.com/files/example.pdf';
    const viewerUrl = viewerUrlForPdf(
      'chrome-extension://example/viewer.html',
      source,
    );
    expect(new URL(viewerUrl).searchParams.get('source')).toBe(source);
  });

  it('passes a temporary local PDF transfer to the extension reader', () => {
    const viewerUrl = viewerUrlForPdf(
      'chrome-extension://example/viewer.html',
      'file:///C:/Users/Dennis/Downloads/example.pdf',
      'transfer-123',
    );

    expect(new URL(viewerUrl).searchParams.get('transfer')).toBe(
      'transfer-123',
    );
  });

  it('describes the selected PDF in the toolbar', () => {
    expect(
      toolbarTitleForPdf(
        'file:///C:/Users/Dennis/Downloads/MIT%20CASE%20-%20Ferrari%202025.pdf',
      ),
    ).toBe('Open MIT CASE - Ferrari 2025.pdf with LinguaRead');
  });
});
