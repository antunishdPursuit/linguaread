import { describe, expect, it } from 'vitest';
import {
  buildPdfWordSpatialIndex,
  findPdfWordTargetAtPoint,
  tokenizeEnglishWords,
  toPageRelativeRectangle,
} from './pdfWordGeometry';

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

  it('converts browser rectangles to page-relative word geometry', () => {
    expect(
      toPageRelativeRectangle(
        { height: 18, left: 245, top: 330, width: 92 },
        { height: 900, left: 200, top: 250, width: 700 },
      ),
    ).toEqual({ height: 18, left: 45, top: 80, width: 92 });
  });

  it('finds the smallest word in the nearby spatial row', () => {
    const largerTarget = {
      id: '1-0-0',
      rectangles: [{ height: 20, left: 10, top: 40, width: 100 }],
      word: 'world',
    };
    const smallerTarget = {
      id: '1-0-6',
      rectangles: [{ height: 20, left: 45, top: 40, width: 30 }],
      word: 'championship',
    };
    const index = buildPdfWordSpatialIndex([largerTarget, smallerTarget]);

    expect(findPdfWordTargetAtPoint(index, 50, 50)).toEqual(smallerTarget);
    expect(findPdfWordTargetAtPoint(index, 200, 50)).toBeNull();
  });
});
