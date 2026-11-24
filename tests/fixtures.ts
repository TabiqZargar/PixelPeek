import type { ElementInfo, ElementSnapshot } from '../src/shared/types';

export function makeElementInfo(overrides: Partial<ElementInfo> = {}): ElementInfo {
  return {
    tag: 'button',
    id: 'cta',
    classes: ['primary', 'large'],
    dimensions: { width: 120, height: 40 },
    backgroundColor: 'rgb(139, 109, 255)',
    color: 'rgb(255, 255, 255)',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
    padding: '8px 12px',
    margin: '0px',
    borderRadius: '6px',
    boxShadow: 'rgba(0, 0, 0, 0.2) 0px 2px 4px',
    display: 'flex',
    position: 'relative',
    capturedAt: '2026-01-01T00:00:00.000Z',
    sourceUrl: 'https://example.com/',
    ...overrides,
  };
}

export function makeSnapshot(overrides: Partial<ElementSnapshot> = {}): ElementSnapshot {
  return {
    element: makeElementInfo(),
    boxModel: {
      boxSizing: 'border-box',
      computedWidth: '120px',
      computedHeight: '40px',
      measured: { width: 120, height: 40 },
      contentWidth: 120,
      contentHeight: 40,
      estimatedOuter: { width: 120, height: 40 },
      margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
      border: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
      padding: { top: '8px', right: '12px', bottom: '8px', left: '12px' },
      notes: [],
    },
    properties: [
      { name: 'display', value: 'flex', category: 'Layout' },
      { name: 'gap', value: '8px', category: 'Flexbox & Grid' },
      { name: 'background-color', value: 'rgb(139, 109, 255)', category: 'Background' },
      { name: 'box-shadow', value: 'rgba(0, 0, 0, 0.2) 0px 2px 4px', category: 'Shadows & Effects' },
    ],
    typography: {
      fontFamily: { value: 'Inter, sans-serif', matchesParent: false },
      fontSize: { value: '14px', matchesParent: false },
      fontWeight: { value: '600', matchesParent: true },
      fontStyle: { value: 'normal', matchesParent: true },
      lineHeight: { value: '20px', matchesParent: false },
      letterSpacing: { value: 'normal', matchesParent: true },
      wordSpacing: { value: 'normal', matchesParent: true },
      textAlign: { value: 'start', matchesParent: true },
      textTransform: { value: 'none', matchesParent: true },
      textDecoration: { value: 'none solid rgb(255, 255, 255)', matchesParent: false },
      color: { value: 'rgb(255, 255, 255)', matchesParent: false },
      whiteSpace: { value: 'normal', matchesParent: true },
    },
    colors: [
      {
        property: 'background-color',
        raw: 'rgb(139, 109, 255)',
        parsed: {
          original: 'rgb(139, 109, 255)',
          hex: '#8b6dff',
          rgb: 'rgb(139, 109, 255)',
          hsl: 'hsl(251, 100%, 68%)',
          alpha: 1,
          supported: true,
        },
      },
    ],
    gradients: [],
    hierarchy: {
      parent: { tag: 'main', id: null, classes: ['page'], depth: 0 },
      children: [{ tag: 'span', id: null, classes: [], depth: 2 }],
      previousSibling: null,
      nextSibling: { tag: 'a', id: 'link', classes: [], depth: 1 },
    },
    limitations: ['computed values only'],
    capturedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
