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
const WORD_PATTERN = /[A-Za-z]+(?:['\u2019-][A-Za-z]+)*/g;

export function tokenizeEnglishWords(value: string): WordToken[] {
  return Array.from(value.matchAll(WORD_PATTERN), (match) => ({
    end: match.index + match[0].length,
    start: match.index,
    word: match[0],
  }));
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
  let textNodeIndex = 0;
  let node = walker.nextNode();

  while (node) {
    const textNode = node as Text;
    const value = textNode.data;

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
    node = walker.nextNode();
  }

  return targets;
}
