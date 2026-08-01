export const AUTO_PROMPT_STORAGE_KEY = 'linguareadAutoPrompt';
export const PROMPTED_PDF_TABS_STORAGE_KEY = 'linguareadPromptedPdfTabs';
export const OPEN_READER_MESSAGE = 'linguaread:open-reader';

export type AutoPromptContext = {
  expiresAt: number;
  tabId: number;
  url: string;
};

export type OpenReaderMessage = {
  type: typeof OPEN_READER_MESSAGE;
  sourceUrl: string;
  transferId?: string;
};

export type OpenReaderResponse = {
  error?: string;
  ok: boolean;
  permissionRequired: boolean;
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

export function viewerUrlForPdf(
  viewerBaseUrl: string,
  sourceUrl: string,
  transferId?: string,
): string {
  const viewerUrl = new URL(viewerBaseUrl);
  viewerUrl.searchParams.set('source', sourceUrl);
  if (transferId) viewerUrl.searchParams.set('transfer', transferId);
  return viewerUrl.toString();
}

export function toolbarTitleForPdf(url: string): string {
  return `Open ${pdfNameFromUrl(url)} with LinguaRead`;
}
