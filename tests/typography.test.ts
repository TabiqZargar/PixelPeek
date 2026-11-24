import { describe, expect, it } from 'vitest';
import { extractTypography } from '../src/content/typography';

function style(values: Record<string, string>) {
  return (name: string) => values[name] ?? '';
}

describe('typography extraction', () => {
  it('records values and flags those inherited from the parent', () => {
    const values = {
      'font-family': 'Inter, sans-serif',
      'font-size': '14px',
      'font-weight': '600',
      'font-style': 'normal',
      'line-height': '20px',
      'letter-spacing': 'normal',
      'word-spacing': 'normal',
      'text-align': 'start',
      'text-transform': 'none',
      'text-decoration': 'none solid rgb(255, 255, 255)',
      color: 'rgb(255, 255, 255)',
      'white-space': 'normal',
    };
    const result = extractTypography(style(values), style(values));
    expect(result.fontFamily.value).toBe('Inter, sans-serif');
    expect(result.fontFamily.matchesParent).toBe(true);
    expect(result.fontSize.matchesParent).toBe(true);
  });

  it('marks missing values as null and never claims a parent match', () => {
    const result = extractTypography(style({ 'font-size': '16px' }), null);
    expect(result.fontSize.value).toBe('16px');
    expect(result.fontSize.matchesParent).toBe(false);
    expect(result.fontFamily.value).toBeNull();
  });
});
