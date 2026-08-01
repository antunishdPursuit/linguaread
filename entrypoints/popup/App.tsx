import { useEffect, useRef, useState } from 'react';
import {
  AUTO_PROMPT_STORAGE_KEY,
  OPEN_READER_MESSAGE,
  isPdfUrl,
  pdfNameFromUrl,
  type AutoPromptContext,
  type OpenReaderResponse,
} from '../../lib/pdfLaunch';
import { storePdfTransfer } from '../../lib/pdfTransfer';

type ActivePdf = {
  tabId: number;
  title: string;
  url: string;
};

function App() {
  const autoCloseTimer = useRef<number | null>(null);
  const [activePdf, setActivePdf] = useState<ActivePdf | null>(null);
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
        if (!tab?.id || !isPdfUrl(tab.url)) {
          return;
        }

        const nextPdf = {
          tabId: tab.id,
          title: tab.title || pdfNameFromUrl(tab.url),
          url: tab.url,
        };
        setActivePdf(nextPdf);

        const autoPrompt = stored[
          AUTO_PROMPT_STORAGE_KEY
        ] as AutoPromptContext | null | undefined;
        const openedAutomatically =
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
    if (!activePdf || isOpening) return;

    stopAutoClose();
    setError('');
    setIsOpening(true);
    try {
      let transferId: string | undefined;
      if (activePdf.url.startsWith('file:')) {
        try {
          // A direct toolbar click grants activeTab; an automatic prompt does not.
          // Always continue to the reader so its file-picker recovery remains usable.
          const response = await fetch(activePdf.url);
          if (!response.ok) {
            throw new Error(
              `Temporary PDF access failed with status ${response.status}.`,
            );
          }
          transferId = await storePdfTransfer(
            await response.blob(),
            pdfNameFromUrl(activePdf.url),
          );
        } catch {
          transferId = undefined;
        }
      }

      const response = (await browser.runtime.sendMessage({
        type: OPEN_READER_MESSAGE,
        sourceUrl: activePdf.url,
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

  return (
    <main className="popup-shell">
      <header>
        <span className="pdf-icon" aria-hidden="true">
          PDF
        </span>
        <h1>LinguaRead</h1>
      </header>

      {activePdf ? (
        <section aria-labelledby="open-title">
          <h2 id="open-title">
            Open this PDF with LinguaRead?
          </h2>
          <p className="file-name">{activePdf.title}</p>

          <p className="note">
            The original PDF stays unchanged.
          </p>
          <button
            type="button"
            onClick={() => void openReader()}
            disabled={isOpening}
          >
            {isOpening ? 'Opening…' : 'Open with LinguaRead'}
          </button>
        </section>
      ) : (
        <section className="empty-state">
          <h2>Open a PDF first</h2>
          <p>Then click LinguaRead to open that PDF in the reading view.</p>
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
