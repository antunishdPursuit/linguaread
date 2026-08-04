import { FormEvent, useEffect, useState } from 'react';
import {
  clearGeminiApiKey,
  readGeminiApiKey,
  storeGeminiApiKey,
} from '../../lib/geminiKeyStorage';
import {
  GeminiLanguageError,
  requestGeminiWordHelp,
} from '../../lib/geminiLanguage';

type TestState = 'idle' | 'testing' | 'passed' | 'error';

const TEST_WORD = 'attributed';
const TEST_SENTENCE =
  'The report attributed the improvement to careful planning.';

function App() {
  const [apiKey, setApiKey] = useState('');
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [testedKey, setTestedKey] = useState('');
  const [testState, setTestState] = useState<TestState>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    void readGeminiApiKey()
      .then((storedKey) => {
        setHasStoredKey(storedKey !== null);
      })
      .catch(() => {
        setTestState('error');
        setMessage('LinguaRead could not read session storage.');
      });
  }, []);

  const normalizedKey = apiKey.trim();
  const canUseTestedKey =
    testState === 'passed' &&
    testedKey !== '' &&
    testedKey === normalizedKey;

  const handleTest = async (event: FormEvent) => {
    event.preventDefault();
    if (normalizedKey === '' || testState === 'testing') return;

    setTestState('testing');
    setMessage('Testing this key with one public sample sentence…');

    try {
      await requestGeminiWordHelp({
        apiKey: normalizedKey,
        sourceWord: TEST_WORD,
        sentenceContext: TEST_SENTENCE,
      });
      setTestedKey(normalizedKey);
      setTestState('passed');
      setMessage('The key worked. You can now use it for this session.');
    } catch (error) {
      setTestedKey('');
      setTestState('error');
      setMessage(
        error instanceof GeminiLanguageError
          ? error.message
          : 'LinguaRead could not test this key.',
      );
    }
  };

  const handleSave = async () => {
    if (!canUseTestedKey) return;

    try {
      await storeGeminiApiKey(normalizedKey);
      setHasStoredKey(true);
      setApiKey('');
      setTestedKey('');
      setTestState('idle');
      setMessage('Gemini is ready for this Chrome session.');
    } catch {
      setTestState('error');
      setMessage('LinguaRead could not store this key for the session.');
    }
  };

  const handleClear = async () => {
    try {
      await clearGeminiApiKey();
      setHasStoredKey(false);
      setApiKey('');
      setTestedKey('');
      setTestState('idle');
      setMessage('The session key was cleared.');
    } catch {
      setTestState('error');
      setMessage('LinguaRead could not clear the session key.');
    }
  };

  return (
    <main className="settings-shell">
      <header className="brand">
        <span className="pdf-icon" aria-hidden="true">
          PDF
        </span>
        <div>
          <p className="eyebrow">Language service</p>
          <h1>LinguaRead Gemini settings</h1>
        </div>
      </header>

      <section className="settings-card" aria-labelledby="key-heading">
        <div className="card-heading">
          <div>
            <h2 id="key-heading">Use your own test key</h2>
            <p>
              The key stays in Chrome session storage and clears after Chrome
              restarts or the extension reloads.
            </p>
          </div>
          <span className={hasStoredKey ? 'status active' : 'status'}>
            {hasStoredKey ? 'Active this session' : 'No active key'}
          </span>
        </div>

        <form onSubmit={(event) => void handleTest(event)}>
          <label htmlFor="gemini-key">Gemini API key</label>
          <input
            id="gemini-key"
            type="password"
            value={apiKey}
            onChange={(event) => {
              setApiKey(event.target.value);
              setTestedKey('');
              setTestState('idle');
              setMessage('');
            }}
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste your tester key"
          />

          <div className="actions">
            <button
              type="submit"
              disabled={normalizedKey === '' || testState === 'testing'}
            >
              {testState === 'testing' ? 'Testing…' : 'Test key'}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!canUseTestedKey}
              onClick={() => void handleSave()}
            >
              Use for this session
            </button>
            {hasStoredKey && (
              <button
                type="button"
                className="text-button"
                onClick={() => void handleClear()}
              >
                Clear key
              </button>
            )}
          </div>
        </form>

        {message && (
          <p
            className={testState === 'error' ? 'notice error' : 'notice'}
            role="status"
            aria-live="polite"
          >
            {message}
          </p>
        )}
      </section>

      <aside className="privacy-note">
        <h2>Before testing</h2>
        <p>
          Use public or non-sensitive PDF text. When word help is connected,
          LinguaRead will send only the selected word and one sentence to
          Google Gemini.
        </p>
        <p>Never share your key in chat, screenshots, or project files.</p>
      </aside>
    </main>
  );
}

export default App;
