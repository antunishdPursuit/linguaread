export type PdfWordHighlightTrail = ReadonlySet<string>;

export function rememberPdfWordHighlight(
  trail: PdfWordHighlightTrail,
  targetId: string,
): Set<string> {
  return new Set([...trail, targetId]);
}

export function shouldHighlightPdfWord(
  trail: PdfWordHighlightTrail,
  targetId: string,
  activeTargetId?: string,
): boolean {
  return targetId === activeTargetId || trail.has(targetId);
}
