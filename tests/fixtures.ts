import type {
  BlueprintEvidence,
  DesignSystemSnapshot,
  ElementInfo,
  ElementSnapshot,
  MotionSnapshot,
  WebsiteBlueprint,
} from '../src/shared/types';
import type { WebsiteBlueprintInput } from '../src/content/website-blueprint';

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

export function makeDesignSystemSnapshot(overrides: Partial<DesignSystemSnapshot> = {}): DesignSystemSnapshot {
  const colorValue = {
    value: 'rgb(139, 109, 255)',
    normalized: 'rgb(139 109 255)',
    count: 2,
    sourceProperties: ['background-color'],
  };
  return {
    requestId: 'ds-1',
    capturedAt: '2026-01-01T00:00:00.000Z',
    origin: 'https://example.com',
    summary: {
      elementsScanned: 24,
      elementsSkipped: 3,
      textElementsInspected: 8,
      stylesheetsReadable: 1,
      stylesheetsInaccessible: 0,
      tokensByCategory: { color: 1, typography: 0, spacing: 0, effect: 0, gradient: 0 },
    },
    detected: {
      palette: [
        colorValue,
        {
          value: 'rgb(255, 97, 97)',
          normalized: 'rgb(255 97 97)',
          count: 1,
          sourceProperties: ['color'],
        },
      ],
      typography: [
        {
          value: '14px',
          normalized: '14px',
          count: 8,
          sourceProperties: ['font-size'],
        },
      ],
      spacing: [
        {
          value: '8px',
          normalized: '8px',
          count: 6,
          sourceProperties: ['padding-top'],
        },
      ],
      effects: [],
      gradients: [],
    },
    tokens: [
      {
        id: 'color-1',
        category: 'color',
        inferredName: '--accent-purple',
        nameBasis: 'heuristic',
        detected: {
          values: [colorValue],
          exemplars: [
            { tag: 'button', roleHint: 'button', selector: 'button.card' },
          ],
          support: 2,
        },
      },
    ],
    unavailable: ['1 inaccessible stylesheet(s) were skipped.'],
    limitations: ['Computed values may not preserve authored custom-property aliases.'],
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

export function makeBlueprintEvidence(overrides: Partial<BlueprintEvidence> = {}): BlueprintEvidence {
  return {
    items: [{ source: 'sampling', status: 'detected', note: null }],
    unavailable: [],
    limitations: [],
    ...overrides,
  };
}

export function makeWebsiteBlueprint(overrides: Partial<WebsiteBlueprint> = {}): WebsiteBlueprint {
  const evidence = [{ source: 'sampling', status: 'detected', note: null }] as const;
  const geometry = { x: 0, y: 0, width: 1200, height: 640 };
  return {
    metadata: {
      schemaVersion: '1.0',
      capturedAt: '2026-01-01T00:00:00.000Z',
      requestId: 'bp-1',
      origin: 'https://example.com',
      viewport: { width: 1280, height: 720, devicePixelRatio: 1 },
      document: {
        language: 'en-US',
        colorScheme: 'light',
        documentWidth: 1280,
        documentHeight: 1800,
        scrollWidth: 1280,
        scrollHeight: 1800,
      },
      status: 'complete',
      truncation: { truncated: false, reasons: [], limitsReached: [] },
    },
    refs: [
      { ref: 'ref-1', category: 'region' },
      { ref: 'ref-2', category: 'section' },
      { ref: 'ref-3', category: 'component' },
      { ref: 'ref-4', category: 'layout' },
      { ref: 'ref-5', category: 'visual' },
    ],
    structure: {
      nodes: [
        {
          ref: 'ref-1',
          kind: 'region',
          category: 'banner',
          role: 'banner',
          parentRef: null,
          childRefs: ['ref-2'],
          geometry: { x: 0, y: 0, width: 1200, height: 64 },
          evidence: [{ source: 'geometry', status: 'detected', note: null }],
          unavailable: [],
          limitations: [],
        },
        {
          ref: 'ref-2',
          kind: 'section',
          category: 'main',
          role: 'main',
          parentRef: 'ref-1',
          childRefs: [],
          geometry,
          evidence: [{ source: 'sampling', status: 'inferred', note: 'Category was inferred from structure' }],
          unavailable: [],
          limitations: [],
        },
      ],
      sectionRefs: ['ref-2'],
      unavailable: [],
      limitations: [],
    },
    components: [
      {
        ref: 'ref-3',
        category: 'button',
        occurrenceCount: 2,
        sectionRefs: ['ref-2'],
        examples: [
          {
            ref: 'ref-3',
            selectorHint: 'button.card',
            geometry: { x: 24, y: 96, width: 120, height: 40 },
            evidence: [{ source: 'computed-style', status: 'detected', note: null }],
            unavailable: [],
            limitations: [],
          },
        ],
        evidence: [{ source: 'sampling', status: 'detected', note: null }],
        unavailable: [],
        limitations: [],
      },
    ],
    layout: [
      {
        ref: 'ref-4',
        targetRef: 'ref-2',
        display: 'flex',
        dimensions: {
          width: '100%',
          height: 'auto',
          minWidth: null,
          maxWidth: '1200px',
        },
        alignment: {
          alignItems: 'center',
          alignSelf: null,
          justifyContent: 'space-between',
          justifySelf: null,
          textAlign: null,
        },
        gaps: { rowGap: '8px', columnGap: '8px' },
        positioning: {
          position: 'relative',
          top: '0px',
          right: '0px',
          bottom: '0px',
          left: '0px',
          zIndex: null,
        },
        flex: {
          direction: 'row',
          wrap: 'nowrap',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        grid: null,
        evidence: [{ source: 'computed-style', status: 'detected', note: null }],
        unavailable: [],
        limitations: [],
      },
    ],
    designSystem: makeDesignSystemSnapshot(),
    motion: {
      summary: {
        animationCount: 0,
        cssAnimationCount: 0,
        transitionCount: 0,
        waapiCount: 0,
        runningCount: 0,
        keyframeSetCount: 0,
        reducedMotion: false,
        animatedProperties: [],
      },
      observations: [],
      easings: [],
      reducedMotion: false,
      unavailable: ['Motion was not active during capture'],
      limitations: ['Observed motion is time dependent'],
    },
    responsive: {
      observedViewport: { width: 1280, height: 720, devicePixelRatio: 1 },
      observedBreakpoints: ['current viewport'],
      unobservedBreakpoints: ['smaller breakpoints were not observed'],
      unobservedViewportStates: ['hover and focus states were not observed'],
      evidence: [...evidence],
      unavailable: [],
      limitations: [],
    },
    visualReferences: [
      {
        ref: 'ref-5',
        targetRef: 'ref-2',
        geometry,
        descriptors: ['display flex', 'gap 8px'],
        evidence: [{ source: 'geometry', status: 'detected', note: null }],
        unavailable: [],
        limitations: [],
      },
    ],
    evidence: makeBlueprintEvidence(),
    ...overrides,
  };
}

export function makeWebsiteBlueprintInput(overrides: Partial<WebsiteBlueprintInput> = {}): WebsiteBlueprintInput {
  const evidence = [{ source: 'sampling', status: 'detected', note: null }] as const;
  const designSystem = makeDesignSystemSnapshot();
  const motionSnapshot = makeMotionSnapshot();
  return {
    requestId: 'bp-input-1',
    capturedAt: '2026-01-01T00:00:00.000Z',
    origin: 'https://example.com',
    viewport: { width: 1280, height: 720, devicePixelRatio: 1 },
    document: {
      language: 'en-US',
      colorScheme: 'light',
      documentWidth: 1280,
      documentHeight: 1800,
      scrollWidth: 1280,
      scrollHeight: 1800,
    },
    structure: [
      {
        key: 'banner',
        kind: 'region',
        category: 'banner',
        role: 'banner',
        geometry: { x: 0, y: 0, width: 1200, height: 64 },
        evidence: [{ source: 'geometry', status: 'detected', note: null }],
      },
      {
        key: 'main',
        parentKey: 'banner',
        kind: 'section',
        category: 'main',
        role: 'main',
        geometry: { x: 0, y: 64, width: 1200, height: 640 },
        evidence: [{ source: 'sampling', status: 'inferred', note: 'Category was inferred from structure' }],
      },
    ],
    components: [
      {
        category: 'button',
        occurrenceCount: 2,
        classificationStatus: 'detected',
        sectionKeys: ['main'],
        examples: [{
          selectorHint: 'button.primary',
          geometry: { x: 24, y: 96, width: 120, height: 40 },
          evidence: [{ source: 'computed-style', status: 'detected', note: null }],
        }],
        evidence: [...evidence],
      },
    ],
    layout: [{
      targetKey: 'main',
      display: 'flex',
      width: '100%',
      height: 'auto',
      maxWidth: '1200px',
      alignItems: 'center',
      justifyContent: 'space-between',
      rowGap: '8px',
      columnGap: '8px',
      position: 'relative',
      flex: { direction: 'row', wrap: 'nowrap', alignItems: 'center', justifyContent: 'space-between' },
      evidence: [{ source: 'computed-style', status: 'detected', note: null }],
    }],
    designSystem,
    motion: {
      snapshot: motionSnapshot,
      targets: { a1: 'main', 'declared-1': 'main' },
      labels: {
        a1: { category: 'button', role: 'button', name: 'pulse' },
        'declared-1': { category: 'button', role: 'button', name: 'transform' },
      },
    },
    responsive: {
      observedBreakpoints: ['current viewport'],
      unobservedBreakpoints: ['smaller breakpoints were not observed'],
      unobservedViewportStates: ['hover and focus states were not observed'],
      evidence: [...evidence],
    },
    visualReferences: [{
      targetKey: 'main',
      descriptors: ['display flex', 'gap 8px'],
      evidence: [{ source: 'geometry', status: 'detected', note: null }],
    }],
    evidence: [...evidence],
    unavailable: [],
    limitations: [],
    ...overrides,
  };
}
