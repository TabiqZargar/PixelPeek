import { describe, expect, it } from 'vitest';
import { extractGradients } from '../src/content/gradient';

describe('gradient parsing', () => {
  it('ignores empty or non-gradient backgrounds', () => {
    expect(extractGradients(null)).toEqual([]);
    expect(extractGradients('none')).toEqual([]);
    expect(extractGradients('url(bg.png)')).toEqual([]);
  });

  it('parses direction and stops in a multi-stop linear gradient', () => {
    const [gradient] = extractGradients(
      'linear-gradient(to right, rgb(255, 0, 0) 0%, rgba(0, 0, 255, 0.5) 100%)',
    );
    expect(gradient?.kind).toBe('linear');
    expect(gradient?.direction).toBe('to right');
    expect(gradient?.stops).toEqual([
      { color: 'rgb(255, 0, 0)', position: '0%' },
      { color: 'rgba(0, 0, 255, 0.5)', position: '100%' },
    ]);
  });

  it('splits multiple gradient layers without breaking on inner commas', () => {
    const gradients = extractGradients(
      'linear-gradient(#fff, #000), radial-gradient(at center, red 10%, blue 90%)',
    );
    expect(gradients).toHaveLength(2);
    expect(gradients[0]?.kind).toBe('linear');
    expect(gradients[1]?.kind).toBe('radial');
    expect(gradients[1]?.direction).toBe('at center');
  });
});
