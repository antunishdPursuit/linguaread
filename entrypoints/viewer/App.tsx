import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import {
  MOCK_LANGUAGE_RESULTS,
  renderMockText,
  toVocabularyEntry,
} from '../../lib/mockLanguage';
import type {
  LanguageResult,
  VocabularyList,
  VocabularyState,
} from '../../lib/types';
import {
  EMPTY_VOCABULARY_STATE,
  moveVocabularyEntry,
  readVocabularyState,
  subscribeToVocabularyState,
  vocabularyListFor,
  writeVocabularyState,
} from '../../lib/vocabularyStorage';
import { isPdfUrl, pdfNameFromUrl } from '../../lib/pdfLaunch';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

type CardMode = 'preview' | 'full';

type ActiveCard = {
  mode: CardMode;
  result: LanguageResult;
  left: number;
  top: number;
};

type FitMode = 'page' | 'width' | 'custom';

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

const PdfReaderDocument = memo(function PdfReaderDocument({
  file,
  pageCount,
  renderedPageCount,
  viewerWidth,
  vocabulary,
  setPageCount,
  setRenderedPageCount,
  setPageAspectRatio,
  setPageWordCount,
  setPdfError,
}: {
  file: File | string;
  pageCount: number;
  renderedPageCount: number;
  viewerWidth: number;
  vocabulary: VocabularyState;
  setPageCount: Dispatch<SetStateAction<number>>;
  setRenderedPageCount: Dispatch<SetStateAction<number>>;
  setPageAspectRatio: Dispatch<SetStateAction<number>>;
  setPageWordCount: (pageNumber: number, wordCount: number) => void;
  setPdfError: Dispatch<SetStateAction<string>>;
}) {
  return (
    <Document
      file={file}
      loading={<p className="reader-message">Loading the PDF…</p>}
      error={<p className="reader-message">This PDF could not be read.</p>}
      onLoadSuccess={({ numPages }) => {
        setPageCount(numPages);
        setRenderedPageCount(Math.min(3, numPages));
      }}
      onLoadError={() =>
        setPdfError(
          'LinguaRead could not read this PDF. Check local-file access or choose the PDF again.',
        )
      }
    >
      <div className="pdf-pages">
        {Array.from({ length: renderedPageCount }, (_, index) => {
          const pageNumber = index + 1;

          return (
            <section
              className="pdf-page-shell"
              data-page-number={pageNumber}
              key={pageNumber}
              aria-label={`PDF page ${pageNumber}`}
            >
              <Page
                pageNumber={pageNumber}
                width={viewerWidth}
                customTextRenderer={({ str }) =>
                  renderMockText(str, vocabulary)
                }
                onLoadSuccess={(page) => {
                  if (pageNumber === 1) {
                    setPageAspectRatio(page.originalHeight / page.originalWidth);
                  }
                }}
                onGetTextSuccess={({ items }) => {
                  const text = items
                    .filter(
                      (item): item is typeof item & { str: string } =>
                        'str' in item,
                    )
                    .map((item) => item.str)
                    .join(' ');
                  setPageWordCount(
                    pageNumber,
                    text.trim() ? text.trim().split(/\s+/).length : 0,
                  );
                }}
              />
              <span className="page-number" aria-hidden="true">
                {pageNumber}
              </span>
            </section>
          );
        })}
        {renderedPageCount < pageCount && (
          <div className="page-loader" data-load-more-pages role="status">
            Loading more pages…
          </div>
        )}
      </div>
    </Document>
  );
});

