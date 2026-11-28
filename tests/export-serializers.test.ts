import { describe, expect, it } from 'vitest';
import { serializeDesignSystemCss } from '../src/content/design-system-export';
import { isWebsiteBlueprint } from '../src/shared/messages';
import type { WebsiteBlueprint } from '../src/shared/types';
import { serializeDesignTokensCss } from '../src/panel/exports/design-tokens';
import {
  serializeBlueprintJson,
  serializeComponentInventory,
  serializeImplementationBrief,
  serializeLayoutSpecification,
} from '../src/panel/exports/serialize';
import { EXPORT_FORMATS, EXPORT_LIMITS } from '../src/panel/exports/types';
import { makeBlueprintEvidence, makeDesignSystemSnapshot, makeWebsiteBlueprint } from './fixtures';

const blueprint = makeWebsiteBlueprint();

const serializers = [
  { id: 'blueprint-json', run: serializeBlueprintJson },
  { id: 'implementation-brief', run: serializeImplementationBrief },
  { id: 'design-tokens-css', run: serializeDesignTokensCss },
  { id: 'component-inventory', run: serializeComponentInventory },
  { id: 'layout-specification', run: serializeLayoutSpecification },
] as const;

describe('export serializers', () => {
  it('validates the blueprint before serializing', () => {
    for (const { run } of serializers) {
      expect(() => run(null)).toThrow(TypeError);
      expect(() => run({})).toThrow(TypeError);
    }
  });

  it('returns stable filenames, MIME types, ids, counts and content', () => {
    for (const { id, run } of serializers) {
      const first = run(blueprint);
      const second = run(blueprint);
      expect(second).toEqual(first);
      expect(first.id).toBe(id);
      expect(first.filename).toBe(EXPORT_FORMATS[id].filename);
      expect(first.mimeType).toBe(EXPORT_FORMATS[id].mimeType);
      expect(first.charCount).toBe(first.content.length);
      expect(first.content.length).toBeGreaterThan(0);
      expect(first.content.length).toBeLessThanOrEqual(EXPORT_LIMITS.maxOutputChars);
    }
  });

  it('rejects invalid export limits instead of silently truncating', () => {
    for (const { run } of serializers) {
      expect(() => run(blueprint, { maxChars: 0 })).toThrow(RangeError);
      expect(() => run(blueprint, { maxChars: 10 })).toThrow(RangeError);
      expect(() => run(blueprint, { maxChars: Number.NaN })).toThrow(RangeError);
    }
  });

  it('reports warnings within a fixed bound', () => {
    const noisy = makeWebsiteBlueprint({
      evidence: {
        ...makeBlueprintEvidence(),
        limitations: Array.from({ length: 30 }, (_, index) => `evidence limitation ${index + 1}`),
      },
      structure: {
        ...blueprint.structure,
        limitations: Array.from({ length: 30 }, (_, index) => `structure limitation ${index + 1}`),
      },
      motion: {
        ...blueprint.motion,
        limitations: Array.from({ length: 30 }, (_, index) => `motion limitation ${index + 1}`),
      },
    });
    const result = serializeImplementationBrief(noisy);
    expect(result.warnings.length).toBeLessThanOrEqual(EXPORT_LIMITS.maxWarnings);
    expect(result.warnings.at(-1)).toContain('warning limit');
  });
});

describe('Blueprint JSON export', () => {
  it('preserves the validated blueprint exactly', () => {
    const result = serializeBlueprintJson(blueprint);
    expect(result.content).toBe(JSON.stringify(blueprint, null, 2));
    expect(JSON.parse(result.content)).toEqual(blueprint);
  });
});

describe('Implementation Brief export', () => {
  it('renders a concise, label-led handoff without full source URLs', () => {
    const result = serializeImplementationBrief(blueprint);
    const content = result.content;
    expect(content).toContain('# Implementation Brief');
    expect(content).toContain('## Viewport and document');
    expect(content).toContain('## Structure summary');
    expect(content).toContain('## Layout observations');
    expect(content).toContain('## Motion availability');
    expect(content).toContain('## Responsive evidence');
    expect(content).toContain('## Unavailable categories');
    expect(content).toContain('## Limitations and truncation warnings');
    expect(content).toContain('Only the captured viewport was observed.');
    expect(content).toContain('Evidence status: detected, inferred');
    expect(content).toContain('Motion was not active during capture');
    expect(content).not.toContain('/checkout');
    expect(content).not.toContain('href=');
    expect(content).not.toContain('<script');
  });

  it('labels partial data, unavailable categories and truncation explicitly', () => {
    const partial = makeWebsiteBlueprint({
      metadata: {
        ...blueprint.metadata,
        status: 'partial',
        truncation: {
          truncated: true,
          reasons: ['node limit was reached'],
          limitsReached: ['maxNodes'],
        },
      },
      structure: {
        ...blueprint.structure,
        unavailable: ['Landmarks were not labeled'],
        limitations: ['DOM sampling was partial'],
      },
    });
    const result = serializeImplementationBrief(partial);
    expect(result.content).toContain('Status: partial');
    expect(result.content).toContain('Truncated: yes');
    expect(result.content).toContain('node limit was reached');
    expect(result.content).toContain('maxNodes');
    expect(result.content).toContain('Landmarks were not labeled');
    expect(result.content).toContain('DOM sampling was partial');
    expect(result.warnings.join(' ')).toContain('node limit was reached');
  });
});

