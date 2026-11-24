import { describe, expect, it } from 'vitest';
import { cssDeclaration, extractCssProperties } from '../src/content/css-properties';

describe('computed CSS properties', () => {
  it('reads known properties into their declared categories', () => {
    const values: Record<string, string> = {
      display: 'flex',
      'flex-direction': 'row',
      'font-size': '14px',
      'background-color': 'rgb(139, 109, 255)',
      'box-shadow': 'rgba(0, 0, 0, 0.2) 0px 2px 4px',
    };
    const properties = extractCssProperties((name) => values[name] ?? '');
    expect(properties.find((item) => item.name === 'display')?.category).toBe('Layout');
    expect(properties.find((item) => item.name === 'flex-direction')?.category).toBe('Flexbox & Grid');
    expect(properties.find((item) => item.name === 'font-size')?.category).toBe('Typography');
    expect(properties.find((item) => item.name === 'background-color')?.category).toBe('Background');
    expect(cssDeclaration(properties[0]!)).toBe('display: flex;');
  });

  it('omits empty values and truncates very long ones', () => {
    const properties = extractCssProperties((name) =>
      name === 'font-family' ? 'a'.repeat(400) : '',
    );
    expect(properties).toHaveLength(1);
    expect(properties[0]!.value).toHaveLength(240);
    expect(properties[0]!.value.endsWith('...')).toBe(true);
  });
});
