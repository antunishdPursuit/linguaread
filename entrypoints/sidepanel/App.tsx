import { useState } from 'react';
import { MOCK_VOCABULARY } from '../../lib/mockLanguage';
import type { VocabularyEntry } from '../../lib/types';

type PanelTab = 'learning' | 'known';

function WordList({ entries }: { entries: VocabularyEntry[] }) {
  if (!entries.length) return <p className="empty-state">No words here yet.</p>;

  return (
    <ul className="word-list">
      {entries.map((entry) => (
        <li key={entry.id} className="word-item">
          <div className="word-title">
            <strong>{entry.sourceWord}</strong>
            <span>{entry.cefr}</span>
          </div>
          <p className="mandarin">{entry.mandarin}</p>
          <p>{entry.pinyin}</p>
          <p>{entry.shortMeaning}</p>
        </li>
      ))}
    </ul>
  );
}

function App() {
  const [tab, setTab] = useState<PanelTab>('learning');
  const entries = tab === 'learning' ? MOCK_VOCABULARY.learning : MOCK_VOCABULARY.known;

  return (
    <main className="panel-shell">
      <header>
        <p className="eyebrow">LinguaRead</p>
        <h1>Your words</h1>
        <p className="panel-note">Mock data for the PDF proof.</p>
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
          Known <span>{MOCK_VOCABULARY.known.length}</span>
        </button>
      </div>

      <WordList entries={entries} />
    </main>
  );
}

export default App;
