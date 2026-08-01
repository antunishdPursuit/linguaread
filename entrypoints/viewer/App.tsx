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
  languageFixtureForWord,
  toVocabularyEntry,
} from '../../lib/mockLanguage';
import {
  buildPdfWordSpatialIndex,
  findPdfWordTargetAtPoint,
  measureTextLayerWords,
  type PdfWordSpatialIndex,
  type PdfWordTarget,
} from '../../lib/pdfWordGeometry';
import type { LanguageResult, VocabularyState } from '../../lib/types';
import {
  createPendingVocabularyEntry,
  dictionaryHasWord,
  EMPTY_VOCABULARY_STATE,
  readVocabularyState,
  saveVocabularyEntry,
  subscribeToVocabularyState,
  writeVocabularyState,
} from '../../lib/vocabularyStorage';
import {
  isPdfHandoffSearch,
  isPdfUrl,
  pdfNameFromUrl,
} from '../../lib/pdfLaunch';
import { consumePdfTransfer } from '../../lib/pdfTransfer';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

type CardMode = 'preview' | 'full';

type ActiveCard = {
  isCandidate: boolean;
  mode: CardMode;
  occurrenceId: string;
  result: LanguageResult | null;
  sourceWord: string;
  left: number;
  top: number;
};

type FitMode = 'page' | 'width' | 'custom';

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

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

function WordMarkerLayer({
  targets,
  unmarkedOccurrences,
  vocabulary,
}: {
  targets: PdfWordTarget[];
  unmarkedOccurrences: ReadonlySet<string>;
  vocabulary: VocabularyState;
}) {
  return (
    <div className="word-marker-layer">
      {targets.flatMap((target) => {
        const result = languageFixtureForWord(target.word);
        const isCandidate =
          Boolean(result) && !unmarkedOccurrences.has(target.id);
        const isSaved = dictionaryHasWord(vocabulary, target.word);
        if (!isCandidate && !isSaved) return [];

        return target.rectangles.map((rectangle, rectangleIndex) => {
          const markerClassName = [
            'word-marker',
            isCandidate ? 'is-candidate' : '',
            isCandidate && result?.action === 'use_mandarin'
              ? 'is-mandarin'
              : '',
            isCandidate && result?.action === 'use_synonym'
              ? 'is-synonym'
              : '',
            isSaved ? 'is-saved' : '',
          ]
            .filter(Boolean)
            .join(' ');
          const style = {
            height: rectangle.height,
            left: rectangle.left,
            top: rectangle.top,
            width: rectangle.width,
          };

          if (rectangleIndex === 0 && isCandidate) {
            return (
              <button
                aria-label={`${target.word} word help`}
                className={markerClassName}
                data-linguaread-candidate="true"
                data-linguaread-occurrence={target.id}
                data-linguaread-word={target.word}
                key={`${target.id}-${rectangleIndex}`}
                style={style}
                type="button"
              />
            );
          }

          return (
            <span
              aria-hidden="true"
              className={markerClassName}
              key={`${target.id}-${rectangleIndex}`}
              style={style}
            />
          );
        });
      })}
    </div>
  );
}

