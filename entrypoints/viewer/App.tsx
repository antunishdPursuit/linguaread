import { useCallback, useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { MOCK_LANGUAGE_RESULT, renderMockText } from '../../lib/mockLanguage';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

type ActiveCard = 'preview' | 'full' | null;

function App() {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('No PDF selected');
  const [pageCount, setPageCount] = useState(0);
  const [extractedWords, setExtractedWords] = useState(0);
  const [viewerWidth, setViewerWidth] = useState(760);
  const [activeCard, setActiveCard] = useState<ActiveCard>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const element = viewerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setViewerWidth(Math.max(320, Math.min(760, entry.contentRect.width - 32)));
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const handleFile = useCallback((nextFile?: File) => {
    setActiveCard(null);
    setError('');
    setExtractedWords(0);
    setPageCount(0);

    if (!nextFile) {
      setFile(null);
      setFileName('No PDF selected');
      return;
    }

    if (nextFile.type !== 'application/pdf') {
      setFile(null);
      setFileName('No PDF selected');
      setError('Choose a PDF file with selectable text.');
      return;
    }

    setFile(nextFile);
    setFileName(nextFile.name);
  }, []);

  const openSidePanel = useCallback(async () => {
    try {
      const currentWindow = await chrome.windows.getCurrent();
      if (currentWindow.id === undefined) throw new Error('Window not found');
      await chrome.sidePanel.open({ windowId: currentWindow.id });
    } catch {
      setError('Chrome could not open the vocabulary panel. Try the button again.');
    }
  }, []);

  const findWordTarget = (target: EventTarget | null): HTMLElement | null => {
    return target instanceof HTMLElement
      ? target.closest<HTMLElement>('[data-linguaread-word]')
      : null;
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">PDF-first reading aid</p>
          <h1>LinguaRead</h1>
        </div>
        <button className="secondary-button" onClick={openSidePanel}>
          Open Learning &amp; Known Words
        </button>
      </header>

      <section className="control-card" aria-label="Choose a PDF">
        <div>
          <h2>Local PDF test</h2>
          <p>
            The PDF stays in this browser. This build uses one mock Mandarin
            replacement and does not call an outside service.
          </p>
        </div>
        <label className="file-button">
          Choose PDF
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
        </label>
      </section>

      <section className="status-row" aria-live="polite">
        <span>{fileName}</span>
        <span>{pageCount ? `${pageCount} pages` : 'Waiting for a PDF'}</span>
        <span>
          {extractedWords ? `${extractedWords} words found on page 1` : 'Text not checked'}
        </span>
      </section>

      {error && <p className="error-message">{error}</p>}

      <section className="reader-layout">
        <aside className="help-card">
          <p className="eyebrow">Mock interaction</p>
          <h2>What to try</h2>
          <ol>
            <li>Choose the Ferrari PDF from your Downloads folder.</li>
            <li>Find the highlighted Chinese word on page one.</li>
            <li>Hover for a quick view.</li>
            <li>Double-click for the full word card.</li>
          </ol>
          <p className="mock-note">Mock only: innovation → 创新</p>
        </aside>

        <div
          className="viewer-card"
          ref={viewerRef}
          onMouseOver={(event) => {
            if (findWordTarget(event.target) && activeCard !== 'full') {
              setActiveCard('preview');
            }
          }}
          onMouseOut={(event) => {
            if (findWordTarget(event.target) && activeCard === 'preview') {
              setActiveCard(null);
            }
          }}
          onDoubleClick={(event) => {
            if (findWordTarget(event.target)) setActiveCard('full');
          }}
        >
          {!file ? (
            <div className="empty-reader">
              <div className="empty-icon">PDF</div>
              <h2>Choose a text-based PDF</h2>
              <p>LinguaRead will render only the first page in this proof.</p>
            </div>
          ) : (
            <Document
              file={file}
              loading={<p className="reader-message">Loading the PDF…</p>}
              error={<p className="reader-message">This PDF could not be read.</p>}
              onLoadSuccess={({ numPages }) => setPageCount(numPages)}
              onLoadError={(reason) => setError(reason.message)}
            >
              <Page
                pageNumber={1}
                width={viewerWidth}
                customTextRenderer={({ str }) => renderMockText(str)}
                onGetTextSuccess={({ items }) => {
                  const text = items
                    .filter((item): item is typeof item & { str: string } => 'str' in item)
                    .map((item) => item.str)
                    .join(' ');
                  setExtractedWords(text.trim() ? text.trim().split(/\s+/).length : 0);
                }}
              />
            </Document>
          )}

          {activeCard && (
            <div className={activeCard === 'full' ? 'word-card full' : 'word-card'}>
              <button
                className="card-close"
                aria-label="Close word card"
                onClick={() => setActiveCard(null)}
              >
                ×
              </button>
              <p className="card-label">
                {activeCard === 'full' ? 'Full word card' : 'Quick view'}
              </p>
              <div className="word-pair">
                <strong>{MOCK_LANGUAGE_RESULT.sourceWord}</strong>
                <span>{MOCK_LANGUAGE_RESULT.mandarin}</span>
              </div>
              <p>{MOCK_LANGUAGE_RESULT.pinyin}</p>
              {activeCard === 'full' && (
                <>
                  <p>{MOCK_LANGUAGE_RESULT.shortMeaning}</p>
                  <button className="primary-button">Add to Learning</button>
                </>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default App;