function App() {
  const viewerRef = useRef<HTMLDivElement>(null);
  const pageWordCountsRef = useRef<Record<number, number>>({});
  const [file, setFile] = useState<File | string | null>(null);
  const [fileName, setFileName] = useState('Choose a PDF to begin');
  const [localFileNeedsSelection, setLocalFileNeedsSelection] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [renderedPageCount, setRenderedPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [requestedPage, setRequestedPage] = useState<number | null>(null);
  const [extractedWords, setExtractedWords] = useState(0);
  const [baseViewerWidth, setBaseViewerWidth] = useState(760);
  const [stageHeight, setStageHeight] = useState(720);
  const [pageAspectRatio, setPageAspectRatio] = useState(1.294);
  const [zoom, setZoom] = useState(1);
  const [fitMode, setFitMode] = useState<FitMode>('width');
  const [activeCard, setActiveCard] = useState<ActiveCard | null>(null);
  const [vocabulary, setVocabulary] = useState<VocabularyState>(
    EMPTY_VOCABULARY_STATE,
  );
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [pdfError, setPdfError] = useState('');

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const source = parameters.get('source');
    if (!source || !isPdfUrl(source)) return;

    setFileName(pdfNameFromUrl(source));
    if (source.startsWith('file:')) {
      setLocalFileNeedsSelection(true);
      return;
    }
    setFile(source);
  }, []);

  useEffect(() => {
    const element = viewerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setBaseViewerWidth(
        Math.max(280, Math.min(760, entry.contentRect.width - 48)),
      );
      setStageHeight(entry.contentRect.height);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fitPageZoom = Math.min(
    1,
    Math.max(0.5, (stageHeight - 72) / (baseViewerWidth * pageAspectRatio)),
  );
  const effectiveZoom = fitMode === 'page' ? fitPageZoom : zoom;
  const viewerWidth = Math.round(baseViewerWidth * effectiveZoom);

  useEffect(() => {
    void readVocabularyState()
      .then(setVocabulary)
      .catch(() => setError('LinguaRead could not load your saved word lists.'));
    return subscribeToVocabularyState(setVocabulary);
  }, []);

  const handleFile = useCallback((nextFile?: File) => {
    setActiveCard(null);
    setError('');
    setPdfError('');
    setLocalFileNeedsSelection(false);
    setExtractedWords(0);
    setPageCount(0);
    setRenderedPageCount(0);
    setCurrentPage(1);
    setRequestedPage(null);
    setZoom(1);
    setFitMode('width');
    pageWordCountsRef.current = {};

    if (!nextFile) {
      setFile(null);
      setFileName('Choose a PDF to begin');
      return;
    }

    if (nextFile.type !== 'application/pdf') {
      setFile(null);
      setFileName('Choose a PDF to begin');
      setError('Choose a PDF file with selectable text.');
      return;
    }

    setFile(nextFile);
    setFileName(nextFile.name);
  }, []);

  const setPageWordCount = useCallback(
    (pageNumber: number, wordCount: number) => {
      pageWordCountsRef.current[pageNumber] = wordCount;
      setExtractedWords(
        Object.values(pageWordCountsRef.current).reduce(
          (total, count) => total + count,
          0,
        ),
      );
    },
    [],
  );

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !file || pageCount === 0) return;

    const pages = Array.from(
      viewer.querySelectorAll<HTMLElement>('[data-page-number]'),
    );
    if (!pages.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const pageNumber = Number(
          (visible[0]?.target as HTMLElement | undefined)?.dataset.pageNumber,
        );
        if (pageNumber) setCurrentPage(pageNumber);
      },
      {
        root: viewer,
        threshold: [0.2, 0.45, 0.7],
      },
    );

    pages.forEach((page) => observer.observe(page));
    return () => observer.disconnect();
  }, [file, pageCount, renderedPageCount, viewerWidth]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const loader = viewer?.querySelector<HTMLElement>(
      '[data-load-more-pages]',
    );
    if (!viewer || !loader) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setRenderedPageCount((current) =>
          Math.min(pageCount, current + 2),
        );
      },
      {
        root: viewer,
        rootMargin: '500px 0px',
      },
    );

    observer.observe(loader);
    return () => observer.disconnect();
  }, [pageCount, renderedPageCount]);

  useEffect(() => {
    if (requestedPage === null || requestedPage > renderedPageCount) return;

    const frame = requestAnimationFrame(() => {
      const page = viewerRef.current?.querySelector<HTMLElement>(
        `[data-page-number="${requestedPage}"]`,
      );
      page?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setCurrentPage(requestedPage);
      setRequestedPage(null);
    });

    return () => cancelAnimationFrame(frame);
  }, [renderedPageCount, requestedPage]);

  const scrollToPage = useCallback(
    (pageNumber: number) => {
      const nextPage = Math.max(1, Math.min(pageCount, pageNumber));
      setRenderedPageCount((current) =>
        Math.max(current, Math.min(pageCount, nextPage + 1)),
      );
      setRequestedPage(nextPage);
    },
    [pageCount],
  );

  const changeZoom = useCallback((direction: -1 | 1) => {
    setFitMode('custom');
    setZoom((current) =>
      Math.max(0.6, Math.min(1.8, Number((current + direction * 0.1).toFixed(1)))),
    );
  }, []);

  const openSidePanel = useCallback(async () => {
    try {
      const currentTab = await browser.tabs.getCurrent();
      if (currentTab?.id === undefined) throw new Error('Reader tab not found');
      await chrome.sidePanel.setOptions({
        enabled: true,
        path: '/sidepanel.html',
        tabId: currentTab.id,
      });
      await chrome.sidePanel.open({ tabId: currentTab.id });
    } catch {
      setError('Chrome could not open your word lists. Try the button again.');
    }
  }, []);

  const findWordTarget = useCallback(
    (target: EventTarget | null): HTMLElement | null => {
      return target instanceof HTMLElement
        ? target.closest<HTMLElement>('[data-linguaread-id]')
        : null;
    },
    [],
  );

  const showCard = useCallback((target: HTMLElement, mode: CardMode) => {
    const result = MOCK_LANGUAGE_RESULTS.find(
      (candidate) => candidate.id === target.dataset.linguareadId,
    );
    if (!result) return;

    const rect = target.getBoundingClientRect();
    const cardWidth = mode === 'full' ? 340 : 280;
    const preferredLeft = rect.right + 12;
    const left = Math.max(
      16,
      Math.min(
        preferredLeft + cardWidth <= window.innerWidth - 16
          ? preferredLeft
          : rect.left - cardWidth - 12,
        window.innerWidth - cardWidth - 16,
      ),
    );
    const top = Math.max(16, Math.min(rect.top - 12, window.innerHeight - 260));

    setActiveCard({ mode, result, left, top });
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const handleMouseOver = (event: MouseEvent) => {
      const target = findWordTarget(event.target);
      if (!target) return;
      showCard(target, 'preview');
    };
    const handleMouseOut = (event: MouseEvent) => {
      if (!findWordTarget(event.target)) return;
      setActiveCard((current) =>
        current?.mode === 'preview' ? null : current,
      );
    };
    const handleDoubleClick = (event: MouseEvent) => {
      const target = findWordTarget(event.target);
      if (target) showCard(target, 'full');
    };
    const handleFocusIn = (event: FocusEvent) => {
      const target = findWordTarget(event.target);
      if (target) showCard(target, 'preview');
    };
    const handleFocusOut = (event: FocusEvent) => {
      if (!findWordTarget(event.target)) return;
      setActiveCard((current) =>
        current?.mode === 'preview' ? null : current,
      );
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const target = findWordTarget(event.target);
      if (!target) return;
      event.preventDefault();
      showCard(target, 'full');
    };

    viewer.addEventListener('mouseover', handleMouseOver);
    viewer.addEventListener('mouseout', handleMouseOut);
    viewer.addEventListener('dblclick', handleDoubleClick);
    viewer.addEventListener('focusin', handleFocusIn);
    viewer.addEventListener('focusout', handleFocusOut);
    viewer.addEventListener('keydown', handleKeyDown);

    return () => {
      viewer.removeEventListener('mouseover', handleMouseOver);
      viewer.removeEventListener('mouseout', handleMouseOut);
      viewer.removeEventListener('dblclick', handleDoubleClick);
      viewer.removeEventListener('focusin', handleFocusIn);
      viewer.removeEventListener('focusout', handleFocusOut);
      viewer.removeEventListener('keydown', handleKeyDown);
    };
  }, [findWordTarget, showCard]);

  const mandarinCount = MOCK_LANGUAGE_RESULTS.filter(
    (result) => result.action === 'use_mandarin',
  ).length;
  const synonymCount = MOCK_LANGUAGE_RESULTS.filter(
    (result) => result.action === 'use_synonym',
  ).length;

  const moveActiveWord = async (destination: VocabularyList) => {
    if (!activeCard) return;
    const entry = toVocabularyEntry(activeCard.result);
    const nextState = moveVocabularyEntry(vocabulary, entry, destination);
    setVocabulary(nextState);
    setStatusMessage(
      `${entry.sourceWord} moved to ${
        destination === 'learning' ? 'Learning' : 'Known Words'
      }.`,
    );

    try {
      await writeVocabularyState(nextState);
    } catch {
      setVocabulary(vocabulary);
      setStatusMessage('');
      setError('LinguaRead could not save that word. Try again.');
    }
  };

  const activeList = activeCard
    ? vocabularyListFor(vocabulary, activeCard.result.id)
    : null;

  return (
    <main className="app-shell">
      <header className="browser-bar">
        <div className="window-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <div className="document-path" title={fileName}>
          <span>LinguaRead</span>
          <span aria-hidden="true">›</span>
          <strong>{fileName}</strong>
        </div>

        <div className="reader-tools">
          <div className="level-selector" aria-label="Reading level fixed at B2">
            <span className="level-label">Level</span>
            {CEFR_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                className={level === 'B2' ? 'active' : ''}
                disabled
                aria-current={level === 'B2' ? 'true' : undefined}
                title={level === 'B2' ? 'B2 is active' : 'Available in a later version'}
              >
                {level}
              </button>
            ))}
          </div>

          <button className="words-button" onClick={openSidePanel}>
            <span aria-hidden="true">▣</span>
            Word lists
          </button>
        </div>
      </header>

      <section className="document-header" aria-label="PDF controls">
        <div>
          <p className="eyebrow">PDF-first reading aid</p>
          <h1>LinguaRead</h1>
          <p>
            Read the original layout with focused help for selected B2+ words.
          </p>
        </div>

        <label className="file-button">
          {file ? 'Choose another PDF' : 'Choose PDF'}
          <input
            id="pdf-file-input"
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
        </label>
      </section>

      <section className="reader-status" aria-live="polite">
        <div className="status-copy">
          <strong>{fileName}</strong>
          {pageCount > 0 && <span>{pageCount} pages</span>}
          {extractedWords > 0 && <span>{extractedWords} words detected</span>}
        </div>

        <div className="legend" aria-label="Word display legend">
          <span className="legend-item mandarin">
            <i /> {mandarinCount} Mandarin hints
          </span>
          <span className="legend-item synonym">
            <i /> {synonymCount} simpler English hints
          </span>
          <span className="legend-item known">
            <i /> {vocabulary.known.length} known
          </span>
          <span className="legend-item learning">
            <i /> {vocabulary.learning.length} learning
          </span>
        </div>
      </section>

      {file && (
        <section className="reader-control-bar" aria-label="Reader controls">
          <div className="page-controls">
            <button
              type="button"
              aria-label="Previous page"
              disabled={currentPage <= 1}
              onClick={() => scrollToPage(currentPage - 1)}
            >
              ←
            </button>
            <span>
              Page <strong>{currentPage}</strong> of {pageCount || '—'}
            </span>
            <button
              type="button"
              aria-label="Next page"
              disabled={currentPage >= pageCount}
              onClick={() => scrollToPage(currentPage + 1)}
            >
              →
            </button>
          </div>

          <div className="zoom-controls">
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => changeZoom(-1)}
            >
              −
            </button>
            <span>{Math.round(effectiveZoom * 100)}%</span>
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => changeZoom(1)}
            >
              +
            </button>
            <button
              type="button"
              className={fitMode === 'width' ? 'active' : ''}
              onClick={() => {
                setZoom(1);
                setFitMode('width');
              }}
            >
              Fit width
            </button>
            <button
              type="button"
              className={fitMode === 'page' ? 'active' : ''}
              onClick={() => setFitMode('page')}
            >
              Fit page
            </button>
          </div>
        </section>
      )}

      <p className="sr-only" aria-live="polite">
        {statusMessage}
      </p>

      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}

      {pdfError && (
        <p className="error-message" role="alert">
          {pdfError}
        </p>
      )}

      {localFileNeedsSelection && (
        <div className="error-message permission-message" role="alert">
          <div>
            <strong>Choose this local PDF to continue.</strong>
            <span>
              Chrome opened LinguaRead but did not transfer the local file.
              Select {fileName} once to continue. The original stays unchanged.
            </span>
          </div>
          <button
            type="button"
            className="permission-action"
            onClick={() => document.getElementById('pdf-file-input')?.click()}
          >
            Choose this PDF
          </button>
        </div>
      )}

      <section
        className="reader-stage"
        ref={viewerRef}
        onScroll={() =>
          setActiveCard((current) =>
            current?.mode === 'preview' ? null : current,
          )
        }
      >
        {!file ? (
          <div className="empty-reader">
            <div className="empty-document" aria-hidden="true">
              <span>PDF</span>
            </div>
            <h2>Choose a text-based PDF</h2>
            <p>
              LinguaRead will display the PDF and mark only the words prepared
              for help.
            </p>
          </div>
        ) : (
          <PdfReaderDocument
            file={file}
            pageCount={pageCount}
            renderedPageCount={renderedPageCount}
            viewerWidth={viewerWidth}
            vocabulary={vocabulary}
            setPageCount={setPageCount}
            setRenderedPageCount={setRenderedPageCount}
            setPageAspectRatio={setPageAspectRatio}
            setPageWordCount={setPageWordCount}
            setPdfError={setPdfError}
          />
        )}
      </section>

      {activeCard && (
        <aside
          className={`word-card ${activeCard.mode}`}
          style={{ left: activeCard.left, top: activeCard.top }}
          role={activeCard.mode === 'full' ? 'dialog' : 'status'}
          aria-label={`${activeCard.result.sourceWord} word help`}
        >
          {activeCard.mode === 'full' && (
            <button
              className="card-close"
              aria-label="Close word card"
              onClick={() => setActiveCard(null)}
            >
              ×
            </button>
          )}
          <p className="card-label">
            {activeCard.mode === 'full' ? 'Full word card' : 'Quick view'}
          </p>
          <div className="word-pair">
            <strong>{activeCard.result.sourceWord}</strong>
            <span>{activeCard.result.displayWord}</span>
          </div>
          <p className="pinyin">
            {activeCard.result.action === 'use_synonym'
              ? `Simpler English · ${activeCard.result.mandarin} · ${activeCard.result.pinyin}`
              : activeCard.result.pinyin}
          </p>
          {activeCard.mode === 'full' && (
            <>
              <p className="word-meaning">{activeCard.result.shortMeaning}</p>
              <div className="card-actions">
                <button
                  className={`primary-button ${activeList === 'learning' ? 'selected' : ''}`}
                  disabled={activeList === 'learning'}
                  onClick={() => void moveActiveWord('learning')}
                >
                  {activeList === 'learning' ? 'In Learning' : 'Add to Learning'}
                </button>
                <button
                  className={`text-button ${activeList === 'known' ? 'selected' : ''}`}
                  disabled={activeList === 'known'}
                  onClick={() => void moveActiveWord('known')}
                >
                  {activeList === 'known' ? 'In Known Words' : 'Mark as Known'}
                </button>
              </div>
            </>
          )}
          {activeCard.mode === 'preview' && (
            <p className="preview-hint">Double-click or press Enter for details</p>
          )}
        </aside>
      )}
    </main>
  );
}

export default App;
