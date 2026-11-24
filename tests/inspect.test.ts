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

  it('captures layout, border and timing details only when they are meaningful', () => {
    document.body.innerHTML = '<div></div>';
    const info = extractElementInfo(
      document.querySelector('div')!,
      deps(
        {
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          gridTemplateColumns: 'repeat(3, 1fr)',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: 'rgb(35, 35, 43)',
          transition: 'background-color 180ms ease 0s',
          animation: 'pulse 2s infinite',
          lineHeight: '1.4',
        },
        rect(100, 40),
      ),
      () => 'fixed',
    );

    expect(info.flexDirection).toBe('row');
    expect(info.alignItems).toBe('center');
    expect(info.justifyContent).toBe('space-between');
    expect(info.gap).toBe('12px');
    expect(info.gridTemplateColumns).toBeNull();
    expect(info.borderColor).toBe('rgb(35, 35, 43)');
    expect(info.transition).toBe('background-color 180ms ease 0s');
    expect(info.animation).toBe('pulse 2s infinite');
    expect(info.lineHeight).toBe('1.4');
  });

  it('omits default layout, border and zero-duration timing values', () => {
    document.body.innerHTML = '<div></div>';
    const info = extractElementInfo(
      document.querySelector('div')!,
      deps(
        {
          display: 'block',
          flexDirection: 'row',
          borderWidth: '0px',
          borderStyle: 'none',
          borderColor: 'currentcolor',
          transition: 'all 0s ease 0s',
          animation: 'none 0s ease 0s 1 normal none running',
        },
        rect(100, 40),
      ),
      () => 'fixed',
    );

    expect(info.flexDirection).toBeNull();
    expect(info.gap).toBeNull();
    expect(info.borderWidth).toBeNull();
    expect(info.borderStyle).toBeNull();
    expect(info.borderColor).toBeNull();
    expect(info.transition).toBeNull();
    expect(info.animation).toBeNull();
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
