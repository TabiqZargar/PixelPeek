import { describe, expect, it } from 'vitest';
import { buildSelector, cssEscape, sanitizeCssValue, serializeCss, serializeSnapshotCss, suggestSelectors } from '../src/content/css';
import type { ElementInfo } from '../src/shared/types';
import { makeSnapshot } from './fixtures';

const info: ElementInfo = {
  tag: 'div',
  id: '',
  classes: ['card', 'hover:bg-violet-500'],
  dimensions: { width: 320.5, height: 88 },
  backgroundColor: 'rgb(20, 18, 28)',
  color: '#ededf2',
  fontFamily: 'Inter, sans-serif',
  fontSize: '13px',
  fontWeight: '600',
  padding: '8px 12px',
  margin: '0px',
  borderRadius: '6px',
  boxShadow: '0 1px 2px rgba(0,0,0,.4)',
  display: 'flex',
  position: 'relative',
  capturedAt: 'fixed',
  sourceUrl: 'https://example.com/',
};

describe('cssEscape', () => {
  it('leaves simple identifiers alone', () => {
    expect(cssEscape('card-body_2')).toBe('card-body_2');
  });

  it('escapes Tailwind-style and numeric identifiers', () => {
    expect(cssEscape('hover:bg-violet-500')).not.toContain('hover:bg');
    expect(cssEscape('2xl')).toMatch(/^\\/);
  });
});

describe('buildSelector', () => {
  it('prefers an id when present', () => {
    expect(buildSelector({ ...info, id: 'hero' })).toBe('#hero');
  });

  it('uses the tag plus a bounded, escaped class list otherwise', () => {
    const selector = buildSelector(info);
    expect(selector.startsWith('div.card.')).toBe(true);
    expect(selector).not.toContain('hover:bg');
    expect(selector).toContain('\\');
  });

  it('falls back safely for unknown tags', () => {
    expect(buildSelector({ tag: '', id: '', classes: [] })).toBe('*');
  });
});

describe('sanitizeCssValue', () => {
  it('strips important and trims whitespace', () => {
    expect(sanitizeCssValue(' 12px !important ')).toBe('12px');
  });

  it('rejects declaration, url and expression injection', () => {
    expect(sanitizeCssValue('red; } body { display: none')).toBeNull();
    expect(sanitizeCssValue('url(https://tracker.example/x.png)')).toBeNull();
    expect(sanitizeCssValue('expression(alert(1))')).toBeNull();
    expect(sanitizeCssValue('<script>alert(1)</script>')).toBeNull();
    expect(sanitizeCssValue('javascript:alert(1)')).toBeNull();
    expect(sanitizeCssValue('x'.repeat(400))).toBeNull();
  });
});

describe('serializeCss', () => {
  it('emits only allowlisted, sanitized declarations', () => {
    const output = serializeCss(info);
    expect(output).toContain('width: 320.5px;');
    expect(output).toContain('background-color: rgb(20, 18, 28);');
    expect(output).toContain('box-shadow: 0 1px 2px rgba(0,0,0,.4);');
    expect(output).not.toContain('capturedAt');
    expect(output).not.toContain('sourceUrl');
  });

  it('cannot break out of the rule even with hostile input', () => {
    const output = serializeCss({
      ...info,
      id: 'a; } body { color: red; /*',
      color: 'red; } html { display: none',
      fontFamily: 'url(https://example.com/track)',
    });
    expect(output).not.toContain('display: none');
    expect(output).not.toMatch(/color: red; \}/);
    expect(output).toContain('\\');
  });
});

describe('Phase 2 CSS export', () => {
  it('suggests bounded, escaped selectors', () => {
    const selectors = suggestSelectors(makeSnapshot());
    expect(selectors[0]).toBe('#cta');
    expect(selectors).toContain('button.primary.large');
    expect(selectors.length).toBeLessThanOrEqual(4);
  });

  it('serializes snapshot values without leaking metadata or unsafe values', () => {
    const css = serializeSnapshotCss(
      makeSnapshot({
        properties: [
          { name: 'background-color', value: 'url(https://tracker.example/x)', category: 'Background' },
          { name: 'box-shadow', value: 'red; } body { display: none', category: 'Shadows & Effects' },
        ],
      }),
    );
    expect(css).toContain('font-size: 14px;');
    expect(css).toContain('margin: 0;');
    expect(css).not.toContain('url(');
    expect(css).not.toContain('display: none');
    expect(css).not.toContain('sourceUrl');
    expect(css).not.toContain('capturedAt');
  });
});
