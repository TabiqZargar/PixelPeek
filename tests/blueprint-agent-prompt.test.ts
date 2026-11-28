import { describe, expect, it } from 'vitest';
import { serializeBlueprintAgentPrompt } from '../src/panel/exports/agent-prompt';
import { EXPORT_FORMATS, EXPORT_LIMITS } from '../src/panel/exports/types';
import { isWebsiteBlueprint } from '../src/shared/messages';
import type { WebsiteBlueprint } from '../src/shared/types';
import { makeBlueprintEvidence, makeWebsiteBlueprint } from './fixtures';

const blueprint = makeWebsiteBlueprint();

const requiredSections = [
  '## 1. Role and objective',
  '## 2. Implementation instructions',
  '## 3. Page structure',
  '## 4. Layout',
  '## 5. Design system',
  '## 6. Motion',
  '## 7. Responsive behavior',
  '## 8. Evidence and uncertainty',
  '## 9. Privacy and safety',
  '## 10. Deliverables and verification',
];

describe('serializeBlueprintAgentPrompt', () => {
  it('generates a valid ExportResult with deterministic content', () => {
    const result = serializeBlueprintAgentPrompt(blueprint);
    expect(result).toEqual(serializeBlueprintAgentPrompt(blueprint));
    expect(result.id).toBe('blueprint-agent-prompt');
    expect(result.filename).toBe(EXPORT_FORMATS['blueprint-agent-prompt'].filename);
    expect(result.mimeType).toBe(EXPORT_FORMATS['blueprint-agent-prompt'].mimeType);
    expect(result.charCount).toBe(result.content.length);
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.content.length).toBeLessThanOrEqual(EXPORT_LIMITS.maxOutputChars);
    expect(result.content).toContain('# Blueprint Implementation Prompt');
  });

  it('rejects invalid blueprints before serialization', () => {
    expect(() => serializeBlueprintAgentPrompt(null)).toThrow(TypeError);
    expect(() => serializeBlueprintAgentPrompt({})).toThrow(TypeError);
    expect(() => serializeBlueprintAgentPrompt({ ...blueprint, refs: 'invalid' })).toThrow(TypeError);
  });

  it('includes all required prompt sections in stable order', () => {
    const content = serializeBlueprintAgentPrompt(blueprint).content;
    let previous = -1;
    for (const heading of requiredSections) {
      const index = content.indexOf(heading);
      expect(index).toBeGreaterThan(-1);
      expect(index).toBeGreaterThan(previous);
      previous = index;
    }
  });

  it('reports structure and component evidence without inventing details', () => {
    const content = serializeBlueprintAgentPrompt(blueprint).content;
    expect(content).toContain('Preserve only the parent/child and section relationships supported by the blueprint.');
    expect(content).toContain('Do not invent missing sections or components.');
    expect(content).toContain('ref-1 · region · banner · role banner · parent not observed · children ref-2');
    expect(content).toContain('ref-2 · section · main');
    expect(content).toContain('geometry (detected)');
    expect(content).toContain('Category was inferred from structure');
    expect(content).toContain('ref-3 · button · occurrences 2');
    expect(content).toContain('selector hint button.card');
    expect(content).toContain('computed-style (detected)');
  });

  it('preserves detected values and labels inferred token names as suggestions', () => {
    const content = serializeBlueprintAgentPrompt(blueprint).content;
    expect(content).toContain('Preserve the distinction between detected values and inferred token names.');
    expect(content).toContain('Treat inferred token names as suggestions, not confirmed facts.');
    expect(content).toContain('Detected values:');
    expect(content).toContain('rgb(139, 109, 255) (2 uses)');
    expect(content).toContain('Inferred token candidates:');
    expect(content).toContain('--accent-purple · color · support 2 · basis heuristic');
  });

  it('states missing observations and unavailable fields explicitly', () => {
    const empty = makeWebsiteBlueprint({
      structure: { nodes: [], sectionRefs: [], unavailable: [], limitations: [] },
      components: [],
      layout: [],
      visualReferences: [],
      evidence: {
        ...makeBlueprintEvidence(),
        unavailable: ['Structure observations were not supplied.'],
      },
    });
    const content = serializeBlueprintAgentPrompt(empty).content;
    expect(content).toContain('No structure observations were supplied.');
    expect(content).toContain('No component observations were supplied.');
    expect(content).toContain('No layout observations were supplied.');
    expect(content).toContain('No visual geometry observations were supplied.');
    expect(content).toContain('Unavailable data:');
    expect(content).toContain('Structure observations were not supplied.');
    expect(content).not.toContain('ref-3');
  });

  it('includes motion and responsive limitations without extrapolating them', () => {
    const content = serializeBlueprintAgentPrompt(blueprint).content;
    expect(content).toContain('Do not invent animations or interaction behavior.');
    expect(content).toContain('Motion was not active during capture');
    expect(content).toContain('Observed motion is time dependent');
    expect(content).toContain('Use only captured responsive evidence.');
    expect(content).toContain('smaller breakpoints were not observed');
    expect(content).toContain('hover and focus states were not observed');
    expect(content).toContain('Do not extrapolate unobserved breakpoints or viewport states.');
  });

  it('includes truncation notices and uncertainty instructions', () => {
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
    });
    const result = serializeBlueprintAgentPrompt(partial);
    expect(result.content).toContain('Ask before making consequential assumptions.');
    expect(result.content).toContain('Truncated: yes');
    expect(result.content).toContain('node limit was reached');
    expect(result.content).toContain('maxNodes');
    expect(result.warnings.join(' ')).toContain('node limit was reached');
  });

  it('never emits excluded source data or full URLs', () => {
    const content = serializeBlueprintAgentPrompt(blueprint).content;
    expect(content).not.toContain('https://');
    expect(content).not.toContain('example.com');
    expect(content).not.toContain('/checkout');
    expect(content).not.toContain('?secret');
    expect(content).not.toContain('#fragment');
    expect(content).not.toContain('href=');
    expect(content).not.toContain('src=');
    expect(content).not.toContain('<img');
    expect(content).not.toContain('Secret page title');

    const forbidden = {
      ...blueprint,
      title: 'Secret page title',
      text: 'Secret body text',
      formValue: 'secret-value',
      href: 'https://evil.example/path',
      screenshotPath: '/tmp/secret.png',
    } as unknown as WebsiteBlueprint;
    expect(isWebsiteBlueprint(forbidden)).toBe(false);
    expect(() => serializeBlueprintAgentPrompt(forbidden)).toThrow(TypeError);
  });

  it('escapes Markdown-sensitive blueprint text', () => {
    const [first, second] = blueprint.structure.nodes;
    if (!first || !second) throw new Error('Fixture structure nodes are missing.');
    const note = 'Risk *marker* `code` [label] #tag | pipe';
    const marked = makeWebsiteBlueprint({
      structure: {
        ...blueprint.structure,
        nodes: [
          {
            ...first,
            evidence: [{ source: 'sampling', status: 'inferred', note }],
          },
          second,
        ],
      },
    });
    const content = serializeBlueprintAgentPrompt(marked).content;
    expect(content).toContain('Risk \\*marker\\* \\`code\\` \\[label\\] \\#tag \\| pipe');
    expect(content).not.toContain(note);
  });

  it('rejects oversized output instead of truncating it', () => {
    expect(() => serializeBlueprintAgentPrompt(blueprint, { maxChars: 10 })).toThrow(RangeError);
    expect(() => serializeBlueprintAgentPrompt(blueprint, { maxChars: 0 })).toThrow(RangeError);
    expect(() => serializeBlueprintAgentPrompt(blueprint, { maxChars: Number.NaN })).toThrow(RangeError);
  });

  it('does not claim unsupported fidelity or completeness', () => {
    const content = serializeBlueprintAgentPrompt(blueprint).content;
    expect(content).toContain('Do not claim pixel-perfect fidelity');
    expect(content).not.toContain('The result is pixel-perfect');
    expect(content).toContain('not as a complete specification');
    expect(content).toContain('Provide an implementation summary.');
    expect(content).toContain('List assumptions and unresolved details that require confirmation.');
    expect(content).toContain('Report test and build results.');
    expect(content).toContain('Distinguish implemented behavior from approximations');
  });
});