describe('Component Inventory export', () => {
  it('reports local refs, occurrence counts and evidence status', () => {
    const result = serializeComponentInventory(blueprint);
    expect(result.content).toContain('# Component Inventory');
    expect(result.content).toContain('## ref-3 · button');
    expect(result.content).toContain('Local ref: ref-3');
    expect(result.content).toContain('Classification status: detected');
    expect(result.content).toContain('Occurrences: 2');
    expect(result.content).toContain('selector hint: button.card');
  });

  it('marks inferred classifications and does not invent missing components', () => {
    const component = blueprint.components[0];
    if (!component) throw new Error('Fixture component is missing.');
    const inferred = makeWebsiteBlueprint({
      components: [
        {
          ...component,
          evidence: [{ source: 'sampling', status: 'inferred', note: 'Grouped from classes' }],
        },
      ],
    });
    const inferredResult = serializeComponentInventory(inferred);
    expect(inferredResult.content).toContain('Classification status: inferred');
    expect(inferredResult.content).toContain('Grouped from classes');

    const empty = makeWebsiteBlueprint({ components: [] });
    const emptyResult = serializeComponentInventory(empty);
    expect(emptyResult.content).toContain('No component observations were supplied.');
    expect(emptyResult.content).not.toContain('button');
  });
});

describe('Layout Specification export', () => {
  it('reports observed structure, geometry, layout and responsive limits', () => {
    const result = serializeLayoutSpecification(blueprint);
    expect(result.content).toContain('# Layout Specification');
    expect(result.content).toContain('only the captured viewport was observed');
    expect(result.content).toContain('## Structure and layout relationships');
    expect(result.content).toContain('ref-4 → ref-2 · display flex');
    expect(result.content).toContain('row-gap: 8px');
    expect(result.content).toContain('## Geometry observations');
    expect(result.content).toContain('smaller breakpoints were not observed');
    expect(result.content).toContain('hover and focus states were not observed');
  });

  it('does not invent structure, layout or geometry observations', () => {
    const empty = makeWebsiteBlueprint({
      structure: {
        nodes: [],
        sectionRefs: [],
        unavailable: [],
        limitations: [],
      },
      layout: [],
      visualReferences: [],
    });
    const result = serializeLayoutSpecification(empty);
    expect(result.content).toContain('No structure observations were supplied.');
    expect(result.content).toContain('No layout observations were supplied.');
    expect(result.content).toContain('No geometry observations were supplied.');
    expect(result.content).not.toContain('ref-4');
  });
});

describe('Design Tokens CSS export', () => {
  it('reuses the existing serializer and separates inferred and unavailable data', () => {
    const withNotes = makeWebsiteBlueprint({
      designSystem: {
        ...makeDesignSystemSnapshot(),
        unavailable: ['Computed values were not readable'],
        limitations: ['Custom properties were sampled'],
      },
    });
    const result = serializeDesignTokensCss(withNotes);
    expect(result.content).toBe(serializeDesignSystemCss(withNotes.designSystem, Number.MAX_SAFE_INTEGER));
    expect(result.warnings.join(' ')).toContain('Token names are inferred suggestions');
    expect(result.warnings.join(' ')).toContain('Unavailable design token data: Computed values were not readable');
    expect(result.warnings.join(' ')).toContain('Design token limitation: Custom properties were sampled');
  });
});

describe('unsafe blueprint values', () => {
  it('rejects unsafe CSS, forbidden keys and full URLs', () => {
    const observation = blueprint.layout[0];
    if (!observation) throw new Error('Fixture layout observation is missing.');
    const unsafeCss = makeWebsiteBlueprint({
      layout: [
        {
          ...observation,
          dimensions: { ...observation.dimensions, width: 'url(https://evil.example/x)' },
        },
      ],
    });
    const forbiddenKey = { ...blueprint, title: 'secret page title' } as WebsiteBlueprint & { title: string };
    const fullUrl = makeWebsiteBlueprint({
      metadata: { ...blueprint.metadata, origin: 'https://example.com/private/path?secret=1' },
    });

    expect(isWebsiteBlueprint(unsafeCss)).toBe(false);
    expect(isWebsiteBlueprint(forbiddenKey)).toBe(false);
    expect(isWebsiteBlueprint(fullUrl)).toBe(false);
    for (const { run } of serializers) {
      expect(() => run(unsafeCss)).toThrow(TypeError);
      expect(() => run(forbiddenKey)).toThrow(TypeError);
      expect(() => run(fullUrl)).toThrow(TypeError);
    }
  });
});
