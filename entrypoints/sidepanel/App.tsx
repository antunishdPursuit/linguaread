import { useEffect, useMemo, useState } from 'react';
import type { VocabularyEntry, VocabularyState } from '../../lib/types';
import {
  EMPTY_VOCABULARY_STATE,
  readVocabularyState,
  subscribeToVocabularyState,
} from '../../lib/vocabularyStorage';

function DictionaryEntries({ entries }: { entries: VocabularyEntry[] }) {
  if (!entries.length) {
    return (
      <div className="empty-state">
        <span aria-hidden="true">◎</span>
        <strong>No saved words yet</strong>
        <p>Open a word card in the PDF, then select Save.</p>
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
          <p className="meaning">{entry.definition || entry.shortMeaning}</p>
          {entry.simplerEnglish && (
            <p className="simpler">
              Simpler English: <strong>{entry.simplerEnglish}</strong>
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function App() {
  const [query, setQuery] = useState('');
  const [vocabulary, setVocabulary] = useState<VocabularyState>(
    EMPTY_VOCABULARY_STATE,
  );
  const [error, setError] = useState('');

  useEffect(() => {
    void readVocabularyState()
      .then(setVocabulary)
      .catch(() => setError('LinguaRead could not load your Dictionary.'));
    return subscribeToVocabularyState(setVocabulary);
  }, []);

  const filteredEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return vocabulary.entries;

    return vocabulary.entries.filter((entry) =>
      [
        entry.sourceWord,
        entry.mandarin,
        entry.pinyin,
        entry.definition,
        entry.shortMeaning,
        entry.simplerEnglish,
      ].some((value) => value.toLowerCase().includes(normalized)),
    );
  }, [query, vocabulary.entries]);

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
        <p>Dictionary</p>
        <h2 id="panel-title">Your saved words</h2>
      </section>

      <label className="search-field">
        <span aria-hidden="true">⌕</span>
        <span className="sr-only">Search your Dictionary</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search saved words…"
        />
      </label>

      <p className="list-summary">
        {filteredEntries.length}{' '}
        {filteredEntries.length === 1 ? 'saved word' : 'saved words'}
      </p>

      {error && (
        <p className="panel-error" role="alert">
          {error}
        </p>
      )}

      <DictionaryEntries entries={filteredEntries} />
    </main>
  );
}

export default App;
