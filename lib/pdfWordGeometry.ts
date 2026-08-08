export type WordToken = {
  end: number;
  start: number;
  word: string;
};

export type WordHitRectangle = {
  height: number;
  left: number;
  top: number;
  width: number;
};

type RectangleLike = {
  height: number;
  left: number;
  top: number;
  width: number;
};

type SizeLike = {
  height: number;
  width: number;
};

export type PdfWordTarget = {
  context: string;
  id: string;
  rectangles: WordHitRectangle[];
  selection?: {
    end: number;
    node: Text;
    start: number;
  };
  word: string;
};

export type PdfWordSpatialIndex = {
  rowHeight: number;
  rows: Map<number, PdfWordTarget[]>;
};

const DEFAULT_SPATIAL_ROW_HEIGHT = 32;
const DEFAULT_CONTEXT_MAX_LENGTH = 240;
const CONTEXT_WORDS_BEFORE_TARGET = 4;
const WORD_PATTERN = /[A-Za-z]+(?:['\u2019-][A-Za-z]+)*/g;
const SENTENCE_END_PATTERN = /[.!?]/;

function normalizeContext(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function truncateContext(value: string, maximumLength: number): string {
  if (value.length <= maximumLength) return value;
  const clipped = value.slice(0, maximumLength + 1);
  const lastSpace = clipped.lastIndexOf(' ');
  const end = lastSpace > 0 ? lastSpace : maximumLength;
  return `${clipped.slice(0, end).trim().replace(/[,;:\u2013\u2014-]+$/, '')}…`;
}

export function tokenizeEnglishWords(value: string): WordToken[] {
  return Array.from(value.matchAll(WORD_PATTERN), (match) => ({
    end: match.index + match[0].length,
    start: match.index,
    word: match[0],
  }));
}

export function extractSentenceContext(
  pageText: string,
  wordStart: number,
  maximumLength = DEFAULT_CONTEXT_MAX_LENGTH,
): string {
  const safeStart = Math.max(0, Math.min(wordStart, pageText.length));
  let sentenceStart = safeStart;
  let sentenceEnd = safeStart;

  while (
    sentenceStart > 0 &&
    !SENTENCE_END_PATTERN.test(pageText[sentenceStart - 1])
  ) {
    sentenceStart -= 1;
  }
  while (
    sentenceEnd < pageText.length &&
    !SENTENCE_END_PATTERN.test(pageText[sentenceEnd])
  ) {
    sentenceEnd += 1;
  }
  if (sentenceEnd < pageText.length) sentenceEnd += 1;

  const sentence = normalizeContext(pageText.slice(sentenceStart, sentenceEnd));
  if (sentence.length <= maximumLength) return sentence;

  // Some PDFs expose headings and bylines as one unpunctuated text stream.
  // Keep a small lead-in before the selected word so that metadata cannot take
  // over the contextual example or push the selected word out of the result.
  const prefix = normalizeContext(pageText.slice(sentenceStart, safeStart));
  const focusedPrefix = prefix
    .split(' ')
    .slice(-CONTEXT_WORDS_BEFORE_TARGET)
    .join(' ');
  const suffix = normalizeContext(pageText.slice(safeStart, sentenceEnd));
  return truncateContext(
    normalizeContext(`${focusedPrefix} ${suffix}`),
    maximumLength,
  );
}

function usableRectangle(rectangle: DOMRect): boolean {
  return rectangle.width > 0.5 && rectangle.height > 0.5;
}

export function toPageRelativeRectangle(
  rectangle: RectangleLike,
  pageRectangle: RectangleLike,
): WordHitRectangle {
  return {
    height: rectangle.height,
    left: rectangle.left - pageRectangle.left,
    top: rectangle.top - pageRectangle.top,
    width: rectangle.width,
  };
}

export function positionFloatingCard(
  anchor: RectangleLike,
  card: SizeLike,
  viewport: SizeLike,
  gap = 12,
  padding = 16,
): { left: number; top: number } {
  const rightOfAnchor = anchor.left + anchor.width + gap;
  const leftOfAnchor = anchor.left - card.width - gap;
  const preferredLeft =
    rightOfAnchor + card.width <= viewport.width - padding
      ? rightOfAnchor
      : leftOfAnchor;
  const maximumLeft = Math.max(padding, viewport.width - card.width - padding);
  const maximumTop = Math.max(padding, viewport.height - card.height - padding);

  return {
    left: Math.max(padding, Math.min(preferredLeft, maximumLeft)),
    top: Math.max(padding, Math.min(anchor.top - gap, maximumTop)),
  };
}

export function buildPdfWordSpatialIndex(
  targets: PdfWordTarget[],
  rowHeight = DEFAULT_SPATIAL_ROW_HEIGHT,
): PdfWordSpatialIndex {
  const rows = new Map<number, PdfWordTarget[]>();

  for (const target of targets) {
    const targetRows = new Set<number>();

    for (const rectangle of target.rectangles) {
      const firstRow = Math.floor(rectangle.top / rowHeight);
      const lastRow = Math.floor(
        (rectangle.top + rectangle.height) / rowHeight,
      );

      for (let row = firstRow; row <= lastRow; row += 1) {
        targetRows.add(row);
      }
    }

    for (const row of targetRows) {
      const rowTargets = rows.get(row) ?? [];
      rowTargets.push(target);
      rows.set(row, rowTargets);
    }
  }

  return { rowHeight, rows };
}

export function findPdfWordTargetAtPoint(
  index: PdfWordSpatialIndex,
  x: number,
  y: number,
): PdfWordTarget | null {
  const row = Math.floor(y / index.rowHeight);
  const candidates = index.rows.get(row) ?? [];
  let bestTarget: PdfWordTarget | null = null;
  let bestArea = Number.POSITIVE_INFINITY;

  // Only the nearby text row is checked. This keeps pointer movement cheap on
  // long PDFs while still selecting the smallest overlapping word rectangle.
  for (const target of candidates) {
    const containsPoint = target.rectangles.some(
      (rectangle) =>
        x >= rectangle.left &&
        x <= rectangle.left + rectangle.width &&
        y >= rectangle.top &&
        y <= rectangle.top + rectangle.height,
    );
    if (!containsPoint) continue;

    const area = target.rectangles.reduce(
      (total, rectangle) => total + rectangle.width * rectangle.height,
      0,
    );
    if (area < bestArea) {
      bestArea = area;
      bestTarget = target;
    }
  }

  return bestTarget;
}

export function measureTextLayerWords(
  pageElement: HTMLElement,
  pageNumber: number,
): PdfWordTarget[] {
  const textLayer = pageElement.querySelector<HTMLElement>('.textLayer');
  if (!textLayer) return [];

  const pageRectangle = pageElement.getBoundingClientRect();
  const targets: PdfWordTarget[] = [];
  const walker = document.createTreeWalker(
    textLayer,
    NodeFilter.SHOW_TEXT,
  );
  const textNodes: Text[] = [];
  let currentNode = walker.nextNode();

  while (currentNode) {
    textNodes.push(currentNode as Text);
    currentNode = walker.nextNode();
  }

  const nodeOffsets = new Map<Text, number>();
  let pageText = '';
  for (const textNode of textNodes) {
    if (pageText !== '') pageText += ' ';
    nodeOffsets.set(textNode, pageText.length);
    pageText += textNode.data;
  }

  let textNodeIndex = 0;
  for (const textNode of textNodes) {
    const value = textNode.data;
    const nodeOffset = nodeOffsets.get(textNode) ?? 0;

    for (const token of tokenizeEnglishWords(value)) {
      const range = document.createRange();
      range.setStart(textNode, token.start);
      range.setEnd(textNode, token.end);

      const rectangles = Array.from(range.getClientRects())
        .filter(usableRectangle)
        .map((rectangle) =>
          toPageRelativeRectangle(rectangle, pageRectangle),
        );

      range.detach();
      if (!rectangles.length) continue;

      targets.push({
        context: extractSentenceContext(
          pageText,
          nodeOffset + token.start,
        ),
        id: `${pageNumber}-${textNodeIndex}-${token.start}`,
        rectangles,
        selection: {
          end: token.end,
          node: textNode,
          start: token.start,
        },
        word: token.word,
      });
    }

    textNodeIndex += 1;
  }

  return targets;
}
