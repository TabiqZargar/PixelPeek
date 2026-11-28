import { describe, expect, it } from 'vitest';
import { serializeDesignSystemCss } from '../src/content/design-system-export';
import { isWebsiteBlueprint } from '../src/shared/messages';
import type { WebsiteBlueprint } from '../src/shared/types';
import { serializeBlueprintAgentPrompt } from '../src/panel/exports/agent-prompt';
import { serializeDesignTokensCss } from '../src/panel/exports/design-tokens';
import {
  escapeMarkdown,
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
  { id: 'blueprint-agent-prompt', run: serializeBlueprintAgentPrompt },
] as const;

const markdownSerializers = [
  serializeImplementationBrief,
  serializeComponentInventory,
  serializeLayoutSpecification,
  serializeBlueprintAgentPrompt,
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
    expect(JSON.parse(result.content)).toEqual(blueprint);
  });

  it('preserves every legitimate field in a fully populated blueprint', () => {
    const populated = makeWebsiteBlueprint({
      motion: {
        ...blueprint.motion,
        summary: {
          ...blueprint.motion.summary,
          animationCount: 1,
          cssAnimationCount: 1,
          runningCount: 1,
          animatedProperties: ['opacity'],
        },
        observations: [{
          ref: 'ref-4',
          targetRef: 'ref-2',
          source: 'css-animation',
          category: 'button',
          role: 'button',
          name: 'pulse',
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
          properties: [{ name: 'opacity', value: '0.5' }],
          evidence: [{ source: 'motion-event', status: 'detected', note: 'observed' }],
          unavailable: [],
          limitations: [],
        }],
        easings: [{
          value: 'ease-in-out',
          kind: 'keyword',
          points: [0.42, 0, 0.58, 1],
          visualizable: true,
        }],
      },
    });
    const parsed = JSON.parse(serializeBlueprintJson(populated).content);
    expect(parsed).toEqual(populated);
    expect(parsed.motion.observations).toEqual(populated.motion.observations);
    expect(parsed.motion.easings).toEqual(populated.motion.easings);
    const token = populated.designSystem.tokens[0];
    if (!token) throw new Error('Fixture token is missing.');
    expect(parsed.designSystem.tokens[0].detected.exemplars).toEqual(token.detected.exemplars);
  });

  it('allowlisted serialization strips unknown top-level and nested fields without mutating input', () => {
    const withUnknown = {
      ...blueprint,
      bodyText: 'private page text',
      arbitraryNote: 'stripped metadata',
      components: blueprint.components.map((component) => ({
        ...component,
        examples: component.examples.map((example) => ({
          ...example,
          hiddenNested: 'nested secret',
        })),
      })),
    } as WebsiteBlueprint & { bodyText: string; arbitraryNote: string };
    const before = JSON.stringify(withUnknown);
    const result = serializeBlueprintJson(withUnknown);
    const parsed = JSON.parse(result.content);

    expect(JSON.stringify(withUnknown)).toBe(before);
    expect(parsed).toEqual(blueprint);
    expect(result.content).not.toContain('bodyText');
    expect(result.content).not.toContain('arbitraryNote');
    expect(result.content).not.toContain('private page text');
    expect(result.content).not.toContain('hiddenNested');
    expect(result.content).not.toContain('nested secret');
  });

  it('rejects malformed known fields and forbidden or URL-bearing unknown fields', () => {
    const malformed = makeWebsiteBlueprint({
      metadata: {
        ...blueprint.metadata,
        viewport: { ...blueprint.metadata.viewport, width: Number.NaN },
      },
    });
    const forbidden = {
      ...blueprint,
      innerText: 'private page text',
      textContent: 'private page text',
      sourceUrl: 'https://evil.example/tracker?token=abc',
      designSystem: {
        ...blueprint.designSystem,
        screenshot: 'data:image/png;base64,AAAA',
      },
    } as WebsiteBlueprint & Record<string, unknown>;

    expect(isWebsiteBlueprint(malformed)).toBe(false);
    expect(isWebsiteBlueprint(forbidden)).toBe(false);
    expect(() => serializeBlueprintJson(malformed)).toThrow(TypeError);
    for (const { run } of serializers) {
      expect(() => run(forbidden)).toThrow(TypeError);
    }
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

  it('separates unavailable observations from known limitations', () => {
    const mixed = makeWebsiteBlueprint({
      structure: {
        ...blueprint.structure,
        unavailable: ['Landmark labels were not readable'],
        limitations: ['DOM sampling was partial'],
      },
    });
    const content = serializeLayoutSpecification(mixed).content;
    const unavailableStart = content.indexOf('## Unavailable observations');
    const limitationsStart = content.indexOf('## Limitations');
    const unavailableSection = content.slice(unavailableStart, limitationsStart);
    const limitationsSection = content.slice(limitationsStart);

    expect(unavailableStart).toBeGreaterThan(-1);
    expect(limitationsStart).toBeGreaterThan(unavailableStart);
    expect(unavailableSection).toContain('Landmark labels were not readable');
    expect(unavailableSection).not.toContain('DOM sampling was partial');
    expect(limitationsSection).toContain('DOM sampling was partial');
    expect(limitationsSection).not.toContain('Landmark labels were not readable');
  });

  it('handles empty unavailable and limitation sections consistently', () => {
    const empty = makeWebsiteBlueprint({
      components: [],
      layout: [],
      visualReferences: [],
      structure: {
        nodes: [],
        sectionRefs: [],
        unavailable: [],
        limitations: [],
      },
      designSystem: {
        ...blueprint.designSystem,
        unavailable: [],
        limitations: [],
      },
      motion: {
        ...blueprint.motion,
        unavailable: [],
        limitations: [],
      },
      evidence: {
        items: [],
        unavailable: [],
        limitations: [],
      },
    });
    const content = serializeLayoutSpecification(empty).content;
    const unavailableStart = content.indexOf('## Unavailable observations');
    const limitationsStart = content.indexOf('## Limitations');
    const unavailableSection = content.slice(unavailableStart, limitationsStart);
    const limitationsSection = content.slice(limitationsStart);

    expect(unavailableSection).toContain('- none reported');
    expect(limitationsSection).toContain('- none reported');
    expect(unavailableSection).not.toContain('## Limitations');
    expect(limitationsSection).not.toContain('Unavailable data');
  });
});

