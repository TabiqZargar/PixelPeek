import { describe, expect, it } from 'vitest';
import {
  DESIGN_SYSTEM_PROPERTIES,
  isValidTokenName,
  sampleDesignSystemElements,
  extractDesignSystemSnapshot,
  type DesignSampleDeps,
  type DesignStylesheetRecord,
  type DesignSystemDeps,
} from '../src/content/design-system';
import { isDesignSystemSnapshot } from '../src/shared/messages';

interface TestNode {
  id: string;
  tag: string;
  selector: string;
  roleHint?: string | null;
  hidden?: boolean;
  iframe?: boolean;
  shadowRoot?: boolean;
  formControl?: boolean;
  textRendering?: boolean;
  rect?: { width: number; height: number };
  style?: Record<string, string>;
  children?: TestNode[];
}

function makeNode(id: string, overrides: Partial<TestNode> = {}): TestNode {
  const tag = overrides.tag ?? 'div';
  return {
    id,
    tag,
    selector: tag,
    roleHint: null,
    hidden: false,
    iframe: false,
    shadowRoot: false,
    formControl: false,
    textRendering: false,
    rect: { width: 120, height: 40 },
    style: {},
    children: [],
    ...overrides,
  };
}

function sampleDeps(): DesignSampleDeps {
  return {
    children: (node) => (node as TestNode).children ?? [],
    meta: (node) => {
      const testNode = node as TestNode;
      return {
        tag: testNode.tag,
        roleHint: testNode.roleHint ?? null,
        selector: testNode.selector,
        hidden: testNode.hidden ?? false,
        iframe: testNode.iframe ?? false,
        shadowRoot: testNode.shadowRoot ?? false,
        formControl: testNode.formControl ?? false,
        textRendering: testNode.textRendering ?? false,
      };
    },
    geometry: (node) => (node as TestNode).rect ?? { width: 0, height: 0 },
    computedStyle: (node, properties) => {
      const style = (node as TestNode).style ?? {};
      const result: Record<string, string> = {};
      for (const property of properties) {
        const value = style[property];
        if (value !== undefined) result[property] = value;
      }
      return result;
    },
  };
}

function stylesheet(rules: DesignStylesheetRecord['rules'], accessible = true): DesignStylesheetRecord {
  return { accessible, rules };
}

function deps(overrides: Partial<DesignSystemDeps> = {}): DesignSystemDeps {
  return {
    sample: sampleDeps(),
    readStylesheets: () => [],
    now: () => '2026-01-01T00:00:00.000Z',
    origin: () => 'https://example.com/current-page',
    ...overrides,
  };
}

