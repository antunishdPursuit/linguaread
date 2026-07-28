import { useEffect, useMemo, useState } from 'react';
import type {
  VocabularyEntry,
  VocabularyList,
  VocabularyState,
} from '../../lib/types';
import {
  EMPTY_VOCABULARY_STATE,
  moveVocabularyEntry,
  readVocabularyState,
  subscribeToVocabularyState,
  writeVocabularyState,
} from '../../lib/vocabularyStorage';
import {
  PDF_LAUNCH_STORAGE_KEY,
  isPdfUrl,
  pdfNameFromUrl,
  viewerUrlForPdf,
  type PdfLaunchContext,
} from '../../lib/pdfLaunch';

type PanelTab = 'learning' | 'known';

function WordList({
  entries,
  tab,
  onMove,
}: {
  entries: VocabularyEntry[];
  tab: PanelTab;
  onMove: (entry: VocabularyEntry, destination: VocabularyList) => void;
}) {
  if (!entries.length) {
    return (
      <div className="empty-state">
        <span aria-hidden="true">◎</span>
        <strong>No words here yet</strong>
        <p>Words you choose in the PDF will appear here.</p>
      </div>
    );
  }

  return (
    <ul className="word-list">
      {entries.map((entry) => (
        <li key={entry.id} className="word-item">
          <div className="word-title">
            <div>
              <span className="mandarin">{entry.mandarin}</span>
              <strong>{entry.sourceWord}</strong>
            </div>
            <span className="cefr">{entry.cefr}</span>
          </div>
          <p className="pinyin">{entry.pinyin}</p>
          <p className="meaning">{entry.shortMeaning}</p>
          <button
            className="move-button"
            onClick={() =>
              onMove(entry, tab === 'learning' ? 'known' : 'learning')
            }
          >
            Move to {tab === 'learning' ? 'Known Words' : 'Learning'}
          </button>
        </li>
      ))}
    </ul>
  );
}

function App() {
  const [launchContext, setLaunchContext] = useState<PdfLaunchContext | null>(
    null,
  );
  const [panelView, setPanelView] = useState<'launch' | 'words'>('launch');
  const [tab, setTab] = useState<PanelTab>('learning');
  const [query, setQuery] = useState('');
  const [vocabulary, setVocabulary] = useState<VocabularyState>(
    EMPTY_VOCABULARY_STATE,
  );
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const sessionStorage = browser.storage?.session;
    if (sessionStorage) {
      void sessionStorage
        .get(PDF_LAUNCH_STORAGE_KEY)
        .then((stored) => {
          const candidate = stored[PDF_LAUNCH_STORAGE_KEY] as
            | PdfLaunchContext
            | null
            | undefined;
          setLaunchContext(
            candidate && isPdfUrl(candidate.url) ? candidate : null,
          );
        })
        .catch(() => setLaunchContext(null));
    }

    void readVocabularyState()
      .then(setVocabulary)
      .catch(() => setError('LinguaRead could not load your saved words.'));
    return subscribeToVocabularyState(setVocabulary);
  }, []);

  const openReader = async () => {
    setError('');

    try {
      await browser.tabs.create({
        url: launchContext
          ? viewerUrlForPdf(launchContext.url)
          : browser.runtime.getURL('/viewer.html'),
      });
    } catch {
      setError('LinguaRead could not open the reader. Try again.');
    }
  };

  const entries =
    tab === 'learning' ? vocabulary.learning : vocabulary.known;
  const filteredEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return entries;

    return entries.filter((entry) =>
      [entry.sourceWord, entry.mandarin, entry.pinyin, entry.shortMeaning].some(
        (value) => value.toLowerCase().includes(normalized),
      ),
    );
  }, [entries, query]);

  const moveWord = async (
    entry: VocabularyEntry,
    destination: VocabularyList,
  ) => {
    const nextState = moveVocabularyEntry(vocabulary, entry, destination);
    setVocabulary(nextState);
    setStatusMessage(
      `${entry.sourceWord} moved to ${
        destination === 'learning' ? 'Learning' : 'Known Words'
      }.`,
    );
    setError('');

    try {
      await writeVocabularyState(nextState);
    } catch {
      setVocabulary(vocabulary);
      setStatusMessage('');
      setError('LinguaRead could not save that change. Try again.');
    }
  };

  return (
    <main className="panel-shell">
      <header className="panel-header">
        <div className="brand">
          <span aria-hidden="true">▣</span>
          <div>
            <p>PDF reading aid</p>
            <h1>LinguaRead</h1>
          </div>
        </div>
        <span className="level-badge">B2</span>
      </header>

      <nav className="panel-view-switcher" aria-label="LinguaRead panel">
        <button
          className={panelView === 'launch' ? 'active' : ''}
          onClick={() => setPanelView('launch')}
        >
          Read PDF
        </button>
        <button
          className={panelView === 'words' ? 'active' : ''}
          onClick={() => setPanelView('words')}
        >
          Word lists
        </button>
      </nav>

      {panelView === 'launch' ? (
        <section className="launch-card" aria-labelledby="launch-title">
          <span className="launch-icon" aria-hidden="true">
            PDF
          </span>
          <p className="launch-eyebrow">Current tab</p>
          <h2 id="launch-title">
            {launchContext
              ? 'Read this PDF with LinguaRead'
              : 'Open the LinguaRead reader'}
          </h2>
          <p className="launch-file">
            {launchContext
              ? pdfNameFromUrl(launchContext.url)
              : 'Open a PDF, then select the pinned LinguaRead icon.'}
          </p>
          <p className="launch-note">
            LinguaRead opens a separate reading view. It does not change the
            original PDF.
          </p>
          <button className="launch-button" onClick={() => void openReader()}>
            {launchContext ? 'Read this PDF' : 'Choose a PDF'}
          </button>
          {launchContext?.url.startsWith('file:') && (
            <p className="file-access-note">
              If Chrome blocks the file, enable “Allow access to file URLs” for
              LinguaRead or use Choose PDF in the reader.
            </p>
          )}
          {error && (
            <p className="panel-error" role="alert">
              {error}
            </p>
          )}
        </section>
      ) : (
        <>
      <div className="tabs" role="tablist" aria-label="Vocabulary lists">
        <button
          role="tab"
          aria-selected={tab === 'learning'}
          className={tab === 'learning' ? 'active' : ''}
          onClick={() => setTab('learning')}
        >
          Learning <span>{vocabulary.learning.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === 'known'}
          className={tab === 'known' ? 'active' : ''}
          onClick={() => setTab('known')}
        >
          Known Words <span>{vocabulary.known.length}</span>
        </button>
      </div>

      <label className="search-field">
        <span aria-hidden="true">⌕</span>
        <span className="sr-only">Search this word list</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${tab === 'learning' ? 'learning' : 'known'} list…`}
        />
      </label>

      <p className="list-summary">
        {filteredEntries.length}{' '}
        {filteredEntries.length === 1 ? 'word' : 'words'}
      </p>

      <p className="sr-only" aria-live="polite">
        {statusMessage}
      </p>
      {error && (
        <p className="panel-error" role="alert">
          {error}
        </p>
      )}

      <WordList entries={filteredEntries} tab={tab} onMove={moveWord} />
        </>
      )}
    </main>
  );
}

export default App;
