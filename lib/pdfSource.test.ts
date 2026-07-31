import { describe, expect, it, vi } from 'vitest';
import { readPdfBytes } from './pdfSource';

describe('PDF source loading', () => {
  it('returns PDF bytes for a local response with status 0', async () => {
    const fetchPdf = vi.fn().mockResolvedValue({
      arrayBuffer: async () => new Uint8Array([37, 80, 68, 70]).buffer,
      ok: false,
      status: 0,
    });

    const source = await readPdfBytes(
      'file:///C:/Users/Dennis/Downloads/example.pdf',
      fetchPdf as typeof fetch,
    );

    expect([...source.data]).toEqual([37, 80, 68, 70]);
  });

  it('rejects an empty local PDF response', async () => {
    const fetchPdf = vi.fn().mockResolvedValue({
      arrayBuffer: async () => new ArrayBuffer(0),
      ok: true,
      status: 200,
    });

    await expect(
      readPdfBytes(
        'file:///C:/Users/Dennis/Downloads/example.pdf',
        fetchPdf as typeof fetch,
      ),
    ).rejects.toThrow('The PDF file was empty.');
  });
});
