export type PdfDataSource = {
  data: Uint8Array;
};

export async function readPdfBytes(
  sourceUrl: string,
  fetchPdf: typeof fetch = fetch,
): Promise<PdfDataSource> {
  const response = await fetchPdf(sourceUrl);

  // Local file responses can report status 0 even when Chrome returned bytes.
  if (!response.ok && response.status !== 0) {
    throw new Error(`PDF request failed with status ${response.status}.`);
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0) {
    throw new Error('The PDF file was empty.');
  }

  return { data: new Uint8Array(buffer) };
}
