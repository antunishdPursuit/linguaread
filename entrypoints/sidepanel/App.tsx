import { useMemo, useState } from 'react';
import { MOCK_VOCABULARY } from '../../lib/mockLanguage';
import type { VocabularyEntry } from '../../lib/types';

type PanelTab = 'learning' | 'known';

function WordList({ entries }: { entries: VocabularyEntry[] }) {
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
        </li>
      ))}
    </ul>
  );
}

function App() {
  const [tab, setTab] = useState<PanelTab>('learning');
  const [query, setQuery] = useState('');
  const entries =
    tab === 'learning' ? MOCK_VOCABULARY.learning : MOCK_VOCABULARY.known;
  const filteredEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return entries;

    return entries.filter((entry) =>
      [entry.sourceWord, entry.mandarin, entry.pinyin, entry.shortMeaning].some(
        (value) => value.toLowerCase().includes(normalized),
      ),
    );
  }, [entries, query]);

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

      <div className="tabs" role="tablist" aria-label="Vocabulary lists">
        <button
          role="tab"
          aria-selected={tab === 'learning'}
          className={tab === 'learning' ? 'active' : ''}
          onClick={() => setTab('learning')}
        >
          Learning <span>{MOCK_VOCABULARY.learning.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === 'known'}
          className={tab === 'known' ? 'active' : ''}
          onClick={() => setTab('known')}
        >
          Known Words <span>{MOCK_VOCABULARY.known.length}</span>
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

      <WordList entries={filteredEntries} />
    </main>
  );
}

export default App;
