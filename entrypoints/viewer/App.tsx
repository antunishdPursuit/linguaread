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
import { loadWordHelp } from '../../lib/wordHelp';
import {
  buildPdfWordSpatialIndex,
  findPdfWordTargetAtPoint,
  measureTextLayerWords,
  positionFloatingCard,
  type PdfWordSpatialIndex,
  type PdfWordTarget,
} from '../../lib/pdfWordGeometry';
import type { LanguageResult, VocabularyState } from '../../lib/types';
import {
  createWordOnlyVocabularyEntry,
  dictionaryHasWord,
  EMPTY_VOCABULARY_STATE,
  readVocabularyState,
  saveVocabularyEntry,
  subscribeToVocabularyState,
  toVocabularyEntry,
  writeVocabularyState,
} from '../../lib/vocabularyStorage';
import {
  isPdfHandoffSearch,
  isPdfUrl,
  pdfNameFromUrl,
} from '../../lib/pdfLaunch';
import { consumePdfTransfer } from '../../lib/pdfTransfer';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

type ActiveCard = {
  message?: string;
  result: LanguageResult | null;
  source?: 'cache' | 'gemini';
  status: 'error' | 'loading' | 'needs_key' | 'ready';
  sourceWord: string;
  target: PdfWordTarget;
  left: number;
  top: number;
};

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

function selectPdfWord(target: PdfWordTarget): void {
  const selection = window.getSelection();
  if (!selection || !target.selection) return;

  // Chrome's native double-click selection can expand after repeated clicks.
  // Recreate the measured word range so the blue selection stays exact.
  const range = document.createRange();
  range.setStart(target.selection.node, target.selection.start);
  range.setEnd(target.selection.node, target.selection.end);
  selection.removeAllRanges();
  selection.addRange(range);
}

function getPdfWordViewportRectangle(
  target: PdfWordTarget,
): DOMRect | null {
  const measuredSelection = target.selection;
  if (!measuredSelection?.node.isConnected) return null;

  // The selected word's viewport position changes when Chrome opens its side
  // panel or the PDF reader scrolls, so read the saved text range again.
  const range = document.createRange();
  range.setStart(measuredSelection.node, measuredSelection.start);
  range.setEnd(measuredSelection.node, measuredSelection.end);
  const rectangle = range.getBoundingClientRect();
  range.detach();

  return rectangle.width > 0 && rectangle.height > 0 ? rectangle : null;
}

function positionWordCard(rectangle: DOMRect): {
  left: number;
  top: number;
} {
  return positionFloatingCard(
    rectangle,
    {
      height: 260,
      width: Math.min(340, Math.max(0, window.innerWidth - 32)),
    },
    { height: window.innerHeight, width: window.innerWidth },
  );
}

function FilePickerButton({
  className = 'file-button',
  label,
  onFile,
}: {
  className?: string;
  label: string;
  onFile: (file?: File) => void;
}) {
  return (
    <label className={className}>
      {label}
      <input
        id="pdf-file-input"
        type="file"
        accept="application/pdf,.pdf"
        onChange={(event) => {
          onFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </label>
  );
}

const PdfReaderPage = memo(function PdfReaderPage({
  pageNumber,
  setPageWordTargets,
  viewerWidth,
}: {
  pageNumber: number;
  setPageWordTargets: (
    pageNumber: number,
    targets: PdfWordTarget[],
  ) => void;
  viewerWidth: number;
}) {
  const frameRef = useRef<number | null>(null);
  const pageShellRef = useRef<HTMLElement | null>(null);

  useEffect(
    () => () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    },
    [],
  );

  const handleTextLayerSuccess = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);

    // PDF.js must finish its text transforms before LinguaRead measures the
    // native words used for double-click targeting.
    frameRef.current = requestAnimationFrame(() => {
      const pageElement = pageShellRef.current;
      if (!pageElement) return;
      setPageWordTargets(
        pageNumber,
        measureTextLayerWords(pageElement, pageNumber),
      );
    });
  }, [pageNumber, setPageWordTargets]);

  return (
    <section
      className="pdf-page-shell"
      data-page-number={pageNumber}
      ref={pageShellRef}
      aria-label={`PDF page ${pageNumber}`}
    >
      <Page
        pageNumber={pageNumber}
        width={viewerWidth}
        onRenderTextLayerSuccess={handleTextLayerSuccess}
      />
      <span className="page-number" aria-hidden="true">
        {pageNumber}
      </span>
    </section>
  );
});

