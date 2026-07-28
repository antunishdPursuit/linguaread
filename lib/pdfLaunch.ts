export const PDF_LAUNCH_STORAGE_KEY = 'linguareadPdfLaunch';

export type PdfLaunchContext = {
  capturedAt: number;
  title: string;
  url: string;
};

export function isPdfUrl(url?: string): url is string {
  if (!url) return false;

  try {
    const parsedUrl = new URL(url);
    return (
      ['file:', 'http:', 'https:'].includes(parsedUrl.protocol) &&
      parsedUrl.pathname.toLowerCase().endsWith('.pdf')
    );
  } catch {
    return false;
  }
}

export function pdfNameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const encodedName = pathname.split('/').filter(Boolean).at(-1);
    return encodedName ? decodeURIComponent(encodedName) : 'Selected PDF';
  } catch {
    return 'Selected PDF';
  }
}

export function viewerUrlForPdf(url: string): string {
  const viewerUrl = new URL(browser.runtime.getURL('/viewer.html'));
  viewerUrl.searchParams.set('source', url);
  return viewerUrl.toString();
}
