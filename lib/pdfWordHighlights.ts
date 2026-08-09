import { createLanguageCacheKey } from './brokerLanguage';
import type { PdfWordTarget } from './pdfWordGeometry';

export type PdfWordHighlightTrail = ReadonlySet<string>;

export function restoreCachedPdfWordHighlights(
  trail: PdfWordHighlightTrail,
  targets: readonly PdfWordTarget[],
  cachedResultKeys: ReadonlySet<string>,
  hiddenTargetIds: ReadonlySet<string> = new Set(),
): Set<string> {
  const nextTrail = new Set(trail);

  for (const target of targets) {
    if (
      !hiddenTargetIds.has(target.id) &&
      cachedResultKeys.has(createLanguageCacheKey(target.word, target.context))
    ) {
      nextTrail.add(target.id);
    }
  }

  return nextTrail;
}

export function rememberPdfWordHighlight(
  trail: PdfWordHighlightTrail,
  targetId: string,
): Set<string> {
  return new Set([...trail, targetId]);
}

export function forgetPdfWordHighlight(
  trail: PdfWordHighlightTrail,
  targetId: string,
): Set<string> {
  const nextTrail = new Set(trail);
  nextTrail.delete(targetId);
  return nextTrail;
}

export function shouldHighlightPdfWord(
  trail: PdfWordHighlightTrail,
  targetId: string,
  activeTargetId?: string,
): boolean {
  return targetId === activeTargetId || trail.has(targetId);
}