const PdfReaderDocument = memo(function PdfReaderDocument({
  file,
  pageCount,
  renderedPageCount,
  viewerWidth,
  setPageCount,
  setRenderedPageCount,
  setPageWordTargets,
  setPdfError,
}: {
  file: File | string;
  pageCount: number;
  renderedPageCount: number;
  viewerWidth: number;
  setPageCount: Dispatch<SetStateAction<number>>;
  setRenderedPageCount: Dispatch<SetStateAction<number>>;
  setPageWordTargets: (
    pageNumber: number,
    targets: PdfWordTarget[],
  ) => void;
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
            <PdfReaderPage
              key={pageNumber}
              pageNumber={pageNumber}
              setPageWordTargets={setPageWordTargets}
              viewerWidth={viewerWidth}
            />
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
  const activeCardRef = useRef<ActiveCard | null>(null);
  const wordHelpRequestRef = useRef(0);
  const wordTargetIndexesRef = useRef<Record<number, PdfWordSpatialIndex>>({});
  const isPdfHandoff = isPdfHandoffSearch(window.location.search);
  const [file, setFile] = useState<File | string | null>(null);
  const [fileName, setFileName] = useState('Choose a PDF to begin');
  const [localFileNeedsSelection, setLocalFileNeedsSelection] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [renderedPageCount, setRenderedPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [requestedPage, setRequestedPage] = useState<number | null>(null);
  const [baseViewerWidth, setBaseViewerWidth] = useState(760);
  const [zoom, setZoom] = useState(1);
  const [activeCard, setActiveCard] = useState<ActiveCard | null>(null);
  const [vocabulary, setVocabulary] = useState<VocabularyState>(
    EMPTY_VOCABULARY_STATE,
  );
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [pdfError, setPdfError] = useState('');

  useEffect(() => {
    const element = viewerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setBaseViewerWidth(
        Math.max(280, Math.min(760, entry.contentRect.width - 48)),
      );
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [file]);

  const viewerWidth = Math.round(baseViewerWidth * zoom);

  useEffect(() => {
    void readVocabularyState()
      .then(setVocabulary)
      .catch(() => setError('LinguaRead could not load your Dictionary.'));
    return subscribeToVocabularyState(setVocabulary);
  }, []);

  const handleFile = useCallback((nextFile?: File) => {
    wordHelpRequestRef.current += 1;
    activeCardRef.current = null;
    setActiveCard(null);
    window.getSelection()?.removeAllRanges();
    setError('');
    setPdfError('');
    setLocalFileNeedsSelection(false);
    setPageCount(0);
    setRenderedPageCount(0);
    setCurrentPage(1);
    setRequestedPage(null);
    setZoom(1);
    wordTargetIndexesRef.current = {};

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

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const source = parameters.get('source');
    if (!source || !isPdfUrl(source)) return;

    const sourceName = pdfNameFromUrl(source);
    setFileName(sourceName);
    if (!source.startsWith('file:')) {
      setFile(source);
      return;
    }

    const transferId = parameters.get('transfer');
    if (!transferId) {
      setLocalFileNeedsSelection(true);
      return;
    }

    // The popup stores the local PDF while Chrome's temporary access is active.
    // Consume it once so later reader tabs cannot reuse a stale local file.
    void consumePdfTransfer(transferId)
      .then((transfer) => {
        if (!transfer) {
          setLocalFileNeedsSelection(true);
          return;
        }
        handleFile(
          new File([transfer.blob], transfer.fileName, {
            type: 'application/pdf',
          }),
        );
      })
      .catch(() => {
        setLocalFileNeedsSelection(true);
      });
  }, [handleFile]);

  const setPageWordTargets = useCallback(
    (pageNumber: number, targets: PdfWordTarget[]) => {
      wordTargetIndexesRef.current = {
        ...wordTargetIndexesRef.current,
        [pageNumber]: buildPdfWordSpatialIndex(targets),
      };
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
      setError('Chrome could not open your Dictionary. Try the button again.');
    }
  }, []);

  const closeActiveCard = useCallback(() => {
    wordHelpRequestRef.current += 1;
    activeCardRef.current = null;
    setActiveCard(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  const showCard = useCallback((target: PdfWordTarget, rect: DOMRect) => {
    const requestId = wordHelpRequestRef.current + 1;
    wordHelpRequestRef.current = requestId;
    const { left, top } = positionWordCard(rect);

    const nextCard: ActiveCard = {
      result: null,
      status: 'loading',
      sourceWord: target.word,
      target,
      left,
      top,
    };
    activeCardRef.current = nextCard;
    setActiveCard(nextCard);

    void loadWordHelp(target.word, target.context).then((outcome) => {
      if (wordHelpRequestRef.current !== requestId) return;
      const currentCard = activeCardRef.current;
      if (!currentCard || currentCard.target.id !== target.id) return;

      const resolvedCard: ActiveCard =
        outcome.status === 'ready'
          ? {
              ...currentCard,
              result: outcome.result,
              source: outcome.source,
              status: 'ready',
            }
          : {
              ...currentCard,
              message:
                outcome.status === 'error' ? outcome.message : undefined,
              result: null,
              status: outcome.status,
            };

      activeCardRef.current = resolvedCard;
      setActiveCard(resolvedCard);
    });
  }, []);

  const openGeminiSettings = useCallback(() => {
    void browser.runtime.openOptionsPage().catch(() => {
      setError('Chrome could not open Gemini settings. Try again.');
    });
  }, []);

  const retryActiveWord = useCallback(() => {
    const currentCard = activeCardRef.current;
    if (!currentCard) return;
    const rectangle = getPdfWordViewportRectangle(currentCard.target);
    if (!rectangle) return;
    showCard(currentCard.target, rectangle);
  }, [showCard]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    let frame: number | null = null;

    const repositionCard = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        const currentCard = activeCardRef.current;
        if (!currentCard) return;

        const rectangle = getPdfWordViewportRectangle(currentCard.target);
        if (!rectangle) return;
        const nextPosition = positionWordCard(rectangle);
        if (
          nextPosition.left === currentCard.left &&
          nextPosition.top === currentCard.top
        ) {
          return;
        }

        const nextCard = { ...currentCard, ...nextPosition };
        activeCardRef.current = nextCard;
        setActiveCard(nextCard);
      });
    };

    viewer.addEventListener('scroll', repositionCard, { passive: true });
    window.addEventListener('resize', repositionCard);
    window.visualViewport?.addEventListener('resize', repositionCard);

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      viewer.removeEventListener('scroll', repositionCard);
      window.removeEventListener('resize', repositionCard);
      window.visualViewport?.removeEventListener('resize', repositionCard);
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const findWordAtPoint = (event: MouseEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('.annotationLayer')
      ) {
        return null;
      }
      const pageElement =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-page-number]')
          : null;
      if (!pageElement) return null;

      const pageNumber = Number(pageElement.dataset.pageNumber);
      const pageRectangle = pageElement.getBoundingClientRect();
      const x = event.clientX - pageRectangle.left;
      const y = event.clientY - pageRectangle.top;
      const index = wordTargetIndexesRef.current[pageNumber];
      const target = index
        ? findPdfWordTargetAtPoint(index, x, y)
        : null;
      if (!target) return null;

      const rectangle =
        target.rectangles.find(
          (candidate) =>
            x >= candidate.left &&
            x <= candidate.left + candidate.width &&
            y >= candidate.top &&
            y <= candidate.top + candidate.height,
        ) ?? target.rectangles[0];

      return {
        rectangle: new DOMRect(
          pageRectangle.left + rectangle.left,
          pageRectangle.top + rectangle.top,
          rectangle.width,
          rectangle.height,
        ),
        target,
      };
    };

    const handleDoubleClick = (event: MouseEvent) => {
      const word = findWordAtPoint(event);
      if (!word) return;
      event.preventDefault();
      selectPdfWord(word.target);
      showCard(word.target, word.rectangle);
    };
    const handleMouseDown = (event: MouseEvent) => {
      const word = findWordAtPoint(event);

      // Chrome starts word and paragraph selection before `dblclick` fires.
      // Cancel only repeated presses on a measured word. The `dblclick`
      // handler restores one exact native range, while ordinary drag
      // selection remains available.
      if (event.detail >= 2 && word) {
        event.preventDefault();
        return;
      }

      if (event.detail === 1 && activeCardRef.current) {
        closeActiveCard();
      }
    };

    viewer.addEventListener('mousedown', handleMouseDown);
    viewer.addEventListener('dblclick', handleDoubleClick);

    return () => {
      viewer.removeEventListener('mousedown', handleMouseDown);
      viewer.removeEventListener('dblclick', handleDoubleClick);
    };
  }, [closeActiveCard, showCard]);

  const saveActiveWord = () => {
    if (!activeCard) return;
    const entry = activeCard.result
      ? toVocabularyEntry(activeCard.result)
      : createWordOnlyVocabularyEntry(activeCard.sourceWord);
    const nextState = saveVocabularyEntry(vocabulary, entry);
    setVocabulary(nextState);
    setStatusMessage(`${entry.sourceWord} saved to your Dictionary.`);
    void openSidePanel();

    void writeVocabularyState(nextState).catch(() => {
      setVocabulary(vocabulary);
      setStatusMessage('');
      setError('LinguaRead could not save that word. Try again.');
    });
  };

  const activeWordIsSaved = Boolean(
    activeCard && dictionaryHasWord(vocabulary, activeCard.sourceWord),
  );

  return (
    <main className={`app-shell ${file ? 'has-document' : 'is-empty'}`}>
      <header className="browser-bar">
        <div className="document-summary">
          <div className="document-path" title={fileName}>
            <span>LinguaRead</span>
            <span aria-hidden="true">›</span>
            <strong>{fileName}</strong>
            <span aria-hidden="true">›</span>
            <span>{vocabulary.entries.length} saved</span>
          </div>
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
                title={
                  level === 'B2'
                    ? 'B2 is active'
                    : 'Available in a later version'
                }
              >
                {level}
              </button>
            ))}
          </div>

          <button className="words-button" onClick={openSidePanel}>
            <span aria-hidden="true">▣</span>
            Dictionary
          </button>
          {file && (
            <FilePickerButton
              className="compact-file-button"
              label="Choose another PDF"
              onFile={handleFile}
            />
          )}
        </div>
      </header>

      {!isPdfHandoff && !file && (
        <section className="document-header" aria-label="PDF controls">
          <div>
            <h1>LinguaRead</h1>
            <p>Double-click a word to see more information.</p>
          </div>

          <FilePickerButton label="Choose PDF" onFile={handleFile} />
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
          <FilePickerButton
            className="permission-action"
            label="Choose this PDF"
            onFile={handleFile}
          />
        </div>
      )}

      <div
        className={`reader-workspace ${file ? 'has-document' : 'is-empty'}`}
      >
        {file && (
          <section className="reader-control-bar" aria-label="Reader controls">
            <div className="reader-control-intro">
              <strong>LinguaRead</strong>
              <span>Double-click a word to see more information.</span>
            </div>

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
              <span>{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                aria-label="Zoom in"
                onClick={() => changeZoom(1)}
              >
                +
              </button>
            </div>
          </section>
        )}

        <section className="reader-stage" ref={viewerRef}>
          {!file ? (
            <div className="empty-reader">
              <div className="empty-document" aria-hidden="true">
                <span>PDF</span>
              </div>
              <h2>Choose a text-based PDF</h2>
              <p>
                LinguaRead will display the PDF. Double-click a word to see more
                information.
              </p>
            </div>
          ) : (
            <PdfReaderDocument
              file={file}
              pageCount={pageCount}
              renderedPageCount={renderedPageCount}
              viewerWidth={viewerWidth}
              setPageCount={setPageCount}
              setRenderedPageCount={setRenderedPageCount}
              setPageWordTargets={setPageWordTargets}
              setPdfError={setPdfError}
            />
          )}
        </section>
      </div>

      {activeCard && (
        <aside
          className="word-card"
          style={{ left: activeCard.left, top: activeCard.top }}
          role="dialog"
          aria-label={`${activeCard.sourceWord} word help`}
        >
          <button
            className="card-close"
            aria-label="Close word card"
            onClick={closeActiveCard}
          >
            ×
          </button>
          <p className="card-label">
            {activeCard.status === 'ready' &&
            activeCard.source === 'cache'
              ? 'Word help · saved result'
              : 'Word help'}
          </p>
          <div className="word-pair">
            <strong>{activeCard.sourceWord}</strong>
            {activeCard.status === 'ready' && activeCard.result && (
              <span>{activeCard.result.mandarin}</span>
            )}
          </div>
          {activeCard.status === 'ready' && activeCard.result && (
            <p className="pinyin">{activeCard.result.pinyin}</p>
          )}
          {activeCard.status === 'ready' && activeCard.result ? (
            <dl className="word-details">
              <div>
                <dt>Level</dt>
                <dd>{activeCard.result.cefr}</dd>
              </div>
              <div>
                <dt>Simpler English</dt>
                <dd>{activeCard.result.simplerEnglish}</dd>
              </div>
              <div>
                <dt>Meaning</dt>
                <dd>{activeCard.result.definition}</dd>
              </div>
              <div>
                <dt>Example</dt>
                <dd>{activeCard.result.contextualExample}</dd>
              </div>
              <div>
                <dt>Usage</dt>
                <dd>{activeCard.result.usageNote}</dd>
              </div>
            </dl>
          ) : (
            <div className="word-unavailable">
              {activeCard.status === 'loading' && (
                <>
                  <strong>Getting contextual word help…</strong>
                  <p>
                    The original English stays visible while LinguaRead checks
                    this sentence.
                  </p>
                </>
              )}
              {activeCard.status === 'needs_key' && (
                <>
                  <strong>Connect a Gemini test key.</strong>
                  <p>
                    LinguaRead needs an active session key before it can create
                    this word card.
                  </p>
                </>
              )}
              {activeCard.status === 'error' && (
                <>
                  <strong>Word help is unavailable.</strong>
                  <p>{activeCard.message}</p>
                </>
              )}
            </div>
          )}
          <div className="card-actions">
            {activeCard.status === 'needs_key' && (
              <button
                className="card-secondary-button"
                onClick={openGeminiSettings}
              >
                Gemini settings
              </button>
            )}
            {activeCard.status === 'error' && (
              <button
                className="card-secondary-button"
                onClick={retryActiveWord}
              >
                Try again
              </button>
            )}
            <button
              className={`primary-button ${activeWordIsSaved ? 'selected' : ''}`}
              disabled={activeWordIsSaved}
              onClick={saveActiveWord}
            >
              {activeWordIsSaved
                ? 'Saved to Dictionary'
                : 'Save to Dictionary'}
            </button>
          </div>
        </aside>
      )}
    </main>
  );
}

export default App;
