import { useEffect, useMemo, useState } from 'react';
import type { VocabularyEntry, VocabularyState } from '../../lib/types';
import {
  EMPTY_VOCABULARY_STATE,
  readVocabularyState,
  removeVocabularyEntry,
  subscribeToVocabularyState,
  writeVocabularyState,
} from '../../lib/vocabularyStorage';

function DictionaryEntries({
  entries,
  onRemove,
  removingId,
}: {
  entries: VocabularyEntry[];
  onRemove: (entry: VocabularyEntry) => void;
  removingId: string | null;
}) {
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
              {entry.mandarin && (
                <span className="mandarin">{entry.mandarin}</span>
              )}
              <strong>{entry.sourceWord}</strong>
            </div>
            <button
              className="remove-word"
              type="button"
              aria-label={`Remove ${entry.sourceWord} from Dictionary`}
              title={`Remove ${entry.sourceWord}`}
              disabled={removingId === entry.id}
              onClick={() => onRemove(entry)}
            >
              X
            </button>
          </div>
          {entry.pinyin && <p className="pinyin">{entry.pinyin}</p>}
          <p className="meaning">
            {entry.partOfSpeech && (
              <span className="part-of-speech">[{entry.partOfSpeech}]</span>
            )}{' '}
            {entry.definition ||
              entry.shortMeaning ||
              'Word details are not available yet.'}
          </p>
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
  const [removingId, setRemovingId] = useState<string | null>(null);

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
        entry.partOfSpeech,
      ].some((value) => value.toLowerCase().includes(normalized)),
    );
  }, [query, vocabulary.entries]);

  const removeEntry = async (entry: VocabularyEntry) => {
    const previousState = vocabulary;
    const nextState = removeVocabularyEntry(vocabulary, entry.id);
    setError('');
    setRemovingId(entry.id);
    setVocabulary(nextState);

    try {
      await writeVocabularyState(nextState);
    } catch {
      setVocabulary(previousState);
      setError(`LinguaRead could not remove ${entry.sourceWord}. Try again.`);
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <main className="panel-shell">
      <header className="panel-header">
        <div className="brand">
          <h1 className="brand-heading">
            <img
              className="brand-logo"
              src="/branding/linguaread-logo.png"
              alt="LinguaRead"
            />
          </h1>
        </div>
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

      <DictionaryEntries
        entries={filteredEntries}
        onRemove={(entry) => void removeEntry(entry)}
        removingId={removingId}
      />
    </main>
  );
}

export default App;
