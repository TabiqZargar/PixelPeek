import type { ElementInfo, ElementSnapshot, MotionSnapshot } from '../src/shared/types';

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

export function makeMotionSnapshot(overrides: Partial<MotionSnapshot> = {}): MotionSnapshot {
  const target = { tag: 'button', id: 'cta', classes: ['primary', 'large'], depth: 1 };
  return {
    summary: {
      animationCount: 1,
      cssAnimationCount: 1,
      transitionCount: 1,
      waapiCount: 0,
      runningCount: 1,
      keyframeSetCount: 1,
      reducedMotion: false,
      animatedProperties: ['opacity', 'transform'],
    },
    animations: [
      {
        id: 'a1',
        source: 'css-animation',
        name: 'pulse',
        target,
        timing: {
          duration: 1200,
          delay: 0,
          iterations: null,
          infinite: true,
          direction: 'normal',
          fill: 'none',
          easing: 'ease-in-out',
          playState: 'running',
          currentTime: 300,
          playbackRate: 1,
        },
        keyframes: [
          {
            offset: 0,
            properties: [{ name: 'opacity', value: '1' }],
            easing: null,
            source: 'computed',
          },
          {
            offset: 1,
            properties: [{ name: 'opacity', value: '0.5' }],
            easing: null,
            source: 'computed',
          },
        ],
        replayable: true,
      },
    ],
    transitions: [
      {
        id: 'declared-1',
        kind: 'declared',
        target,
        property: 'transform',
        duration: 200,
        delay: 0,
        easing: 'ease',
        raw: 'transform 200ms ease',
        before: null,
        after: null,
        elapsedTime: null,
      },
    ],
    keyframes: [
      {
        name: 'pulse',
        referenced: true,
        keyframes: [
          {
            offset: 0,
            properties: [{ name: 'opacity', value: '1' }],
            easing: null,
            source: 'declared',
          },
          {
            offset: 1,
            properties: [{ name: 'opacity', value: '0.5' }],
            easing: null,
            source: 'declared',
          },
        ],
      },
    ],
    easings: [
      { value: 'ease-in-out', kind: 'keyword', points: [0.42, 0, 0.58, 1], visualizable: true },
      { value: 'ease', kind: 'keyword', points: [0.25, 0.1, 0.25, 1], visualizable: true },
    ],
    declaredAnimation: 'pulse 1200ms ease-in-out infinite',
    declaredTransition: 'transform 200ms ease',
    interaction: { hover: false, focus: false, active: false },
    stylesheetAccess: { readable: 1, inaccessible: 0 },
    replay: { isolatedActiveId: null, liveRestorableIds: [] },
    limitations: [],
    capturedAt: '2026-01-01T00:00:00.000Z',
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
    motion: makeMotionSnapshot(),
    limitations: ['computed values only'],
    capturedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