describe('design-system sampling', () => {
  it('uses deterministic breadth-first traversal order', () => {
    const root = makeNode('root', {
      tag: 'main',
      children: [
        makeNode('a', { tag: 'aside' }),
        makeNode('b', { tag: 'nav' }),
        makeNode('c', { tag: 'section', children: [makeNode('d', { tag: 'span' })] }),
      ],
    });

    const sampled = sampleDesignSystemElements(root, sampleDeps());
    expect(sampled.elements.map((element) => element.selector)).toEqual([
      'main', 'aside', 'nav', 'section', 'span',
    ]);
    expect(sampled.skipped).toBe(0);
  });

  it('skips hidden, zero-area, form, iframe and shadow-root nodes', () => {
    const root = makeNode('root', {
      children: [
        makeNode('input', { tag: 'input', style: { color: '#ff0000' } }),
        makeNode('hidden', { hidden: true, style: { color: '#00ff00' } }),
        makeNode('zero', { rect: { width: 0, height: 40 }, style: { color: '#0000ff' } }),
        makeNode('frame', { iframe: true }),
        makeNode('shadow', { shadowRoot: true }),
        makeNode('visible', { tag: 'p', style: { color: '#111111' } }),
      ],
    });

    const snapshot = extractDesignSystemSnapshot('req-1', root, deps());
    expect(snapshot.summary.elementsSkipped).toBe(5);
    expect(snapshot.detected.palette.map((entry) => entry.normalized)).toEqual(['#111111']);
    expect(snapshot.limitations.join(' ')).toMatch(/Iframes are excluded/);
    expect(snapshot.limitations.join(' ')).toMatch(/Shadow roots are excluded/);
    expect(snapshot.limitations.join(' ')).toMatch(/Form controls are excluded/);
  });

  it('applies element, depth and child limits with budget notes', () => {
    const wide = makeNode('root', {
      children: Array.from({ length: 5 }, (_, index) => makeNode(`child-${index}`, { tag: 'span' })),
    });
    const limitedByElements = extractDesignSystemSnapshot('req-2', wide, deps({
      limits: { maxElements: 2 },
    }));
    expect(limitedByElements.summary.elementsScanned).toBe(2);
    expect(limitedByElements.limitations.join(' ')).toMatch(/Element limit reached/);

    const chain = makeNode('root', {
      children: [makeNode('a', {
        children: [makeNode('b', { children: [makeNode('c')] })],
      })],
    });
    const limitedByDepth = extractDesignSystemSnapshot('req-3', chain, deps({
      limits: { maxDepth: 1 },
    }));
    expect(limitedByDepth.summary.elementsScanned).toBe(2);
    expect(limitedByDepth.limitations.join(' ')).toMatch(/Depth limit reached/);

    const limitedByChildren = extractDesignSystemSnapshot('req-4', wide, deps({
      limits: { maxChildrenPerNode: 2 },
    }));
    expect(limitedByChildren.summary.elementsScanned).toBe(3);
    expect(limitedByChildren.limitations.join(' ')).toMatch(/Child limit reached/);
  });

  it('uses only the allowlisted computed properties', () => {
    expect(DESIGN_SYSTEM_PROPERTIES).toContain('font-size');
    expect(DESIGN_SYSTEM_PROPERTIES).not.toContain('margin-left');
    expect(DESIGN_SYSTEM_PROPERTIES).not.toContain('margin-right');
  });
});

