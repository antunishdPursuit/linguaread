import type {
  LocalDictionaryMatch,
  LocalDictionaryTranslation,
} from './localDictionary';
import type { LanguageResult } from './types';

export const LANGUAGE_BROKER_URL =
  'https://linguaread-language-broker.enhancereactapptest.workers.dev/v1/word-help';
export const LANGUAGE_BROKER_MODEL = 'gemini-3.5-flash';
export const LANGUAGE_BROKER_PROMPT_VERSION = 'candidate-selector-v2';
export const LANGUAGE_BROKER_CLIENT_STORAGE_KEY =
  'linguaread-broker-client-v1';

const MAX_CANDIDATES = 12;
const CARD_CONTENT_VERSION = 'concise-card-v3';
const MAX_DEFINITION_LENGTH = 160;
const PART_OF_SPEECH =
  '(?:n|v|vt|vi|adj|adv|prep|pron|conj|interj|num|art|aux|modal|phr)';
const LEADING_PART_OF_SPEECH_PATTERN = new RegExp(
  `^(${PART_OF_SPEECH})\\.?\\s+`,
  'i',
);
const NEXT_PART_OF_SPEECH_PATTERN = new RegExp(
  `\\s+(?=${PART_OF_SPEECH}\\.?\\s)`,
  'i',
);
const ANY_PART_OF_SPEECH_PATTERN = new RegExp(
  `(?:^|\\s)(${PART_OF_SPEECH})\\.?\\s+`,
  'gi',
);

const PART_OF_SPEECH_LABELS: Record<string, string> = {
  adj: 'ADJ',
  adv: 'ADV',
  art: 'ART',
  aux: 'AUX',
  conj: 'CONJ',
  interj: 'INTERJ',
  modal: 'MODAL',
  n: 'N',
  num: 'NUM',
  phr: 'PHR',
  prep: 'PREP',
  pron: 'PRON',
  v: 'V',
  vi: 'V',
  vt: 'V',
};

export type BrokerCandidate = {
  gloss: string;
  id: string;
  kind: 'mandarin';
  value: string;
};

type BrokerSelection = {
  candidateId: string | null;
  confidence: number;
  decision: 'keep_english' | 'none_fit' | 'use_candidate';
  reason: string;
  selectedSense: string | null;
  tokenType: 'acronym' | 'common_word' | 'other' | 'proper_name';
};

