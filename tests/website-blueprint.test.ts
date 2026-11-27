import { describe, expect, it } from 'vitest';
import {
  buildWebsiteBlueprint,
  type WebsiteBlueprintComponentInput,
  type WebsiteBlueprintInput,
} from '../src/content/website-blueprint';
import { isDesignSystemSnapshot, isWebsiteBlueprint } from '../src/shared/messages';
import {
  BLUEPRINT_LIMITS,
  DESIGN_SYSTEM_LIMITS,
  type DesignSystemSnapshot,
  type WebsiteBlueprint,
} from '../src/shared/types';
import { makeDesignSystemSnapshot, makeMotionSnapshot, makeWebsiteBlueprintInput } from './fixtures';

function build(overrides: Partial<WebsiteBlueprintInput> = {}): WebsiteBlueprint {
  const blueprint = buildWebsiteBlueprint(makeWebsiteBlueprintInput(overrides));
  expect(isWebsiteBlueprint(blueprint)).toBe(true);
  expect(JSON.stringify(blueprint).length).toBeLessThanOrEqual(BLUEPRINT_LIMITS.maxPayloadChars);
  return blueprint;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

function makeStructureNodes(count: number, parentKey?: string) {
  return Array.from({ length: count }, (_, index) => ({
    key: parentKey ? `child-${index}` : `node-${index}`,
    parentKey: parentKey ?? null,
    kind: 'section' as const,
    category: 'section' as const,
    role: 'region' as const,
    geometry: { x: index, y: 0, width: 100, height: 40 },
    evidence: [{ source: 'geometry' as const, status: 'detected' as const, note: null }],
  }));
}

function makeLayoutObservations(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    targetKey: 'main',
    display: 'flex' as const,
    width: `${index}px`,
    evidence: [{ source: 'computed-style' as const, status: 'detected' as const, note: null }],
  }));
}

function makeComponents(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    category: 'button' as const,
    occurrenceCount: index + 1,
    classificationStatus: 'inferred' as const,
    sectionKeys: ['main'],
    examples: [{
      selectorHint: `button-${index}`,
      evidence: [{ source: 'computed-style' as const, status: 'detected' as const, note: null }],
    }],
    evidence: [{ source: 'sampling' as const, status: 'inferred' as const, note: null }],
  }));
}

function makeLargeDesignSystem(): DesignSystemSnapshot {
  const longName = `p${'x'.repeat(62)}`;
  const longValue = 'x'.repeat(155);
  const normalized = 'y'.repeat(155);
  const categories = ['color', 'typography', 'spacing'] as const;
  const tokens = categories.flatMap((category) =>
    Array.from({ length: DESIGN_SYSTEM_LIMITS.maxTokensPerCategory }, (_, index) => ({
      id: `${category}-${index}`,
      category,
      inferredName: `--${category}-${index}-${'a'.repeat(50)}`.slice(0, 64),
      nameBasis: 'rank' as const,
      detected: {
        support: 2,
        values: [{
          value: longValue,
          normalized,
          count: 2,
          sourceProperties: [longName],
        }],
        exemplars: [{ tag: 'div', roleHint: null, selector: 'div' }],
      },
    })),
  );
  return makeDesignSystemSnapshot({
    detected: {
      ...makeDesignSystemSnapshot().detected,
      palette: Array.from({ length: DESIGN_SYSTEM_LIMITS.maxDetectedValuesPerCategory }, () => ({
        value: longValue,
        normalized,
        count: 1,
        sourceProperties: [longName],
      })),
    },
    tokens,
  });
}

