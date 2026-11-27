import { describe, expect, it, vi } from 'vitest';
import { isWebsiteBlueprint } from '../src/shared/messages';
import { BLUEPRINT_LIMITS } from '../src/shared/types';
import { captureWebsiteBlueprint, type WebsiteBlueprintCaptureDeps } from '../src/content/website-blueprint-capture';
import type { DesignSampleDeps, DesignStylesheetRecord } from '../src/content/design-system';
import { makeMotionSnapshot } from './fixtures';

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
  isConnected?: boolean;
  rect?: { x: number; y: number; width: number; height: number };
  style?: Record<string, string>;
  children?: TestNode[];
}

function makeNode(id: string, overrides: Partial<TestNode> = {}): TestNode {
  return {
    id,
    tag: overrides.tag ?? 'div',
    selector: overrides.selector ?? (overrides.tag ?? 'div'),
    roleHint: null,
    hidden: false,
    iframe: false,
    shadowRoot: false,
    formControl: false,
    textRendering: false,
    isConnected: true,
    rect: { x: 0, y: 0, width: 120, height: 40 },
    style: {},
    children: [],
    ...overrides,
  };
}

function makeSampleDeps(): DesignSampleDeps {
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
    geometry: (node) => (node as TestNode).rect ?? { x: 0, y: 0, width: 0, height: 0 },
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

function makeCaptureDeps(root: unknown, overrides: Partial<WebsiteBlueprintCaptureDeps> = {}): WebsiteBlueprintCaptureDeps {
  return {
    root: () => root,
    sample: makeSampleDeps(),
    readStylesheets: () => [],
    now: () => '2026-01-01T00:00:00.000Z',
    origin: () => 'https://example.com/current-page?secret=1#frag',
    viewport: () => ({ width: 1280, height: 720, devicePixelRatio: 1 }),
    documentInfo: () => ({
      language: 'en-US',
      colorScheme: 'light',
      documentWidth: 1280,
      documentHeight: 1800,
      scrollWidth: 1280,
      scrollHeight: 1800,
    }),
    ...overrides,
  };
}

describe('website blueprint content capture', () => {
  it('maps bounded observations into a valid blueprint using one sampling pass', () => {
    const root = makeNode('root', {
      tag: 'main',
      selector: 'main',
      rect: { x: 0, y: 64, width: 1000, height: 600 },
      style: { display: 'flex', width: '100%', gap: '8px', 'flex-direction': 'row' },
      children: [
        makeNode('header', {
          tag: 'header',
          selector: 'header',
          rect: { x: 0, y: 0, width: 1000, height: 64 },
          style: { display: 'flex', 'align-items': 'center' },
        }),
        makeNode('nav', {
          tag: 'nav',
          selector: 'nav',
          rect: { x: 0, y: 64, width: 200, height: 600 },
          style: { position: 'sticky', top: '0px' },
        }),
        makeNode('button', {
          tag: 'button',
          selector: 'button.primary',
          rect: { x: 24, y: 96, width: 120, height: 40 },
          style: { color: 'rgb(139, 109, 255)', 'font-size': '14px' },
        }),
      ],
    });
    const computedStyle = vi.fn(makeSampleDeps().computedStyle);
    const deps = makeCaptureDeps(root, {
      sample: { ...makeSampleDeps(), computedStyle },
    });

    const blueprint = captureWebsiteBlueprint('bp-map', deps);

    expect(isWebsiteBlueprint(blueprint)).toBe(true);
    expect(blueprint.metadata.requestId).toBe('bp-map');
    expect(blueprint.metadata.origin).toBe('https://example.com');
    expect(blueprint.structure.nodes.map((node) => node.category)).toEqual(
      expect.arrayContaining(['main', 'banner', 'navigation']),
    );
    expect(blueprint.components.map((component) => component.category)).toEqual(
      expect.arrayContaining(['button']),
    );
    expect(blueprint.layout.length).toBeGreaterThan(0);
    expect(blueprint.designSystem.requestId).toBe('bp-map');
    expect(computedStyle.mock.calls.length).toBe(4);
    expect(new Set(blueprint.refs.map((ref) => ref.ref)).size).toBe(blueprint.refs.length);
  });

  it('excludes unsafe, detached and sensitive data while reporting unavailable motion', () => {
    const root = makeNode('root', {
      tag: 'main',
      selector: 'main',
      children: [
        makeNode('button', {
          tag: 'button',
          selector: 'button.primary',
          style: { color: 'url(https://example.com/evil.css)', 'font-size': 'javascript:alert(1)' },
        }),
        makeNode('input', { tag: 'input', selector: 'input', style: { color: 'red' } }),
        makeNode('frame', { tag: 'iframe', selector: 'iframe' }),
        makeNode('shadow', { tag: 'div', selector: 'div', shadowRoot: true }),
        makeNode('hidden', { tag: 'section', selector: 'section', hidden: true }),
        makeNode('detached', { tag: 'section', selector: 'section', isConnected: false, style: { display: 'grid' } }),
      ],
    });
    const readStylesheets = vi.fn<() => ReadonlyArray<DesignStylesheetRecord>>(() => [
      { accessible: false, rules: [] },
    ]);

    const blueprint = captureWebsiteBlueprint('bp-safe', makeCaptureDeps(root, { readStylesheets }));

    const serialized = JSON.stringify(blueprint);
    expect(serialized).not.toContain('url(');
    expect(serialized).not.toContain('javascript:');
    expect(serialized).not.toContain('current-page?secret=1');
    expect(serialized).not.toContain('#frag');
    expect(serialized).not.toContain('Hello');
    expect(blueprint.evidence.limitations.join(' ')).toContain('detached element');
    expect(blueprint.designSystem.summary.stylesheetsInaccessible).toBe(1);
    expect(blueprint.evidence.unavailable.join(' ')).toContain('Motion observations were not available');
    expect(readStylesheets).toHaveBeenCalledTimes(1);
  });

  it('reports limits and keeps counts bounded on a large page', () => {
    const root = makeNode('root', {
      tag: 'main',
      selector: 'main',
      children: Array.from({ length: 30 }, (_, index) => makeNode(`section-${index}`, {
        tag: index % 2 === 0 ? 'section' : 'article',
        selector: index % 2 === 0 ? 'section' : 'article',
        style: { display: 'flex' },
        children: [makeNode(`button-${index}`, { tag: 'button', selector: 'button' })],
      })),
    });

    const blueprint = captureWebsiteBlueprint('bp-limit', makeCaptureDeps(root, {
      limits: { maxElements: 8, maxDepth: 3 },
    }));

    expect(blueprint.designSystem.summary.elementsScanned).toBeLessThanOrEqual(8);
    expect(blueprint.refs.length).toBeLessThanOrEqual(BLUEPRINT_LIMITS.maxRefs);
    expect(blueprint.layout.length).toBeLessThanOrEqual(BLUEPRINT_LIMITS.maxLayoutObservations);
    expect(blueprint.evidence.limitations.join(' ')).toContain('Element limit reached');
  });

  it('maps explicitly supplied motion targets and labels', () => {
    const root = makeNode('root', { tag: 'main', selector: 'main' });
    const snapshot = makeMotionSnapshot();

    const blueprint = captureWebsiteBlueprint('bp-motion', makeCaptureDeps(root, {
      motion: () => snapshot,
      motionTargets: () => ({ a1: 'node-1' }),
      motionLabels: () => ({ a1: { category: 'button', role: 'button', name: 'pulse' } }),
    }));

    expect(blueprint.motion.observations.length).toBeGreaterThan(0);
    expect(JSON.stringify(blueprint)).toContain('pulse');
  });

  it('reports an unavailable blueprint for an empty root', () => {
    const blueprint = captureWebsiteBlueprint('bp-empty', makeCaptureDeps(null));

    expect(isWebsiteBlueprint(blueprint)).toBe(true);
    expect(blueprint.metadata.status).toBe('unavailable');
    expect(blueprint.evidence.unavailable.join(' ')).toContain('Structure observations were not supplied');
  });
});