type StorageArea = {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

export type BrokerLanguageRequest = {
  match: LocalDictionaryMatch;
  sentenceContext: string;
  signal?: AbortSignal;
  sourceWord: string;
};

export class BrokerLanguageError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'candidate_rejected'
      | 'invalid_input'
      | 'request_failed'
      | 'response_invalid',
    readonly status?: number,
  ) {
    super(message);
    this.name = 'BrokerLanguageError';
  }
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function truncateAtWord(value: string, maximumLength: number): string {
  if (value.length <= maximumLength) return value;
  const clipped = value.slice(0, maximumLength + 1);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${clipped.slice(0, lastSpace > 0 ? lastSpace : maximumLength).trim()}…`;
}

function conciseDefinition(gloss: string): {
  definition: string;
  partOfSpeech: string;
} {
  const normalized = gloss.trim().replace(/\s+/g, ' ');
  const withoutParenthetical = normalized.replace(/^\([^)]{1,60}\)\s*/, '');
  const partOfSpeechMatch = withoutParenthetical.match(
    LEADING_PART_OF_SPEECH_PATTERN,
  );
  const partOfSpeech = partOfSpeechMatch
    ? PART_OF_SPEECH_LABELS[partOfSpeechMatch[1].toLowerCase()] ?? ''
    : '';
  const withoutLabels = withoutParenthetical.replace(
    LEADING_PART_OF_SPEECH_PATTERN,
    '',
  );
  const firstSense = withoutLabels.split(NEXT_PART_OF_SPEECH_PATTERN, 1)[0];
  const firstSentence = firstSense.match(/^.*?[.!?](?:\s|$)/)?.[0] ?? firstSense;
  const concise = truncateAtWord(firstSentence.trim(), MAX_DEFINITION_LENGTH);
  if (!concise) return { definition: normalized, partOfSpeech };

  const sentenceCase = `${concise[0].toLocaleUpperCase('en-US')}${concise.slice(1)}`;
  return {
    definition: /[.!?…]$/.test(sentenceCase)
      ? sentenceCase
      : `${sentenceCase}.`,
    partOfSpeech,
  };
}

function partOfSpeechForSense(gloss: string, selectedSense: string): string {
  const directLabel = conciseDefinition(selectedSense).partOfSpeech;
  if (directLabel) return directLabel;

  const senseIndex = gloss
    .toLocaleLowerCase('en-US')
    .indexOf(selectedSense.toLocaleLowerCase('en-US'));
  if (senseIndex < 0) return '';

  const precedingGloss = gloss.slice(0, senseIndex);
  const matches = [...precedingGloss.matchAll(ANY_PART_OF_SPEECH_PATTERN)];
  const nearestLabel = matches.at(-1)?.[1]?.toLowerCase();
  return nearestLabel ? PART_OF_SPEECH_LABELS[nearestLabel] ?? '' : '';
}

function visibleUsageNote(reason: string, candidateId: string): string {
  const escapedCandidateId = candidateId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return reason
    .replace(new RegExp(`\\s*\\(${escapedCandidateId}\\)`, 'gi'), '')
    .replace(new RegExp(escapedCandidateId, 'gi'), '')
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function createLanguageCacheKey(
  sourceWord: string,
  sentenceContext: string,
): string {
  const normalized = [
    LANGUAGE_BROKER_MODEL,
    LANGUAGE_BROKER_PROMPT_VERSION,
    CARD_CONTENT_VERSION,
    'freedict-2025.11.23+ecdict-bc015ed-ranked-v1',
    'B2',
    sourceWord.trim().toLocaleLowerCase('en-US'),
    sentenceContext.trim().replace(/\s+/g, ' '),
  ].join('|');

  return `word-help:v4:${stableHash(normalized)}`;
}

export function createBrokerCandidates(
  translations: readonly LocalDictionaryTranslation[],
): BrokerCandidate[] {
  return translations.slice(0, MAX_CANDIDATES).map((translation, index) => ({
    gloss: translation.gloss.slice(0, 240),
    id: `${translation.source}:${index}`,
    kind: 'mandarin',
    value: translation.value.slice(0, 80),
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseBrokerSelection(
  value: unknown,
  candidates: readonly BrokerCandidate[],
): BrokerSelection {
  if (!isRecord(value)) {
    throw new BrokerLanguageError(
      'The language broker returned an invalid selection.',
      'response_invalid',
    );
  }

  const decisions = ['keep_english', 'none_fit', 'use_candidate'];
  const tokenTypes = ['acronym', 'common_word', 'other', 'proper_name'];
  if (
    !decisions.includes(String(value.decision)) ||
    !tokenTypes.includes(String(value.tokenType)) ||
    typeof value.confidence !== 'number' ||
    value.confidence < 0 ||
    value.confidence > 1 ||
    typeof value.reason !== 'string' ||
    value.reason.trim() === '' ||
    (value.selectedSense !== null && typeof value.selectedSense !== 'string')
  ) {
    throw new BrokerLanguageError(
      'The language broker returned malformed word help.',
      'response_invalid',
    );
  }

  const candidateId =
    value.candidateId === null ? null : String(value.candidateId);
  if (
    value.decision === 'use_candidate' &&
    !candidates.some((candidate) => candidate.id === candidateId)
  ) {
    throw new BrokerLanguageError(
      'The language broker selected an unavailable candidate.',
      'response_invalid',
    );
  }
  const selectedCandidate = candidates.find(
    (candidate) => candidate.id === candidateId,
  );
  const selectedSense =
    typeof value.selectedSense === 'string' ? value.selectedSense.trim() : null;
  if (
    value.decision === 'use_candidate' &&
    (!selectedSense || !selectedCandidate?.gloss.includes(selectedSense))
  ) {
    throw new BrokerLanguageError(
      'The language broker returned an ungrounded definition.',
      'response_invalid',
    );
  }
  if (
    value.decision !== 'use_candidate' &&
    (candidateId !== null || selectedSense !== null)
  ) {
    throw new BrokerLanguageError(
      'The language broker returned a conflicting selection.',
      'response_invalid',
    );
  }

  return {
    candidateId,
    confidence: value.confidence,
    decision: value.decision as BrokerSelection['decision'],
    reason: value.reason.trim(),
    selectedSense,
    tokenType: value.tokenType as BrokerSelection['tokenType'],
  };
}

async function readClientId(
  storage: StorageArea = browser.storage.local,
): Promise<string> {
  const stored = await storage.get(LANGUAGE_BROKER_CLIENT_STORAGE_KEY);
  const existing = stored[LANGUAGE_BROKER_CLIENT_STORAGE_KEY];
  if (
    typeof existing === 'string' &&
    /^[A-Za-z0-9_-]{16,64}$/.test(existing)
  ) {
    return existing;
  }

  const clientId = crypto.randomUUID().replaceAll('-', '');
  await storage.set({ [LANGUAGE_BROKER_CLIENT_STORAGE_KEY]: clientId });
  return clientId;
}

export async function requestBrokerWordHelp(
  request: BrokerLanguageRequest,
  fetchImplementation: typeof fetch = fetch,
  storage: StorageArea = browser.storage.local,
): Promise<LanguageResult> {
  const sourceWord = request.sourceWord.trim();
  const sentenceContext = request.sentenceContext.trim().replace(/\s+/g, ' ');
  const candidates = createBrokerCandidates(request.match.translations);
  if (!sourceWord || !sentenceContext || candidates.length === 0) {
    throw new BrokerLanguageError(
      'LinguaRead needs one word, one sentence, and local candidates.',
      'invalid_input',
    );
  }

  const response = await fetchImplementation(LANGUAGE_BROKER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-LinguaRead-Client': await readClientId(storage),
    },
    body: JSON.stringify({
      candidates,
      level: 'B2',
      sentence: sentenceContext,
      word: sourceWord,
    }),
    signal: request.signal,
  });

  if (!response.ok) {
    throw new BrokerLanguageError(
      `The language broker returned status ${response.status}.`,
      'request_failed',
      response.status,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new BrokerLanguageError(
      'The language broker returned unreadable data.',
      'response_invalid',
    );
  }
  if (
    !isRecord(body) ||
    body.model !== LANGUAGE_BROKER_MODEL ||
    body.promptVersion !== LANGUAGE_BROKER_PROMPT_VERSION
  ) {
    throw new BrokerLanguageError(
      'The language broker returned an unexpected version.',
      'response_invalid',
    );
  }

  const selection = parseBrokerSelection(body.result, candidates);
  if (
    selection.decision !== 'use_candidate' ||
    selection.candidateId === null
  ) {
    throw new BrokerLanguageError(
      'No supplied translation fit this sentence.',
      'candidate_rejected',
    );
  }

  const selected = candidates.find(
    (candidate) => candidate.id === selection.candidateId,
  );
  if (!selected) {
    throw new BrokerLanguageError(
      'The selected translation is unavailable.',
      'response_invalid',
    );
  }

  const resultIdentity = [
    sourceWord.toLocaleLowerCase('en-US'),
    sentenceContext,
    selected.id,
    selected.value,
  ].join('|');
  // Pinyin is needed only after the broker accepts a Mandarin candidate.
  // Loading it here keeps the normal PDF reader startup bundle smaller.
  const { pinyin } = await import('pinyin-pro');
  const selectedSense = selection.selectedSense ?? selected.gloss;
  const definitionDetails = conciseDefinition(selectedSense);
  const partOfSpeech =
    definitionDetails.partOfSpeech ||
    partOfSpeechForSense(selected.gloss, selectedSense);

  return {
    action: 'use_mandarin',
    cefr: 'B2',
    confidence: selection.confidence,
    contextualExample: sentenceContext,
    definition: definitionDetails.definition,
    displayWord: selected.value,
    id: `${request.match.headword}-${stableHash(resultIdentity)}`,
    lemma: request.match.headword,
    mandarin: selected.value,
    partOfSpeech,
    pinyin: pinyin(selected.value),
    shortMeaning: definitionDetails.definition,
    sourceWord,
    usageNote: visibleUsageNote(selection.reason, selected.id),
  };
}