const PdfReaderPage = memo(function PdfReaderPage({
  pageNumber,
  setPageAspectRatio,
  setPageWordCount,
  setPageWordTargets,
  targets,
  unmarkedOccurrences,
  viewerWidth,
  vocabulary,
}: {
  pageNumber: number;
  setPageAspectRatio: Dispatch<SetStateAction<number>>;
  setPageWordCount: (pageNumber: number, wordCount: number) => void;
  setPageWordTargets: (
    pageNumber: number,
    targets: PdfWordTarget[],
  ) => void;
  targets: PdfWordTarget[];
  unmarkedOccurrences: ReadonlySet<string>;
  viewerWidth: number;
  vocabulary: VocabularyState;
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

    // PDF.js finishes its own text transforms before LinguaRead measures
    // ranges. The markers stay separate and cannot alter the source layout.
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
        onLoadSuccess={(page) => {
          if (pageNumber === 1) {
            setPageAspectRatio(page.originalHeight / page.originalWidth);
          }
        }}
        onGetTextSuccess={({ items }) => {
          const text = items
            .filter(
              (item): item is typeof item & { str: string } => 'str' in item,
            )
            .map((item) => item.str)
            .join(' ');
          setPageWordCount(
            pageNumber,
            text.trim() ? text.trim().split(/\s+/).length : 0,
          );
        }}
        onRenderTextLayerSuccess={handleTextLayerSuccess}
      />
      <WordMarkerLayer
        targets={targets}
        vocabulary={vocabulary}
        unmarkedOccurrences={unmarkedOccurrences}
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
  vocabulary,
  unmarkedOccurrences,
  wordTargets,
  setPageCount,
  setRenderedPageCount,
  setPageAspectRatio,
  setPageWordCount,
  setPageWordTargets,
  setPdfError,
}: {
  file: File | string;
  pageCount: number;
  renderedPageCount: number;
  viewerWidth: number;
  vocabulary: VocabularyState;
  unmarkedOccurrences: ReadonlySet<string>;
  wordTargets: Record<number, PdfWordTarget[]>;
  setPageCount: Dispatch<SetStateAction<number>>;
  setRenderedPageCount: Dispatch<SetStateAction<number>>;
  setPageAspectRatio: Dispatch<SetStateAction<number>>;
  setPageWordCount: (pageNumber: number, wordCount: number) => void;
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
              setPageAspectRatio={setPageAspectRatio}
              setPageWordCount={setPageWordCount}
              setPageWordTargets={setPageWordTargets}
              targets={wordTargets[pageNumber] ?? []}
              unmarkedOccurrences={unmarkedOccurrences}
              viewerWidth={viewerWidth}
              vocabulary={vocabulary}
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
  const pageWordCountsRef = useRef<Record<number, number>>({});
  const previewOccurrenceRef = useRef<string | null>(null);
  const wordTargetIndexesRef = useRef<Record<number, PdfWordSpatialIndex>>({});
  const wordTargetsRef = useRef<Record<number, PdfWordTarget[]>>({});
  const isPdfHandoff = isPdfHandoffSearch(window.location.search);
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
  const [wordTargets, setWordTargets] = useState<
    Record<number, PdfWordTarget[]>
  >({});
  const [vocabulary, setVocabulary] = useState<VocabularyState>(
    EMPTY_VOCABULARY_STATE,
  );
  const [unmarkedOccurrences, setUnmarkedOccurrences] = useState<Set<string>>(
    new Set(),
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
      .catch(() => setError('LinguaRead could not load your Dictionary.'));
    return subscribeToVocabularyState(setVocabulary);
  }, []);

  const handleFile = useCallback((nextFile?: File) => {
    activeCardRef.current = null;
    previewOccurrenceRef.current = null;
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
    setUnmarkedOccurrences(new Set());
    setWordTargets({});
    wordTargetsRef.current = {};
    wordTargetIndexesRef.current = {};
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

  const setPageWordTargets = useCallback(
    (pageNumber: number, targets: PdfWordTarget[]) => {
      const nextTargets = {
        ...wordTargetsRef.current,
        [pageNumber]: targets,
      };
      wordTargetsRef.current = nextTargets;
      wordTargetIndexesRef.current = {
        ...wordTargetIndexesRef.current,
        [pageNumber]: buildPdfWordSpatialIndex(targets),
      };
      setWordTargets(nextTargets);
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
      setError('Chrome could not open your Dictionary. Try the button again.');
    }
  }, []);

  const showCard = useCallback((
    target: PdfWordTarget,
    rect: DOMRect,
    mode: CardMode,
  ) => {
    const result = languageFixtureForWord(target.word);
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

    const nextCard: ActiveCard = {
      isCandidate:
        Boolean(result) && !unmarkedOccurrences.has(target.id),
      mode,
      occurrenceId: target.id,
      result,
      sourceWord: target.word,
      left,
      top,
    };
    activeCardRef.current = nextCard;
    setActiveCard(nextCard);
  }, [unmarkedOccurrences]);

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

    const findWordByOccurrence = (element: HTMLElement) => {
      const pageElement = element.closest<HTMLElement>('[data-page-number]');
      const occurrenceId = element.dataset.linguareadOccurrence;
      if (!pageElement || !occurrenceId) return null;
      const pageNumber = Number(pageElement.dataset.pageNumber);
      const target = (wordTargetsRef.current[pageNumber] ?? []).find(
        (candidate) => candidate.id === occurrenceId,
      );
      return target
        ? {
            rectangle: element.getBoundingClientRect(),
            target,
          }
        : null;
    };

    const handleMouseMove = (event: MouseEvent) => {
      // A deliberate double-click owns the card until the user closes it or
      // deliberately selects another word.
      if (activeCardRef.current?.mode === 'full') return;

      const word = findWordAtPoint(event);
      if (!word) {
        previewOccurrenceRef.current = null;
        activeCardRef.current = null;
        setActiveCard((current) =>
          current?.mode === 'preview' ? null : current,
        );
        return;
      }
      if (previewOccurrenceRef.current === word.target.id) return;
      previewOccurrenceRef.current = word.target.id;
      showCard(word.target, word.rectangle, 'preview');
    };
    const handleMouseLeave = () => {
      previewOccurrenceRef.current = null;
      if (activeCardRef.current?.mode === 'preview') {
        activeCardRef.current = null;
      }
      setActiveCard((current) =>
        current?.mode === 'preview' ? null : current,
      );
    };
    const handleDoubleClick = (event: MouseEvent) => {
      const word = findWordAtPoint(event);
      if (!word) return;
      event.preventDefault();
      window.getSelection()?.removeAllRanges();
      previewOccurrenceRef.current = null;
      showCard(word.target, word.rectangle, 'full');
    };
    const handleMouseDown = (event: MouseEvent) => {
      if (event.detail !== 1 || findWordAtPoint(event)) return;
      if (activeCardRef.current?.mode === 'full') {
        activeCardRef.current = null;
        setActiveCard(null);
      }
    };
    const handleFocusIn = (event: FocusEvent) => {
      const element =
        event.target instanceof HTMLElement
          ? event.target.closest<HTMLElement>('[data-linguaread-occurrence]')
          : null;
      const word = element ? findWordByOccurrence(element) : null;
      if (word && activeCardRef.current?.mode !== 'full') {
        showCard(word.target, word.rectangle, 'preview');
      }
    };
    const handleFocusOut = (event: FocusEvent) => {
      if (
        !(event.target instanceof HTMLElement) ||
        !event.target.closest('[data-linguaread-occurrence]')
      ) {
        return;
      }
      if (activeCardRef.current?.mode === 'preview') {
        activeCardRef.current = null;
      }
      setActiveCard((current) =>
        current?.mode === 'preview' ? null : current,
      );
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const element =
        event.target instanceof HTMLElement
          ? event.target.closest<HTMLElement>('[data-linguaread-occurrence]')
          : null;
      const word = element ? findWordByOccurrence(element) : null;
      if (!word) return;
      event.preventDefault();
      showCard(word.target, word.rectangle, 'full');
    };

    viewer.addEventListener('mousemove', handleMouseMove);
    viewer.addEventListener('mouseleave', handleMouseLeave);
    viewer.addEventListener('mousedown', handleMouseDown);
    viewer.addEventListener('dblclick', handleDoubleClick);
    viewer.addEventListener('focusin', handleFocusIn);
    viewer.addEventListener('focusout', handleFocusOut);
    viewer.addEventListener('keydown', handleKeyDown);

    return () => {
      viewer.removeEventListener('mousemove', handleMouseMove);
      viewer.removeEventListener('mouseleave', handleMouseLeave);
      viewer.removeEventListener('mousedown', handleMouseDown);
      viewer.removeEventListener('dblclick', handleDoubleClick);
      viewer.removeEventListener('focusin', handleFocusIn);
      viewer.removeEventListener('focusout', handleFocusOut);
      viewer.removeEventListener('keydown', handleKeyDown);
    };
  }, [showCard]);

  const visibleWordTargets = Object.values(wordTargets).flat();
  const mandarinCount = visibleWordTargets.filter((target) => {
    const result = languageFixtureForWord(target.word);
    return (
      result?.action === 'use_mandarin' &&
      !unmarkedOccurrences.has(target.id)
    );
  }).length;
  const synonymCount = visibleWordTargets.filter((target) => {
    const result = languageFixtureForWord(target.word);
    return (
      result?.action === 'use_synonym' &&
      !unmarkedOccurrences.has(target.id)
    );
  }).length;

  const saveActiveWord = async () => {
    if (!activeCard) return;
    const entry = activeCard.result
      ? toVocabularyEntry(activeCard.result)
      : createPendingVocabularyEntry(activeCard.sourceWord);
    const nextState = saveVocabularyEntry(vocabulary, entry);
    setVocabulary(nextState);
    setStatusMessage(`${entry.sourceWord} saved to your Dictionary.`);

    try {
      await writeVocabularyState(nextState);
    } catch {
      setVocabulary(vocabulary);
      setStatusMessage('');
      setError('LinguaRead could not save that word. Try again.');
    }
  };

  const toggleActiveMarker = () => {
    if (!activeCard?.result || !activeCard.isCandidate) return;
    setUnmarkedOccurrences((current) => {
      const next = new Set(current);
      next.add(activeCard.occurrenceId);
      return next;
    });
    const nextCard = { ...activeCard, isCandidate: false };
    activeCardRef.current = nextCard;
    setActiveCard(nextCard);
    setStatusMessage(
      `${activeCard.sourceWord} marker hidden for this PDF.`,
    );
  };

  const activeWordIsSaved = Boolean(
    activeCard && dictionaryHasWord(vocabulary, activeCard.sourceWord),
  );

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
          {isPdfHandoff && file && (
            <FilePickerButton
              className="compact-file-button"
              label="Choose another PDF"
              onFile={handleFile}
            />
          )}
        </div>
      </header>

      {!isPdfHandoff && (
        <section className="document-header" aria-label="PDF controls">
          <div>
            <p className="eyebrow">PDF-first reading aid</p>
            <h1>LinguaRead</h1>
            <p>
              Read the original layout. Double-click any word for help.
            </p>
          </div>

          <FilePickerButton
            label={file ? 'Choose another PDF' : 'Choose PDF'}
            onFile={handleFile}
          />
        </section>
      )}

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
          <span className="legend-item saved">
            <i /> {vocabulary.entries.length} saved
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
          <FilePickerButton
            className="permission-action"
            label="Choose this PDF"
            onFile={handleFile}
          />
        </div>
      )}

      <section
        className="reader-stage"
        ref={viewerRef}
        onScroll={() => {
          previewOccurrenceRef.current = null;
          if (activeCardRef.current?.mode === 'preview') {
            activeCardRef.current = null;
          }
          setActiveCard((current) =>
            current?.mode === 'preview' ? null : current,
          );
        }}
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
            unmarkedOccurrences={unmarkedOccurrences}
            wordTargets={wordTargets}
            setPageCount={setPageCount}
            setRenderedPageCount={setRenderedPageCount}
            setPageAspectRatio={setPageAspectRatio}
            setPageWordCount={setPageWordCount}
            setPageWordTargets={setPageWordTargets}
            setPdfError={setPdfError}
          />
        )}
      </section>

      {activeCard && (
        <aside
          className={`word-card ${activeCard.mode}`}
          style={{ left: activeCard.left, top: activeCard.top }}
          role={activeCard.mode === 'full' ? 'dialog' : 'status'}
          aria-label={`${activeCard.sourceWord} word help`}
        >
          {activeCard.mode === 'full' && (
            <button
              className="card-close"
              aria-label="Close word card"
              onClick={() => {
                activeCardRef.current = null;
                setActiveCard(null);
              }}
            >
              ×
            </button>
          )}
          <p className="card-label">
            {activeCard.mode === 'full' ? 'Word help' : 'Quick view'}
          </p>
          <div className="word-pair">
            <strong>{activeCard.sourceWord}</strong>
            {activeCard.result && <span>{activeCard.result.mandarin}</span>}
          </div>
          {activeCard.result && (
            <p className="pinyin">{activeCard.result.pinyin}</p>
          )}
          {activeCard.mode === 'full' && (
            <>
              {activeCard.result ? (
                <>
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
                </>
              ) : (
                <div className="word-pending">
                  <strong>Word help is not connected yet.</strong>
                  <p>
                    This word is selectable. LinguaRead will create its card
                    after the language service is added.
                  </p>
                </div>
              )}
              <div className="card-actions">
                <button
                  className={`primary-button ${activeWordIsSaved ? 'selected' : ''}`}
                  disabled={activeWordIsSaved}
                  onClick={() => void saveActiveWord()}
                >
                  {activeWordIsSaved
                    ? 'Saved to Dictionary'
                    : 'Save to Dictionary'}
                </button>
                {activeCard.isCandidate && (
                  <button
                    className="text-button"
                    onClick={toggleActiveMarker}
                  >
                    Unmark
                  </button>
                )}
              </div>
            </>
          )}
          {activeCard.mode === 'preview' && (
            <p className="preview-hint">
              Double-click or press Enter for details
            </p>
          )}
        </aside>
      )}
    </main>
  );
}

export default App;
