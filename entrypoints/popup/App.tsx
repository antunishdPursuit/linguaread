import { useEffect, useRef, useState } from 'react';
import {
  AUTO_PROMPT_STORAGE_KEY,
  OPEN_READER_MESSAGE,
  pdfNameFromUrl,
  type AutoPromptContext,
  type OpenReaderResponse,
} from '../../lib/pdfLaunch';
import { storePdfTransfer } from '../../lib/pdfTransfer';
import {
  popupContextForUrl,
  type PopupContextKind,
} from '../../lib/popupContext';

type ActiveTabContext = {
  kind: PopupContextKind;
  tabId: number;
  title?: string;
  url: string;
};

function App() {
  const autoCloseTimer = useRef<number | null>(null);
  const [activeContext, setActiveContext] =
    useState<ActiveTabContext | null>(null);
  const [error, setError] = useState('');
  const [isOpening, setIsOpening] = useState(false);

  const stopAutoClose = () => {
    if (autoCloseTimer.current === null) return;
    window.clearTimeout(autoCloseTimer.current);
    autoCloseTimer.current = null;
  };

  useEffect(() => {
    const cancelOnInteraction = () => stopAutoClose();
    document.addEventListener('pointerdown', cancelOnInteraction, {
      once: true,
    });
    document.addEventListener('keydown', cancelOnInteraction, { once: true });

    void Promise.all([
      browser.tabs.query({ active: true, currentWindow: true }),
      browser.storage.session.get(AUTO_PROMPT_STORAGE_KEY),
    ])
      .then(async ([[tab], stored]) => {
        if (tab?.id === undefined) return;

        const kind = popupContextForUrl(
          tab.url,
          browser.runtime.getURL('/viewer.html'),
        );
        const nextContext = {
          kind,
          tabId: tab.id,
          title:
            kind === 'pdf' && tab.url
              ? tab.title || pdfNameFromUrl(tab.url)
              : undefined,
          url: tab.url || '',
        };
        setActiveContext(nextContext);

        const autoPrompt = stored[
          AUTO_PROMPT_STORAGE_KEY
        ] as AutoPromptContext | null | undefined;
        const openedAutomatically =
          kind === 'pdf' &&
          autoPrompt?.tabId === tab.id &&
          autoPrompt.url === tab.url &&
          autoPrompt.expiresAt > Date.now();
        await browser.storage.session.remove(AUTO_PROMPT_STORAGE_KEY);

        if (openedAutomatically) {
          autoCloseTimer.current = window.setTimeout(() => {
            window.close();
          }, Math.max(1_000, autoPrompt.expiresAt - Date.now()));
        }
      })
      .catch(() => {
        setError('LinguaRead could not read the current tab.');
      });

    return () => {
      stopAutoClose();
      document.removeEventListener('pointerdown', cancelOnInteraction);
      document.removeEventListener('keydown', cancelOnInteraction);
    };
  }, []);

  const openReader = async () => {
    if (activeContext?.kind !== 'pdf' || isOpening) return;

    stopAutoClose();
    setError('');
    setIsOpening(true);
    try {
      let transferId: string | undefined;
      if (activeContext.url.startsWith('file:')) {
        try {
          // A direct toolbar click grants activeTab; an automatic prompt does not.
          // Always continue to the reader so its file-picker recovery remains usable.
          const response = await fetch(activeContext.url);
          if (!response.ok) {
            throw new Error(
              `Temporary PDF access failed with status ${response.status}.`,
            );
          }
          transferId = await storePdfTransfer(
            await response.blob(),
            pdfNameFromUrl(activeContext.url),
          );
        } catch {
          transferId = undefined;
        }
      }

      const response = (await browser.runtime.sendMessage({
        type: OPEN_READER_MESSAGE,
        sourceUrl: activeContext.url,
        transferId,
      })) as OpenReaderResponse;
      if (!response?.ok) {
        throw new Error(response?.error || 'The reader did not open.');
      }
      window.close();
    } catch (caughtError) {
      setIsOpening(false);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'LinguaRead could not open the reader. Try again.',
      );
    }
  };

  const openStandaloneReader = async () => {
    if (isOpening) return;

    setError('');
    setIsOpening(true);
    try {
      await browser.tabs.create({
        url: browser.runtime.getURL('/viewer.html'),
      });
      window.close();
    } catch {
      setIsOpening(false);
      setError('LinguaRead could not open the reader. Try again.');
    }
  };

  const openDictionary = async () => {
    if (activeContext?.kind !== 'reader' || isOpening) return;

    setError('');
    setIsOpening(true);
    try {
      await chrome.sidePanel.setOptions({
        enabled: true,
        path: '/sidepanel.html',
        tabId: activeContext.tabId,
      });
      await chrome.sidePanel.open({ tabId: activeContext.tabId });
      window.close();
    } catch {
      setIsOpening(false);
      setError('LinguaRead could not open the Dictionary. Try again.');
    }
  };

  return (
    <main className="popup-shell">
      <header>
        <h1 className="brand-heading">
          <img
            className="brand-logo"
            src="/branding/linguaread-logo.png"
            alt="LinguaRead"
          />
        </h1>
      </header>

      {activeContext?.kind === 'pdf' && (
        <section aria-label="Open the current PDF">
          <p className="file-name">{activeContext.title}</p>
          <button
            type="button"
            onClick={() => void openReader()}
            disabled={isOpening}
          >
            {isOpening ? 'Opening…' : 'Open with LinguaRead'}
          </button>
        </section>
      )}

      {activeContext?.kind === 'page' && (
        <section aria-label="Open LinguaRead">
          <button
            type="button"
            onClick={() => void openStandaloneReader()}
            disabled={isOpening}
          >
            {isOpening ? 'Opening…' : 'Open LinguaRead'}
          </button>
        </section>
      )}

      {activeContext?.kind === 'reader' && (
        <section aria-labelledby="reader-title">
          <h2 id="reader-title">You’re already using LinguaRead.</h2>
          <button
            type="button"
            onClick={() => void openDictionary()}
            disabled={isOpening}
          >
            {isOpening ? 'Opening…' : 'Open Dictionary'}
          </button>
        </section>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

    </main>
  );
}

export default App;
