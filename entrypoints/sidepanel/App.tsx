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
  const [tab, setTab] = useState<PanelTab>('learning');
  const [query, setQuery] = useState('');
  const [vocabulary, setVocabulary] = useState<VocabularyState>(
    EMPTY_VOCABULARY_STATE,
  );
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void readVocabularyState()
      .then(setVocabulary)
      .catch(() => setError('LinguaRead could not load your saved words.'));
    return subscribeToVocabularyState(setVocabulary);
  }, []);

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

      <section className="panel-purpose" aria-labelledby="panel-title">
        <p>Word lists</p>
        <h2 id="panel-title">Your reading vocabulary</h2>
      </section>

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
    </main>
  );
}

export default App;
