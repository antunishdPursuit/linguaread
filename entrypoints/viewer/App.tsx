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

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

type CardMode = 'preview' | 'full';

type ActiveCard = {
  mode: CardMode;
  result: LanguageResult;
  left: number;
  top: number;
};

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

const PdfReaderPage = memo(function PdfReaderPage({
  file,
  viewerWidth,
  vocabulary,
  setPageCount,
  setExtractedWords,
  setError,
}: {
  file: File;
  viewerWidth: number;
  vocabulary: VocabularyState;
  setPageCount: Dispatch<SetStateAction<number>>;
  setExtractedWords: Dispatch<SetStateAction<number>>;
  setError: Dispatch<SetStateAction<string>>;
}) {
  return (
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
        customTextRenderer={({ str }) => renderMockText(str, vocabulary)}
        onGetTextSuccess={({ items }) => {
          const text = items
            .filter((item): item is typeof item & { str: string } => 'str' in item)
            .map((item) => item.str)
            .join(' ');
          setExtractedWords(text.trim() ? text.trim().split(/\s+/).length : 0);
        }}
      />
    </Document>
  );
});

function App() {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('Choose a PDF to begin');
  const [pageCount, setPageCount] = useState(0);
  const [extractedWords, setExtractedWords] = useState(0);
  const [viewerWidth, setViewerWidth] = useState(760);
  const [activeCard, setActiveCard] = useState<ActiveCard | null>(null);
  const [vocabulary, setVocabulary] = useState<VocabularyState>(
    EMPTY_VOCABULARY_STATE,
  );
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const element = viewerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setViewerWidth(Math.max(320, Math.min(760, entry.contentRect.width - 48)));
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    void readVocabularyState()
      .then(setVocabulary)
      .catch(() => setError('LinguaRead could not load your saved word lists.'));
    return subscribeToVocabularyState(setVocabulary);
  }, []);

  const handleFile = useCallback((nextFile?: File) => {
    setActiveCard(null);
    setError('');
    setExtractedWords(0);
    setPageCount(0);

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

  const openSidePanel = useCallback(async () => {
    try {
      const currentWindow = await chrome.windows.getCurrent();
      if (currentWindow.id === undefined) throw new Error('Window not found');
      await chrome.sidePanel.open({ windowId: currentWindow.id });
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
          Choose PDF
          <input
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
          {extractedWords > 0 && <span>{extractedWords} words on page 1</span>}
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

      <p className="sr-only" aria-live="polite">
        {statusMessage}
      </p>

      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}

      <section
        className="reader-stage"
        ref={viewerRef}
      >
        {!file ? (
          <div className="empty-reader">
            <div className="empty-document" aria-hidden="true">
              <span>PDF</span>
            </div>
            <h2>Choose a text-based PDF</h2>
            <p>
              LinguaRead will display page one and mark only the words prepared
              for help.
            </p>
          </div>
        ) : (
          <PdfReaderPage
            file={file}
            viewerWidth={viewerWidth}
            vocabulary={vocabulary}
            setPageCount={setPageCount}
            setExtractedWords={setExtractedWords}
            setError={setError}
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
