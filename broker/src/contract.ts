export const BROKER_MODEL = 'gemini-3.5-flash';
export const BROKER_PROMPT_VERSION = 'candidate-selector-v1';
export const MAX_REQUEST_BYTES = 12_000;

const MAX_WORD_LENGTH = 80;
const MAX_SENTENCE_LENGTH = 800;
const MAX_CANDIDATES = 12;
const MAX_CANDIDATE_VALUE_LENGTH = 80;
const MAX_GLOSS_LENGTH = 240;
const CANDIDATE_ID_PATTERN = /^[A-Za-z0-9:_-]{1,64}$/;

const CANDIDATE_KINDS = ['mandarin', 'simpler_english'] as const;
const DECISIONS = ['use_candidate', 'none_fit', 'keep_english'] as const;
const TOKEN_TYPES = [
  'common_word',
  'proper_name',
  'acronym',
  'other',
] as const;

export type CandidateKind = (typeof CANDIDATE_KINDS)[number];
export type SelectionDecision = (typeof DECISIONS)[number];
export type TokenType = (typeof TOKEN_TYPES)[number];

export type LanguageCandidate = {
  gloss: string;
  id: string;
  kind: CandidateKind;
  value: string;
};

export type BrokerRequest = {
  candidates: LanguageCandidate[];
  level: 'B2';
  sentence: string;
  word: string;
};

export type BrokerResult = {
  candidateId: string | null;
  confidence: number;
  decision: SelectionDecision;
  reason: string;
  tokenType: TokenType;
};

export class BrokerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrokerValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function requireBoundedString(
  value: unknown,
  field: string,
  maximumLength: number,
): string {
  if (typeof value !== 'string') {
    throw new BrokerValidationError(`${field} must be text.`);
  }

  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized === '' || normalized.length > maximumLength) {
    throw new BrokerValidationError(`${field} has an invalid length.`);
  }

  return normalized;
}

function isOneOf<T extends string>(
  value: unknown,
  options: readonly T[],
): value is T {
  return typeof value === 'string' && options.includes(value as T);
}

function parseCandidate(value: unknown): LanguageCandidate {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['gloss', 'id', 'kind', 'value'])
  ) {
    throw new BrokerValidationError('Each candidate has an invalid shape.');
  }

  const id = requireBoundedString(value.id, 'candidate.id', 64);
  if (!CANDIDATE_ID_PATTERN.test(id)) {
    throw new BrokerValidationError('candidate.id has an invalid format.');
  }

  if (!isOneOf(value.kind, CANDIDATE_KINDS)) {
    throw new BrokerValidationError('candidate.kind is invalid.');
  }

  return {
    gloss: requireBoundedString(
      value.gloss,
      'candidate.gloss',
      MAX_GLOSS_LENGTH,
    ),
    id,
    kind: value.kind,
    value: requireBoundedString(
      value.value,
      'candidate.value',
      MAX_CANDIDATE_VALUE_LENGTH,
    ),
  };
}

export function parseBrokerRequest(value: unknown): BrokerRequest {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['candidates', 'level', 'sentence', 'word'])
  ) {
    throw new BrokerValidationError('The request has an invalid shape.');
  }

  if (value.level !== 'B2') {
    throw new BrokerValidationError('LinguaRead currently supports B2 only.');
  }

  if (
    !Array.isArray(value.candidates) ||
    value.candidates.length === 0 ||
    value.candidates.length > MAX_CANDIDATES
  ) {
    throw new BrokerValidationError(
      `Provide between 1 and ${MAX_CANDIDATES} candidates.`,
    );
  }

  const candidates = value.candidates.map(parseCandidate);
  const ids = new Set(candidates.map((candidate) => candidate.id));
  if (ids.size !== candidates.length) {
    throw new BrokerValidationError('Candidate IDs must be unique.');
  }

  return {
    candidates,
    level: 'B2',
    sentence: requireBoundedString(
      value.sentence,
      'sentence',
      MAX_SENTENCE_LENGTH,
    ),
    word: requireBoundedString(value.word, 'word', MAX_WORD_LENGTH),
  };
}

export function parseBrokerResult(
  value: unknown,
  candidates: readonly LanguageCandidate[],
): BrokerResult {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'candidateId',
      'confidence',
      'decision',
      'reason',
      'tokenType',
    ])
  ) {
    throw new BrokerValidationError('The provider result has an invalid shape.');
  }

  if (!isOneOf(value.decision, DECISIONS)) {
    throw new BrokerValidationError('The provider decision is invalid.');
  }

  if (!isOneOf(value.tokenType, TOKEN_TYPES)) {
    throw new BrokerValidationError('The provider token type is invalid.');
  }

  if (
    typeof value.confidence !== 'number' ||
    !Number.isFinite(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 1
  ) {
    throw new BrokerValidationError(
      'The provider confidence score is invalid.',
    );
  }

  const candidateId =
    value.candidateId === null
      ? null
      : requireBoundedString(value.candidateId, 'candidateId', 64);

  if (value.decision === 'use_candidate') {
    if (
      candidateId === null ||
      !candidates.some((candidate) => candidate.id === candidateId)
    ) {
      throw new BrokerValidationError(
        'The provider selected an unavailable candidate.',
      );
    }
  } else if (candidateId !== null) {
    throw new BrokerValidationError(
      'A non-candidate decision cannot include a candidate ID.',
    );
  }

  return {
    candidateId,
    confidence: value.confidence,
    decision: value.decision,
    reason: requireBoundedString(value.reason, 'reason', 160),
    tokenType: value.tokenType,
  };
}
