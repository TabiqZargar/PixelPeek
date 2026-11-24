import { describe, expect, it } from 'vitest';
import { findColorTokens, formatColor, parseColor } from '../src/content/color';

describe('colour parsing', () => {
  it('parses hex, rgb, rgba and transparent values', () => {
    expect(parseColor('#fff')?.hex).toBe('#ffffff');
    expect(parseColor('#8b6dff80')?.alpha).toBeCloseTo(128 / 255, 2);
    expect(parseColor('rgb(255, 0, 0)')?.hex).toBe('#ff0000');
    expect(parseColor('rgba(0, 0, 0, 0.5)')?.rgb).toBe('rgba(0, 0, 0, 0.5)');
    expect(parseColor('rgb(255 0 0 / 50%)')?.alpha).toBe(0.5);
    expect(parseColor('transparent')?.hex).toBe('#00000000');
  });

  it('converts hsl and formats the requested output', () => {
    const parsed = parseColor('hsl(0, 100%, 50%)');
    expect(parsed?.hex).toBe('#ff0000');
    expect(formatColor(parsed!, 'rgb')).toBe('rgb(255, 0, 0)');
    expect(formatColor(parsed!, 'hsl')).toMatch(/^hsl\(0, 100%, 50%\)$/);
  });

  it('keeps modern colour functions verbatim instead of inventing a conversion', () => {
    const parsed = parseColor('oklch(0.7 0.1 240)');
    expect(parsed?.supported).toBe(false);
    expect(parsed?.hex).toBeNull();
    expect(formatColor(parsed!, 'hex')).toBeNull();
  });

  it('finds multiple colour tokens in a shadow value', () => {
    expect(findColorTokens('rgba(0,0,0,0.2) 0 1px, #fff 0 2px')).toEqual([
      'rgba(0,0,0,0.2)',
      '#fff',
    ]);
  });
});