describe('buildWebsiteBlueprint', () => {
  it('returns a valid unavailable blueprint for minimal observations', () => {
    const blueprint = build({
      structure: [],
      components: [],
      layout: [],
      visualReferences: [],
      motion: null,
      designSystem: null,
    });

    expect(blueprint.metadata.status).toBe('unavailable');
    expect(blueprint.structure.nodes).toEqual([]);
    expect(blueprint.components).toEqual([]);
    expect(blueprint.layout).toEqual([]);
    expect(blueprint.visualReferences).toEqual([]);
    expect(blueprint.motion.observations).toEqual([]);
    expect(blueprint.designSystem.tokens).toEqual([]);
    expect(blueprint.evidence.unavailable).toEqual(expect.arrayContaining([
      'Structure observations were not supplied.',
      'Component observations were not supplied.',
      'Layout observations were not supplied.',
      'Visual reference observations were not supplied.',
      'Motion observations were not available.',
    ]));
  });

  it('builds a complete blueprint from populated observations', () => {
    const blueprint = build();

    expect(blueprint.metadata.status).toBe('complete');
    expect(blueprint.metadata.origin).toBe('https://example.com');
    expect(blueprint.structure.nodes).toHaveLength(2);
    expect(blueprint.components).toHaveLength(1);
    expect(blueprint.layout).toHaveLength(1);
    expect(blueprint.visualReferences).toHaveLength(1);
    expect(blueprint.motion.observations).toHaveLength(2);
    expect(blueprint.designSystem.tokens.length).toBeGreaterThan(0);
    expect(blueprint.evidence.limitations).toEqual([]);
  });

  it('is deterministic for the same input', () => {
    const input = makeWebsiteBlueprintInput();
    expect(buildWebsiteBlueprint(input)).toEqual(buildWebsiteBlueprint(input));
  });

  it('builds a unique hierarchy without leaking input keys or classes', () => {
    const blueprint = build();
    const refs = blueprint.refs.map((entry) => entry.ref);
    const banner = blueprint.structure.nodes[0]!;
    const main = blueprint.structure.nodes[1]!;

    expect(new Set(refs).size).toBe(refs.length);
    expect(banner.childRefs).toEqual([main.ref]);
    expect(main.parentRef).toBe(banner.ref);
    expect(blueprint.structure.sectionRefs).toEqual([main.ref]);
    expect(blueprint.components[0]!.sectionRefs).toEqual([main.ref]);
    expect(JSON.stringify(blueprint)).not.toContain('"key"');
  });

  it('omits observations with invalid or missing evidence and records limitations', () => {
    const blueprint = build({
      structure: [
        makeWebsiteBlueprintInput().structure![1]!,
        {
          key: 'bad',
          kind: 'section',
          category: 'section',
          geometry: { x: 0, y: 0, width: 10, height: 10 },
          evidence: [{ source: 'guesswork', status: 'detected' }],
        },
      ],
      layout: [{
        targetKey: 'main',
        display: 'flex',
        evidence: [],
      }],
    });

    expect(blueprint.structure.nodes).toHaveLength(1);
    expect(blueprint.structure.nodes[0]!.category).toBe('main');
    expect(blueprint.layout).toEqual([]);
    expect(blueprint.metadata.truncation.reasons).toContain('Structure contained invalid evidence');
    expect(blueprint.metadata.truncation.reasons).toContain('Layout observation without evidence was omitted');
  });

  it('distinguishes detected and inferred component classifications', () => {
    const component = (classificationStatus: 'detected' | 'inferred'): WebsiteBlueprintComponentInput => ({
      category: 'button',
      occurrenceCount: 4,
      classificationStatus,
      sectionKeys: ['main'],
      examples: [{
        selectorHint: 'button',
        evidence: [{ source: 'computed-style', status: 'detected' }],
      }],
      evidence: [{ source: 'sampling', status: 'detected' }],
    });
    const detected = build({ components: [component('detected')] });
    const inferred = build({ components: [component('inferred')] });

    expect(detected.components[0]!.evidence.some((item) =>
      item.status === 'detected' && item.note === 'Category was supplied by sampled evidence')).toBe(true);
    expect(inferred.components[0]!.evidence.some((item) =>
      item.status === 'inferred' && item.note === 'Category was inferred from supplied observations')).toBe(true);
  });

  it('reuses supplied design-system and motion observations without replay data', () => {
    const designSystem = makeDesignSystemSnapshot();
    const motion = makeMotionSnapshot();
    const blueprint = build({
      designSystem,
      motion: {
        snapshot: motion,
        targets: { a1: 'main', 'declared-1': 'main' },
        labels: {
          a1: { category: 'button', role: 'button', name: 'pulse' },
          'declared-1': { category: 'button', role: 'button', name: 'transform' },
        },
      },
    });
    const serialized = JSON.stringify(blueprint);

    expect(blueprint.designSystem.tokens).toEqual(designSystem.tokens);
    expect(blueprint.designSystem.origin).toBe('https://example.com');
    expect(blueprint.motion.summary.animationCount).toBe(motion.summary.animationCount);
    expect(blueprint.motion.observations.map((item) => item.source)).toEqual(['css-animation', 'css-transition']);
    expect(serialized).not.toContain('replayable');
    expect(serialized).not.toContain('isolatedActiveId');
  });

  it('reports missing motion and responsive observations', () => {
    const blueprint = build({
      motion: null,
      responsive: null,
      limitations: ['Automation was unavailable'],
      unavailable: ['Network access was unavailable'],
    });

    expect(blueprint.motion.unavailable).toContain('Motion observations were not supplied.');
    expect(blueprint.responsive.unobservedBreakpoints).toContain('Breakpoints were not supplied.');
    expect(blueprint.responsive.unobservedViewportStates).toContain('Viewport states were not supplied.');
    expect(blueprint.evidence.unavailable).toContain('Network access was unavailable');
    expect(blueprint.evidence.limitations).toContain('Automation was unavailable');
  });

  it('enforces structure child and section caps', () => {
    const blueprint = build({
      structure: [
        makeWebsiteBlueprintInput().structure![1]!,
        ...makeStructureNodes(1),
        ...makeStructureNodes(BLUEPRINT_LIMITS.maxChildrenPerSection + 1, 'node-0'),
        ...Array.from({ length: BLUEPRINT_LIMITS.maxSections + 1 }, (_, index) => ({
          key: `section-${index}`,
          kind: 'section' as const,
          category: 'section' as const,
          geometry: { x: index, y: 0, width: 40, height: 20 },
          evidence: [{ source: 'geometry' as const, status: 'detected' as const, note: null }],
        })),
      ],
    });

    expect(blueprint.metadata.status).toBe('partial');
    expect(blueprint.structure.nodes[1]!.childRefs.length).toBeLessThanOrEqual(BLUEPRINT_LIMITS.maxChildrenPerSection);
    expect(blueprint.structure.sectionRefs.length).toBeLessThanOrEqual(BLUEPRINT_LIMITS.maxSections);
    expect(blueprint.metadata.truncation.limitsReached).toEqual(expect.arrayContaining([
      'maxChildrenPerSection',
      'maxSections',
    ]));
  });

  it('enforces component and local ref caps', () => {
    const blueprint = build({
      components: makeComponents(BLUEPRINT_LIMITS.maxComponents + 1),
      layout: makeLayoutObservations(BLUEPRINT_LIMITS.maxLayoutObservations + 1),
    });

    expect(blueprint.metadata.status).toBe('partial');
    expect(blueprint.components.length).toBeLessThanOrEqual(BLUEPRINT_LIMITS.maxComponents);
    expect(blueprint.refs.length).toBeLessThanOrEqual(BLUEPRINT_LIMITS.maxRefs);
    expect(blueprint.metadata.truncation.limitsReached).toEqual(expect.arrayContaining([
      'maxComponents',
      'maxRefs',
    ]));
  });

  it('enforces the layout observation cap', () => {
    const blueprint = build({
      components: [],
      layout: makeLayoutObservations(BLUEPRINT_LIMITS.maxLayoutObservations + 1),
      visualReferences: [],
      motion: null,
    });

    expect(blueprint.layout.length).toBeLessThanOrEqual(BLUEPRINT_LIMITS.maxLayoutObservations);
    expect(blueprint.metadata.truncation.limitsReached).toContain('maxLayoutObservations');
  });

  it('enforces evidence and root availability caps', () => {
    const blueprint = build({
      evidence: Array.from({ length: BLUEPRINT_LIMITS.maxEvidenceItemsPerObservation + 1 }, () => ({
        source: 'sampling',
        status: 'detected',
        note: 'evidence item',
      })),
      unavailable: Array.from({ length: BLUEPRINT_LIMITS.maxUnavailable + 1 }, (_, index) => `unavailable-${index}`),
      limitations: Array.from({ length: BLUEPRINT_LIMITS.maxLimitations + 1 }, (_, index) => `limitation-${index}`),
    });

    expect(blueprint.evidence.items.length).toBeLessThanOrEqual(BLUEPRINT_LIMITS.maxEvidenceItemsPerObservation);
    expect(blueprint.evidence.unavailable.length).toBeLessThanOrEqual(BLUEPRINT_LIMITS.maxUnavailable);
    expect(blueprint.evidence.limitations.length).toBeLessThanOrEqual(BLUEPRINT_LIMITS.maxLimitations);
    expect(blueprint.metadata.truncation.limitsReached).toEqual(expect.arrayContaining([
      'maxEvidenceItemsPerObservation',
      'maxUnavailable',
      'maxLimitations',
    ]));
  });

  it('bounds selector hints and drops unsafe descriptors', () => {
    const blueprint = build({
      components: [{
        category: 'button',
        occurrenceCount: 1,
        sectionKeys: ['main'],
        evidence: [{ source: 'sampling', status: 'detected' }],
        examples: [{
          selectorHint: 'x'.repeat(BLUEPRINT_LIMITS.maxSelectorLength + 10),
          geometry: { x: 0, y: 0, width: 10, height: 10 },
          evidence: [{ source: 'computed-style', status: 'detected' }],
        }],
      }],
      visualReferences: [{
        targetKey: 'main',
        descriptors: ['url(https://example.com/secret.png)', 'display flex'],
        evidence: [{ source: 'geometry', status: 'detected' }],
      }],
    });

    expect(blueprint.components[0]!.examples[0]!.selectorHint).toBeNull();
    expect(blueprint.visualReferences[0]!.descriptors).toEqual(['display flex']);
    expect(blueprint.metadata.truncation.limitsReached).toContain('maxSelectorLength');
  });

  it('shrinks an oversized design system to the whole-blueprint payload cap', () => {
    const large = makeLargeDesignSystem();
    expect(isDesignSystemSnapshot(large)).toBe(true);

    const blueprint = build({ designSystem: large });

    expect(blueprint.metadata.status).toBe('partial');
    expect(blueprint.metadata.truncation.limitsReached).toContain('maxPayloadChars');
    expect(blueprint.designSystem.tokens.length).toBeLessThan(large.tokens.length);
    expect(JSON.stringify(blueprint).length).toBeLessThanOrEqual(BLUEPRINT_LIMITS.maxPayloadChars);
  });

  it('excludes forbidden fields and unsafe values from emitted observations', () => {
    const input = makeWebsiteBlueprintInput();
    const extra = input.structure![0]! as unknown as Record<string, unknown>;
    extra.innerText = 'secret page copy';
    extra.ariaLabel = 'secret label';
    extra.title = 'secret title';
    extra.href = 'https://example.com/private';
    extra.value = 'secret form value';

    const serialized = JSON.stringify(build(input));

    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('innerText');
    expect(serialized).not.toContain('ariaLabel');
    expect(serialized).not.toContain('href');
  });

  it('does not mutate its input and accepts deeply frozen observations', () => {
    const frozen = deepFreeze(JSON.parse(JSON.stringify(makeWebsiteBlueprintInput())) as WebsiteBlueprintInput);
    const before = JSON.stringify(frozen);

    expect(() => buildWebsiteBlueprint(frozen)).not.toThrow();
    expect(JSON.stringify(frozen)).toBe(before);
  });

  it('rejects malformed required inputs and origin-only violations', () => {
    expect(() => buildWebsiteBlueprint({
      ...makeWebsiteBlueprintInput(),
      origin: 'https://example.com/path?secret=1',
    })).toThrow(/origin-only/);
    expect(() => buildWebsiteBlueprint({
      ...makeWebsiteBlueprintInput(),
      requestId: 'x'.repeat(BLUEPRINT_LIMITS.maxNameLength + 1),
    })).toThrow(/requestId/);
    expect(() => buildWebsiteBlueprint({
      ...makeWebsiteBlueprintInput(),
      capturedAt: 'not-a-timestamp',
    })).toThrow(/capturedAt/);
    expect(() => buildWebsiteBlueprint({} as WebsiteBlueprintInput)).toThrow(/requestId/);
  });

  it('keeps every emitted blueprint valid under the Stage 1 guard', () => {
    expect(isWebsiteBlueprint(build())).toBe(true);
    expect(isWebsiteBlueprint(build({ structure: [], motion: null }))).toBe(true);
    expect(isWebsiteBlueprint(build({
      structure: makeStructureNodes(4),
      layout: makeLayoutObservations(4),
    }))).toBe(true);
  });
});
