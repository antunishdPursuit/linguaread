export type PopupContextKind = 'page' | 'pdf' | 'reader';

export function popupContextForUrl(
  url: string | undefined,
  readerUrl: string,
): PopupContextKind {
  if (url?.startsWith(readerUrl)) return 'reader';

  if (url) {
    try {
      const parsedUrl = new URL(url);
      if (
        ['file:', 'http:', 'https:'].includes(parsedUrl.protocol) &&
        parsedUrl.pathname.toLowerCase().endsWith('.pdf')
      ) {
        return 'pdf';
      }
    } catch {
      // Unsupported or malformed URLs use the normal page action.
    }
  }

  return 'page';
}

export function toolbarTitleForContext(
  context: Exclude<PopupContextKind, 'pdf'>,
): string {
  return context === 'reader' ? 'Open Dictionary' : 'Open LinguaRead';
}
