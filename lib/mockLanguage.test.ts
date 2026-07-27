import { describe, expect, it } from 'vitest';
import { escapeHtml, renderMockText } from './mockLanguage';

describe('mock language renderer', () => {
  it('escapes PDF text before adding mock markup', () => {
    expect(escapeHtml('<script>bad()</script>')).toBe(
      '&lt;script&gt;bad()&lt;/script&gt;',
    );
  });

  it('adds the Mandarin mock target to innovation', () => {
    const result = renderMockText('Tradition and innovation drive each other.');

    expect(result).toContain('data-linguaread-word="innovation"');
    expect(result).toContain('创新');
    expect(result).not.toContain('>innovation<');
  });

  it('leaves unrelated text unchanged', () => {
    expect(renderMockText('Ferrari builds cars.')).toBe('Ferrari builds cars.');
  });
});
