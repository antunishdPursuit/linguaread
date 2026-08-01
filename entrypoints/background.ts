import {
  AUTO_PROMPT_STORAGE_KEY,
  OPEN_READER_MESSAGE,
  PROMPTED_PDF_TABS_STORAGE_KEY,
  isPdfUrl,
  toolbarTitleForPdf,
  viewerUrlForPdf,
  type AutoPromptContext,
  type OpenReaderMessage,
  type OpenReaderResponse,
} from '../lib/pdfLaunch';

type PromptedPdfTabs = Record<string, string>;

const DEFAULT_ACTION_TITLE = 'LinguaRead — open a PDF to begin';
const AUTO_PROMPT_DURATION_MS = 4_000;
const READER_PATH = '/viewer.html';
const SIDE_PANEL_PATH = '/sidepanel.html';

async function readPromptedPdfTabs(): Promise<PromptedPdfTabs> {
  const stored = await browser.storage.session.get(
    PROMPTED_PDF_TABS_STORAGE_KEY,
  );
  return (
    (stored[PROMPTED_PDF_TABS_STORAGE_KEY] as PromptedPdfTabs | undefined) ?? {}
  );
}

async function markPdfPrompted(tabId: number, url: string): Promise<void> {
  const promptedTabs = await readPromptedPdfTabs();
  await browser.storage.session.set({
    [PROMPTED_PDF_TABS_STORAGE_KEY]: {
      ...promptedTabs,
      [tabId]: url,
    },
  });
}

async function clearPromptedTab(tabId: number): Promise<void> {
  const promptedTabs = await readPromptedPdfTabs();
  if (!(tabId in promptedTabs)) return;

  delete promptedTabs[tabId];
  await browser.storage.session.set({
    [PROMPTED_PDF_TABS_STORAGE_KEY]: promptedTabs,
  });
}

function isReaderUrl(url?: string): boolean {
  return Boolean(url?.startsWith(browser.runtime.getURL(READER_PATH)));
}

async function configureTab(tab: Browser.tabs.Tab, showPrompt: boolean) {
  if (tab.id === undefined) return;

  const tabId = tab.id;
  const url = tab.url;
  const isPdf = isPdfUrl(url);
  const isReader = isReaderUrl(url);

  await chrome.sidePanel.setOptions({
    enabled: isReader,
    path: SIDE_PANEL_PATH,
    tabId,
  });

  if (!isPdf) {
    await Promise.all([
      chrome.action.setBadgeText({ tabId, text: '' }),
      chrome.action.setTitle({ tabId, title: DEFAULT_ACTION_TITLE }),
    ]);
    return;
  }

  await Promise.all([
    chrome.action.setBadgeBackgroundColor({ color: '#c95d42', tabId }),
    chrome.action.setBadgeText({ tabId, text: 'PDF' }),
    chrome.action.setTitle({ tabId, title: toolbarTitleForPdf(url) }),
  ]);

  if (!showPrompt || !tab.active || tab.windowId === undefined) return;

  const promptedTabs = await readPromptedPdfTabs();
  if (promptedTabs[tabId] === url) return;

  const settings = await chrome.action.getUserSettings();
  if (!settings.isOnToolbar) return;

  await markPdfPrompted(tabId, url);
  const promptContext: AutoPromptContext = {
    expiresAt: Date.now() + AUTO_PROMPT_DURATION_MS,
    tabId,
    url,
  };
  await browser.storage.session.set({
    [AUTO_PROMPT_STORAGE_KEY]: promptContext,
  });

  try {
    await chrome.action.openPopup({ windowId: tab.windowId });
  } catch (error) {
    await browser.storage.session.remove(AUTO_PROMPT_STORAGE_KEY);
    console.info(
      'LinguaRead could not show the automatic toolbar prompt. The toolbar badge remains available.',
      error,
    );
  }
}

function configureTabSafely(tab: Browser.tabs.Tab, showPrompt: boolean): void {
  void configureTab(tab, showPrompt).catch((error) => {
    console.error('LinguaRead could not update this tab.', error);
  });
}

export default defineBackground(() => {
  void chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: false })
    .catch((error) => {
      console.error('LinguaRead could not configure its side panel.', error);
    });

  void browser.tabs.query({}).then((tabs) => {
    tabs.forEach((tab) => configureTabSafely(tab, false));
  });

  browser.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete' && !changeInfo.url) return;
    configureTabSafely(tab, changeInfo.status === 'complete');
  });

  browser.tabs.onActivated.addListener(({ tabId }) => {
    void browser.tabs
      .get(tabId)
      .then((tab) => configureTabSafely(tab, true))
      .catch((error) => {
        console.error('LinguaRead could not read the active tab.', error);
      });
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    void clearPromptedTab(tabId);
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
          if (!isPdfUrl(message.sourceUrl)) {
            sendResponse({
              error: 'The current tab is not a supported PDF.',
              ok: false,
              permissionRequired: false,
            });
            return;
          }

          const readerTab = await browser.tabs.create({
            url: viewerUrlForPdf(
              browser.runtime.getURL(READER_PATH),
              message.sourceUrl,
              message.transferId,
            ),
          });
          if (readerTab.id !== undefined) {
            await chrome.sidePanel.setOptions({
              enabled: true,
              path: SIDE_PANEL_PATH,
              tabId: readerTab.id,
            });
          }

          sendResponse({
            ok: true,
            permissionRequired: false,
          });
        } catch (error) {
          sendResponse({
            error:
              error instanceof Error
                ? error.message
                : 'Chrome could not open the LinguaRead reader.',
            ok: false,
            permissionRequired: false,
          });
        }
      })();

      return true;
    },
  );
});
