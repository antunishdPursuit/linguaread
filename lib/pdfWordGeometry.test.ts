import { describe, expect, it } from 'vitest';
import {
  buildPdfWordSpatialIndex,
  extractSentenceContext,
  findPdfWordTargetAtPoint,
  positionFloatingCard,
  tokenizeEnglishWords,
  toPageRelativeRectangle,
} from './pdfWordGeometry';
import {
  forgetPdfWordHighlight,
  rememberPdfWordHighlight,
  shouldHighlightPdfWord,
} from './pdfWordHighlights';

describe('PDF word geometry tokenization', () => {
  it('finds separate words without changing their source offsets', () => {
    expect(tokenizeEnglishWords('world championship')).toEqual([
      { end: 5, start: 0, word: 'world' },
      { end: 18, start: 6, word: 'championship' },
    ]);
  });

  it('keeps apostrophes and hyphens inside one English word', () => {
    expect(tokenizeEnglishWords("student's context-aware aid")).toEqual([
      { end: 9, start: 0, word: "student's" },
      { end: 23, start: 10, word: 'context-aware' },
      { end: 27, start: 24, word: 'aid' },
    ]);
  });

  it('ignores numbers and punctuation-only content', () => {
    expect(tokenizeEnglishWords('2025 -- B2')).toEqual([
      { end: 9, start: 8, word: 'B' },
    ]);
  });

  it('extracts only the sentence that contains the selected word', () => {
    const text =
      'The first sentence ends here. Ferrari attributed its growth to planning. A final sentence follows.';

    expect(extractSentenceContext(text, text.indexOf('attributed'))).toBe(
      'Ferrari attributed its growth to planning.',
    );

    const noisyPdfText =
      "25-237 May 11, 2025 Ferrari in 2025 Balancing Tradition Donald Sull Cameron Davis Born of Enzo Ferrari's passion for car racing in the early decades of the Twentieth Century, the company became famous worldwide.";
    expect(
      extractSentenceContext(
        noisyPdfText,
        noisyPdfText.indexOf('passion'),
        180,
      ),
    ).toBe(
      "Born of Enzo Ferrari's passion for car racing in the early decades of the Twentieth Century, the company became famous worldwide.",
    );
  });

  it('converts browser rectangles to page-relative word geometry', () => {
    expect(
      toPageRelativeRectangle(
        { height: 18, left: 245, top: 330, width: 92 },
        { height: 900, left: 200, top: 250, width: 700 },
      ),
    ).toEqual({ height: 18, left: 45, top: 80, width: 92 });
  });

  it('keeps a floating card inside a viewport that becomes narrower', () => {
    expect(
      positionFloatingCard(
        { height: 20, left: 620, top: 300, width: 50 },
        { height: 260, width: 340 },
        { height: 800, width: 700 },
      ),
    ).toEqual({ left: 268, top: 288 });
  });

  it('keeps a floating card vertically attached in a narrow viewport', () => {
    expect(
      positionFloatingCard(
        { height: 20, left: 300, top: 420, width: 70 },
        { height: 260, width: 340 },
        { height: 800, width: 600 },
      ),
    ).toEqual({ left: 16, top: 408 });
  });

  it('finds the smallest word in the nearby spatial row', () => {
    const largerTarget = {
      context: 'The world championship began.',
      id: '1-0-0',
      rectangles: [{ height: 20, left: 10, top: 40, width: 100 }],
      word: 'world',
    };
    const smallerTarget = {
      context: 'The world championship began.',
      id: '1-0-6',
      rectangles: [{ height: 20, left: 45, top: 40, width: 30 }],
      word: 'championship',
    };
    const index = buildPdfWordSpatialIndex([largerTarget, smallerTarget]);

    expect(findPdfWordTargetAtPoint(index, 50, 50)).toEqual(smallerTarget);
    expect(findPdfWordTargetAtPoint(index, 200, 50)).toBeNull();
  });

  it('keeps only successful exact occurrences in one PDF highlight trail', () => {
    let trail = new Set<string>();

    expect(shouldHighlightPdfWord(trail, '1-0-0', '1-0-0')).toBe(true);
    expect(shouldHighlightPdfWord(trail, '1-0-6')).toBe(false);

    trail = rememberPdfWordHighlight(trail, '1-0-0');
    expect(shouldHighlightPdfWord(trail, '1-0-0')).toBe(true);
    expect(shouldHighlightPdfWord(trail, '2-0-0')).toBe(false);

    trail = rememberPdfWordHighlight(trail, '2-0-0');
    expect([...trail]).toEqual(['1-0-0', '2-0-0']);

    trail = forgetPdfWordHighlight(trail, '1-0-0');
    expect(shouldHighlightPdfWord(trail, '1-0-0')).toBe(false);
    expect(shouldHighlightPdfWord(trail, '2-0-0')).toBe(true);

    trail = new Set();
    expect(shouldHighlightPdfWord(trail, '1-0-0')).toBe(false);
    expect(shouldHighlightPdfWord(trail, '2-0-0')).toBe(false);
  });
});
