import { describe, expect, it } from 'vitest';
import { computeBoxModel, parseLength } from '../src/content/box-model';

function reader(values: Record<string, string>) {
  return (property: string) => values[property] ?? '';
}

const base = {
  'box-sizing': 'border-box',
  width: '200px',
  height: '80px',
  'margin-top': '0px',
  'margin-right': 'auto',
  'margin-bottom': '0px',
  'margin-left': 'auto',
  'border-top-width': '1px',
  'border-right-width': '1px',
  'border-bottom-width': '1px',
  'border-left-width': '1px',
  'padding-top': '8px',
  'padding-right': '12px',
  'padding-bottom': '8px',
  'padding-left': '12px',
};

describe('box model', () => {
  it('parses pixel lengths and rejects non-pixel values', () => {
    expect(parseLength('12.5px')).toBe(12.5);
    expect(parseLength('-4px')).toBe(-4);
    expect(parseLength('auto')).toBeNull();
    expect(parseLength('calc(100% - 2px)')).toBeNull();
  });

  it('combines per-side padding and border into an estimated outer size', () => {
    const model = computeBoxModel(reader(base), { width: 226, height: 98 }, 'block');
    expect(model.contentWidth).toBe(200);
    expect(model.contentHeight).toBe(80);
    expect(model.estimatedOuter).toEqual({ width: 226, height: 98 });
    expect(model.padding.right).toBe('12px');
    expect(model.margin.right).toBe('auto');
  });

  it('notes inline layout, missing lengths and measurement mismatches', () => {
    const model = computeBoxModel(
      reader({ ...base, width: 'auto', 'padding-left': 'calc(1rem)' }),
      { width: 300, height: 100 },
      'inline-block',
    );
    expect(model.contentWidth).toBeNull();
    expect(model.estimatedOuter).toBeNull();
    expect(model.notes.join(' ')).toMatch(/Inline layout/);
    expect(model.notes.join(' ')).toMatch(/not a pixel length/);
  });
});
