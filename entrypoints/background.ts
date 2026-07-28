import {
  OPEN_READER_MESSAGE,
  PDF_LAUNCH_STORAGE_KEY,
  PANEL_VIEW_STORAGE_KEY,
  isPdfUrl,
  type OpenReaderMessage,
  type OpenReaderResponse,
  type PdfLaunchContext,
} from '../lib/pdfLaunch';

export default defineBackground(() => {
  void chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => {
      console.error('LinguaRead could not configure its side panel.', error);
    });

  browser.runtime.onMessage.addListener(
    (
      message: OpenReaderMessage,
      _sender,
      sendResponse: (response: OpenReaderResponse) => void,
    ) => {
      if (message?.type !== OPEN_READER_MESSAGE) return false;

      void (async () => {
        try {
          await browser.tabs.create({
            url: browser.runtime.getURL('/viewer.html'),
          });
          sendResponse({
            ok: true,
            usedFilePickerFallback: Boolean(
              isPdfUrl(message.sourceUrl) &&
                message.sourceUrl.startsWith('file:'),
            ),
          });
        } catch (error) {
          sendResponse({
            error:
              error instanceof Error
                ? error.message
                : 'Chrome could not open the LinguaRead reader.',
            ok: false,
            usedFilePickerFallback: false,
          });
        }
      })();

      return true;
    },
  );

  browser.action.onClicked.addListener(async (tab) => {
    const context: PdfLaunchContext | null = isPdfUrl(tab.url)
      ? {
          capturedAt: Date.now(),
          title: tab.title || 'Selected PDF',
          url: tab.url,
        }
      : null;

    await browser.storage.session.set({
      [PDF_LAUNCH_STORAGE_KEY]: context,
      [PANEL_VIEW_STORAGE_KEY]: 'launch',
    });
  });
});
