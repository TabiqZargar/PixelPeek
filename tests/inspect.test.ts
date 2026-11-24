import { describe, expect, it } from 'vitest';
import { extractElementInfo, type InspectDeps } from '../src/content/inspect';

function deps(values: Record<string, string>, rect: DOMRect): InspectDeps {
  return {
    computedStyle: () => values as unknown as CSSStyleDeclaration,
    boundingRect: () => rect,
  };
}

function rect(width: number, height: number): DOMRect {
  return { width, height } as DOMRect;
}

describe('extractElementInfo', () => {
  it('reads identity, classes and computed styles without reading content', () => {
    document.body.innerHTML =
      '<input id="email" class="field hover:bg-violet-500" type="password" value="hunter2" placeholder="secret label" />';
    const element = document.querySelector('input')!;

    const info = extractElementInfo(
      element,
      deps(
        {
          backgroundColor: ' rgb(20, 18, 28) ',
          color: '#ededf2',
          fontFamily: 'Inter, sans-serif',
          fontSize: '13px',
          fontWeight: '600',
          padding: '8px 12px',
          margin: '0px',
          borderRadius: '6px',
          boxShadow: '0 1px 2px rgba(0,0,0,.4)',
          display: 'block',
          position: 'relative',
        },
        rect(240.44, 36.12),
      ),
      () => '2026-01-01T00:00:00.000Z',
    );

    expect(info.tag).toBe('input');
    expect(info.id).toBe('email');
    expect(info.classes).toEqual(['field', 'hover:bg-violet-500']);
    expect(info.dimensions).toEqual({ width: 240.4, height: 36.1 });
    expect(info.backgroundColor).toBe('rgb(20, 18, 28)');
    expect(info.fontWeight).toBe('600');
    expect(info.padding).toBe('8px 12px');
    expect(info.position).toBe('relative');

    const serialized = JSON.stringify(info);
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('secret label');
    expect(serialized).not.toContain('placeholder');
  });

  it('normalizes empty, normal and none values to null', () => {
    document.body.innerHTML = '<div></div>';
    const info = extractElementInfo(
      document.querySelector('div')!,
      deps(
        {
          backgroundColor: 'rgba(0, 0, 0, 0)',
          color: 'normal',
          fontFamily: 'none',
          fontSize: '',
          padding: '   ',
        },
        rect(-10, 0),
      ),
      () => 'fixed',
    );

    expect(info.dimensions).toEqual({ width: 0, height: 0 });
    expect(info.color).toBeNull();
    expect(info.fontFamily).toBeNull();
    expect(info.fontSize).toBeNull();
    expect(info.padding).toBeNull();
  });

  it('caps the class list so stylesheets cannot bloat the message', () => {
    document.body.innerHTML = `<div class="${Array.from({ length: 40 }, (_, i) => `c${i}`).join(' ')}"></div>`;
    const info = extractElementInfo(
      document.querySelector('div')!,
      deps({}, rect(1, 1)),
      () => 'fixed',
    );
    expect(info.classes).toHaveLength(12);
  });
});
