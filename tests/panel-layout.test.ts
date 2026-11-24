import { describe, expect, it } from 'vitest';
import { getPanelLayout, getPanelMetrics } from '../src/panel/hooks/usePanelWidth';

describe('panel layout breakpoints', () => {
  it.each([
    [280, 'compact', 132, 12],
    [320, 'compact', 132, 12],
    [360, 'compact', 132, 12],
    [379, 'compact', 132, 12],
    [380, 'regular', 164, 16],
    [400, 'regular', 164, 16],
    [479, 'regular', 164, 16],
    [480, 'wide', 192, 20],
    [640, 'wide', 192, 20],
  ])('selects a usable shell at %ipx', (width, layout, sidebarWidth, contentPadding) => {
    expect(getPanelLayout(width)).toBe(layout);
    expect(getPanelMetrics(width)).toEqual({
      layout,
      sidebarWidth,
      contentPadding,
    });
  });

  it('falls back to compact for unusable widths', () => {
    expect(getPanelLayout(Number.NaN)).toBe('compact');
    expect(getPanelLayout(0)).toBe('compact');
    expect(getPanelLayout(-200)).toBe('compact');
  });
});