describe('Markdown escaping across serializers', () => {
  const injection = 'A *bold* _note_ `code` [label](https://example.com/x) #tag | pipe';
  const adversarial = makeWebsiteBlueprint({
    structure: {
      ...blueprint.structure,
      nodes: blueprint.structure.nodes.map((node) => ({
        ...node,
        evidence: [{ source: 'sampling', status: 'inferred', note: injection }],
        unavailable: [injection],
        limitations: [injection],
      })),
    },
    components: blueprint.components.map((component) => ({
      ...component,
      evidence: [{ source: 'sampling', status: 'inferred', note: injection }],
      unavailable: [injection],
      limitations: [injection],
    })),
    evidence: {
      ...blueprint.evidence,
      unavailable: [injection],
      limitations: [injection],
    },
    motion: {
      ...blueprint.motion,
      unavailable: [injection],
      limitations: [injection],
    },
    responsive: {
      ...blueprint.responsive,
      unobservedBreakpoints: [injection],
    },
    designSystem: {
      ...blueprint.designSystem,
      unavailable: [injection],
      limitations: [injection],
    },
  });
  const once = escapeMarkdown(injection);
  const twice = escapeMarkdown(once);

  it('escapes Markdown syntax exactly once in every Markdown serializer', () => {
    for (const run of markdownSerializers) {
      const content = run(adversarial).content;
      expect(content).toContain(once);
      expect(content).not.toContain(twice);
      expect(content).not.toContain('[label](');
      expect(content).not.toContain('*bold*');
      expect(content).not.toContain('`code`');
    }
  });

  it('normalizes line breaks and escapes link and table syntax', () => {
    expect(escapeMarkdown('first\nsecond')).toBe('first second');
    expect(escapeMarkdown('[a](b) | #c')).toBe('\\[a\\](b) \\| \\#c');
  });
});

describe('export privacy', () => {
  it('strips benign unknown properties from every public format', () => {
    const withUnknown = {
      ...blueprint,
      bodyText: 'private page text',
      arbitraryAttribute: 'secret attribute',
      designSystem: {
        ...blueprint.designSystem,
        nestedAttribute: 'nested attribute',
      },
    } as WebsiteBlueprint & Record<string, unknown>;

    for (const { run } of serializers) {
      const content = run(withUnknown).content;
      expect(content).not.toContain('bodyText');
      expect(content).not.toContain('private page text');
      expect(content).not.toContain('arbitraryAttribute');
      expect(content).not.toContain('secret attribute');
      expect(content).not.toContain('nestedAttribute');
      expect(content).not.toContain('nested attribute');
    }
  });

  it('rejects forbidden page content, form values and executable assets in every public format', () => {
    const unsafe = {
      ...blueprint,
      innerText: 'private page text',
      textContent: 'private page text',
      formValue: 'secret input',
      screenshot: 'data:image/png;base64,AAAA',
      href: 'https://evil.example/tracker',
      fullUrl: 'https://example.com/private?token=abc#fragment',
    } as WebsiteBlueprint & Record<string, unknown>;

    for (const { run } of serializers) {
      expect(() => run(unsafe)).toThrow(TypeError);
    }
  });

  it('keeps provenance to the origin where the format carries provenance', () => {
    for (const { id, run } of serializers) {
      const content = run(blueprint).content;
      if (['blueprint-json', 'implementation-brief', 'component-inventory'].includes(id)) {
        expect(content).toContain('https://example.com');
      }
      expect(content).not.toContain('/checkout');
      expect(content).not.toContain('?token=');
      expect(content).not.toContain('#fragment');
      expect(content).not.toContain('<script');
    }
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

  it('rejects oversized output instead of silently truncating', () => {
    const maxChars = serializeDesignTokensCss(blueprint).content.length - 1;
    expect(maxChars).toBeGreaterThan(0);
    expect(() => serializeDesignTokensCss(blueprint, { maxChars })).toThrow(RangeError);
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
