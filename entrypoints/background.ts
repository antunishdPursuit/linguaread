import {
  PDF_LAUNCH_STORAGE_KEY,
  isPdfUrl,
  type PdfLaunchContext,
} from '../lib/pdfLaunch';

export default defineBackground(() => {
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
    });

    if (tab.id !== undefined) {
      await chrome.sidePanel.open({ tabId: tab.id });
      return;
    }

    if (tab.windowId !== undefined) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
  });
});