describe('design-system extraction', () => {
  it('counts one vote per normalized value per element and records all source properties', () => {
    const root = makeNode('root', {
      style: {
        'padding-top': '8px',
        'padding-bottom': '8px',
        'padding-left': '12px',
        'margin-left': '999px',
      },
    });

    const snapshot = extractDesignSystemSnapshot('req-5', root, deps());
    const eight = snapshot.detected.spacing.find((entry) => entry.normalized === '8px');
    expect(eight?.count).toBe(1);
    expect(eight?.sourceProperties).toEqual(['padding-top', 'padding-bottom']);
    expect(snapshot.detected.spacing.some((entry) => entry.normalized === '999px')).toBe(false);
  });

  it('keeps low-frequency colours detected but requires support for token candidates', () => {
    const root = makeNode('root', {
      children: [
        makeNode('common-1', { tag: 'p', style: { color: '#111111' } }),
        makeNode('common-2', { tag: 'p', style: { color: '#111111' } }),
        makeNode('accent', { tag: 'button', style: { color: '#8b6dff' } }),
      ],
    });

    const snapshot = extractDesignSystemSnapshot('req-6', root, deps());
    expect(snapshot.detected.palette.find((entry) => entry.normalized === '#8b6dff')?.count).toBe(1);
    expect(snapshot.detected.palette.find((entry) => entry.normalized === '#111111')?.count).toBe(2);
    expect(snapshot.tokens.some((token) => token.detected.values[0]?.normalized === '#111111')).toBe(true);
    expect(snapshot.tokens.some((token) => token.detected.values[0]?.normalized === '#8b6dff')).toBe(false);
  });

  it('extracts typography from visible text-rendering elements without reading text', () => {
    const root = makeNode('root', {
      tag: 'p',
      textRendering: true,
      style: {
        'font-size': '16px',
        'font-family': 'Inter, sans-serif',
        'font-weight': '600',
      },
    });

    const snapshot = extractDesignSystemSnapshot('req-7', root, deps());
    expect(snapshot.summary.textElementsInspected).toBe(1);
    expect(snapshot.detected.typography.some((entry) => entry.normalized === '16px')).toBe(true);
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain('textContent');
    expect(serialized).not.toContain('innerText');
  });

  it('reads stylesheet evidence with rule and declaration budgets', () => {
    const records = [
      stylesheet([{
        declarations: [
          ['--brand-primary', '#123456'],
          ['--other', '8px'],
          ['color', 'red'],
        ],
      }, {
        declarations: [['--unused', '#abcdef']],
      }]),
      stylesheet([], false),
    ];
    const root = makeNode('root', {
      children: [
        makeNode('a', { tag: 'p', style: { color: '#123456' } }),
        makeNode('b', { tag: 'p', style: { color: '#123456' } }),
      ],
    });

    const snapshot = extractDesignSystemSnapshot('req-8', root, deps({
      readStylesheets: () => records,
      limits: { maxCssRules: 1, maxDeclarationsPerRule: 1 },
    }));
    expect(snapshot.summary.stylesheetsReadable).toBe(1);
    expect(snapshot.summary.stylesheetsInaccessible).toBe(1);
    expect(snapshot.unavailable.join(' ')).toMatch(/inaccessible/);
    expect(snapshot.limitations.join(' ')).toMatch(/CSS rule limit reached/);
    expect(snapshot.limitations.join(' ')).toMatch(/Declaration limit reached/);
    expect(snapshot.tokens[0]?.inferredName).toBe('--brand-primary');
  });

  it('sanitizes selectors and unsafe CSS values', () => {
    const root = makeNode('root', {
      selector: '#private-user button.x.y.z',
      style: {
        color: 'url(https://tracker.example/token)',
        'background-image': 'url(https://tracker.example/pixel)',
        'border-radius': '4px; } body { display: none',
      },
    });

    const snapshot = extractDesignSystemSnapshot('req-9', root, deps());
    const sampled = sampleDesignSystemElements(root, sampleDeps());
    expect(sampled.elements[0]?.selector).toBe('div');
    expect(JSON.stringify(snapshot)).not.toContain('tracker.example');
    expect(JSON.stringify(snapshot)).not.toContain('display: none');
  });

  it('derives deterministic inferred names and preserves safe custom-property names', () => {
    const root = makeNode('root', {
      children: [
        makeNode('a', { tag: 'button', style: { color: '#8b6dff' } }),
        makeNode('b', { tag: 'button', style: { color: '#8b6dff' } }),
      ],
    });
    const customStylesheets = () => [stylesheet([{
      declarations: [['--brand-accent', '#8b6dff']],
    }])];
    const first = extractDesignSystemSnapshot('req-10', root, deps({ readStylesheets: customStylesheets }));
    const second = extractDesignSystemSnapshot('req-10', root, deps({ readStylesheets: customStylesheets }));

    expect(first).toEqual(second);
    expect(first.tokens).toHaveLength(1);
    expect(first.tokens[0]?.inferredName).toBe('--brand-accent');
    expect(first.tokens[0]?.nameBasis).toBe('heuristic');
    expect(first.tokens.every((token) => isValidTokenName(token.inferredName))).toBe(true);
    expect(first.limitations.join(' ')).toMatch(/not authored names/);
  });

  it('returns a valid empty snapshot for an empty page', () => {
    const snapshot = extractDesignSystemSnapshot('req-11', null, deps());
    expect(isDesignSystemSnapshot(snapshot)).toBe(true);
    expect(snapshot.summary.elementsScanned).toBe(0);
    expect(snapshot.summary.elementsSkipped).toBe(0);
    expect(snapshot.detected.palette).toEqual([]);
    expect(snapshot.tokens).toEqual([]);
  });
});
