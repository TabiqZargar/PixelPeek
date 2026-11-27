import { describe, expect, it } from 'vitest';
import {
  MessageType,
  isContentEvent,
  isDesignSystemSnapshot,
  isMotionSnapshot,
  isPanelEvent,
  isPanelRequest,
  isRequestResult,
  isRuntimeErrorPayload,
  isWebsiteBlueprint,
  isWebsiteBlueprintRequest,
} from '../src/shared/messages';
import { BLUEPRINT_LIMITS, type WebsiteBlueprint } from '../src/shared/types';
import {
  makeDesignSystemSnapshot,
  makeMotionSnapshot,
  makeWebsiteBlueprint,
} from './fixtures';

function minimalDesignSystem() {
  return makeDesignSystemSnapshot({
    detected: { palette: [], typography: [], spacing: [], effects: [], gradients: [] },
    tokens: [],
    unavailable: [],
    limitations: [],
  });
}

describe('Phase 5 website blueprint contracts', () => {
  it('accepts a valid minimal blueprint', () => {
    const blueprint = makeWebsiteBlueprint({
      metadata: {
        schemaVersion: '1.0',
        capturedAt: '2026-01-01T00:00:00.000Z',
        requestId: 'bp-minimal',
        origin: 'https://example.com',
        viewport: { width: 1024, height: 768, devicePixelRatio: 1 },
        document: {
          language: null,
          colorScheme: null,
          documentWidth: 1024,
          documentHeight: 768,
          scrollWidth: 1024,
          scrollHeight: 768,
        },
        status: 'unavailable',
        truncation: { truncated: false, reasons: [], limitsReached: [] },
      },
      refs: [],
      structure: { nodes: [], sectionRefs: [], unavailable: [], limitations: [] },
      components: [],
      layout: [],
      designSystem: minimalDesignSystem(),
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
        unavailable: ['Motion was unavailable during capture'],
        limitations: [],
      },
      visualReferences: [],
      evidence: { items: [], unavailable: [], limitations: [] },
    });

    expect(isWebsiteBlueprint(blueprint)).toBe(true);
  });

  it('accepts a valid populated blueprint and its message envelopes', () => {
    const blueprint = makeWebsiteBlueprint();
    const request = {
      type: MessageType.ExtractWebsiteBlueprint,
      requestId: 'bp-1',
    };

    expect(isWebsiteBlueprint(blueprint)).toBe(true);
    expect(isWebsiteBlueprintRequest(request)).toBe(true);
    expect(isPanelRequest(request)).toBe(true);
    expect(isPanelEvent({ type: MessageType.BlueprintChanged, payload: blueprint })).toBe(true);
    expect(isContentEvent({ type: MessageType.BlueprintChanged, payload: blueprint })).toBe(true);
  });

  it('accepts partial and truncated blueprints without treating them as failures', () => {
    const base = makeWebsiteBlueprint();
    const partial = makeWebsiteBlueprint({
      metadata: {
        ...base.metadata,
        status: 'partial',
        truncation: {
          truncated: true,
          reasons: ['Element limit reached'],
          limitsReached: ['maxBlueprintElements'],
        },
      },
      components: [],
      evidence: {
        items: [{ source: 'unavailable', status: 'unknown', note: 'Components were not sampled' }],
        unavailable: ['Components were not sampled'],
        limitations: ['Partial result'],
      },
    });

    expect(isWebsiteBlueprint(partial)).toBe(true);
    expect(partial.metadata.truncation.truncated).toBe(true);
  });

  it('rejects invalid origins and request IDs', () => {
    const base = makeWebsiteBlueprint();
    const badOrigin = makeWebsiteBlueprint({
      metadata: { ...base.metadata, origin: 'https://example.com/page?secret=1' },
    });
    const badRequestId = makeWebsiteBlueprint({
      metadata: { ...base.metadata, requestId: 'x'.repeat(BLUEPRINT_LIMITS.maxNameLength + 1) },
    });
    const emptyRequestId = makeWebsiteBlueprint({
      metadata: { ...base.metadata, requestId: '' },
    });

    expect(isWebsiteBlueprint(badOrigin)).toBe(false);
    expect(isWebsiteBlueprint(badRequestId)).toBe(false);
    expect(isWebsiteBlueprint(emptyRequestId)).toBe(false);
    expect(isWebsiteBlueprintRequest({ type: MessageType.ExtractWebsiteBlueprint, requestId: '' })).toBe(false);
    expect(isWebsiteBlueprintRequest({
      type: MessageType.ExtractWebsiteBlueprint,
      requestId: 'x'.repeat(BLUEPRINT_LIMITS.maxNameLength + 1),
    })).toBe(false);
  });

  it('rejects invalid evidence sources and statuses', () => {
    const badSource = makeWebsiteBlueprint({
      evidence: {
        items: [{ source: 'guesswork', status: 'detected', note: null }] as unknown as WebsiteBlueprint['evidence']['items'],
        unavailable: [],
        limitations: [],
      },
    });
    const badStatus = makeWebsiteBlueprint({
      evidence: {
        items: [{ source: 'sampling', status: 'certain', note: null }] as unknown as WebsiteBlueprint['evidence']['items'],
        unavailable: [],
        limitations: [],
      },
    });

    expect(isWebsiteBlueprint(badSource)).toBe(false);
    expect(isWebsiteBlueprint(badStatus)).toBe(false);
  });

  it('rejects oversized arrays and strings', () => {
    const base = makeWebsiteBlueprint();
    const oversizedRefs = Array.from({ length: BLUEPRINT_LIMITS.maxRefs + 1 }, (_, index) => ({
      ref: `ref-${index + 1}`,
      category: 'region' as const,
    }));
    const oversizedEvidence = Array.from(
      { length: BLUEPRINT_LIMITS.maxEvidenceItemsPerObservation + 1 },
      () => ({ source: 'sampling' as const, status: 'detected' as const, note: null }),
    );
    const oversizedLimitations = Array.from(
      { length: BLUEPRINT_LIMITS.maxLimitations + 1 },
      () => 'limit',
    );

    expect(isWebsiteBlueprint(makeWebsiteBlueprint({ refs: oversizedRefs }))).toBe(false);
    expect(isWebsiteBlueprint(makeWebsiteBlueprint({
      structure: {
        ...base.structure,
        nodes: Array.from({ length: BLUEPRINT_LIMITS.maxStructureNodes + 1 }, (_, index) => ({
          ...base.structure.nodes[0]!,
          ref: `ref-${index + 1}`,
          parentRef: null,
          childRefs: [],
        })),
      },
    }))).toBe(false);
    expect(isWebsiteBlueprint(makeWebsiteBlueprint({
      components: Array.from({ length: BLUEPRINT_LIMITS.maxComponents + 1 }, (_, index) => ({
        ...base.components[0]!,
        ref: `ref-${index + 1}`,
        sectionRefs: [],
      })),
    }))).toBe(false);
    expect(isWebsiteBlueprint(makeWebsiteBlueprint({
      components: [{
        ...base.components[0]!,
        evidence: oversizedEvidence,
      }],
    }))).toBe(false);
    expect(isWebsiteBlueprint(makeWebsiteBlueprint({
      evidence: { items: [], unavailable: [], limitations: oversizedLimitations },
    }))).toBe(false);
    expect(isWebsiteBlueprint(makeWebsiteBlueprint({
      components: [{
        ...base.components[0]!,
        examples: [{
          ...base.components[0]!.examples[0]!,
          selectorHint: 'x'.repeat(BLUEPRINT_LIMITS.maxSelectorLength + 1),
        }],
      }],
    }))).toBe(false);
    expect(isWebsiteBlueprint(makeWebsiteBlueprint({
      layout: [{
        ...base.layout[0]!,
        dimensions: {
          ...base.layout[0]!.dimensions,
          width: 'x'.repeat(BLUEPRINT_LIMITS.maxValueLength + 1),
        },
      }],
    }))).toBe(false);
  });

  it('enforces the total serialized payload limit', () => {
    const base = makeWebsiteBlueprint();
    const longNote = 'x'.repeat(BLUEPRINT_LIMITS.maxValueLength);
    const nodes = Array.from({ length: BLUEPRINT_LIMITS.maxStructureNodes }, (_, index) => ({
      ...base.structure.nodes[0]!,
      ref: `ref-${index + 1}`,
      parentRef: null,
      childRefs: [],
      unavailable: Array.from({ length: BLUEPRINT_LIMITS.maxUnavailable }, () => longNote),
    }));
    const oversized = makeWebsiteBlueprint({
      refs: nodes.map((node) => ({ ref: node.ref, category: 'region' as const })),
      structure: { nodes, sectionRefs: [], unavailable: [], limitations: [] },
      components: [],
      layout: [],
      visualReferences: [],
      evidence: { items: [], unavailable: [], limitations: [] },
    });

    expect(JSON.stringify(oversized).length).toBeGreaterThan(BLUEPRINT_LIMITS.maxPayloadChars);
    expect(isWebsiteBlueprint(oversized)).toBe(false);
  });

  it('rejects invalid local references', () => {
    const base = makeWebsiteBlueprint();
    const badPattern = makeWebsiteBlueprint({
      refs: [{ ref: '#secret', category: 'region' }],
      structure: {
        ...base.structure,
        nodes: [{ ...base.structure.nodes[0]!, ref: '#secret', childRefs: [] }],
        sectionRefs: [],
      },
      components: [],
      layout: [],
      visualReferences: [],
    });
    const duplicates = makeWebsiteBlueprint({
      refs: [
        { ref: 'ref-1', category: 'region' },
        { ref: 'ref-1', category: 'section' },
      ],
    });

    expect(isWebsiteBlueprint(badPattern)).toBe(false);
    expect(isWebsiteBlueprint(duplicates)).toBe(false);
  });

  it('rejects invalid parent and child relationships', () => {
    const base = makeWebsiteBlueprint();
    const unknownParent = makeWebsiteBlueprint({
      structure: {
        ...base.structure,
        nodes: base.structure.nodes.map((node) =>
          node.ref === 'ref-2' ? { ...node, parentRef: 'ref-999' } : node,
        ),
      },
    });
    const mismatchedChild = makeWebsiteBlueprint({
      structure: {
        ...base.structure,
        nodes: base.structure.nodes.map((node) =>
          node.ref === 'ref-2' ? { ...node, parentRef: null } : node,
        ),
      },
    });
    const cycle = makeWebsiteBlueprint({
      structure: {
        ...base.structure,
        nodes: base.structure.nodes.map((node) =>
          node.ref === 'ref-1' ? { ...node, parentRef: 'ref-2' } : node,
        ),
      },
    });

    expect(isWebsiteBlueprint(unknownParent)).toBe(false);
    expect(isWebsiteBlueprint(mismatchedChild)).toBe(false);
    expect(isWebsiteBlueprint(cycle)).toBe(false);
  });

  it('rejects forbidden page content and executable fields', () => {
    const base = makeWebsiteBlueprint();
    const withText = { ...base, innerText: 'private page text' };
    const withFullUrl = makeWebsiteBlueprint({
      metadata: { ...base.metadata, fullUrl: 'https://example.com/private?token=abc' } as typeof base.metadata,
    });
    const withPlaceholder = makeWebsiteBlueprint({
      components: [{
        ...base.components[0]!,
        examples: [{ ...base.components[0]!.examples[0]!, placeholder: 'secret' }],
      } as unknown as WebsiteBlueprint['components'][number]],
    });
    const withScreenshot = makeWebsiteBlueprint({
      visualReferences: [{
        ...base.visualReferences[0]!,
        screenshot: 'base64-image',
      } as unknown as WebsiteBlueprint['visualReferences'][number]],
    });
    const withReplay = makeWebsiteBlueprint({
      motion: { ...base.motion, replayable: true } as unknown as WebsiteBlueprint['motion'],
    });

    expect(isWebsiteBlueprint(withText)).toBe(false);
    expect(isWebsiteBlueprint(withFullUrl)).toBe(false);
    expect(isWebsiteBlueprint(withPlaceholder)).toBe(false);
    expect(isWebsiteBlueprint(withScreenshot)).toBe(false);
    expect(isWebsiteBlueprint(withReplay)).toBe(false);
  });

  it('rejects unbounded and unsafe CSS descriptors', () => {
    const base = makeWebsiteBlueprint();
    const unsafeCss = makeWebsiteBlueprint({
      layout: [{
        ...base.layout[0]!,
        dimensions: { ...base.layout[0]!.dimensions, width: 'url(secret)' },
      }],
    });
    const unknownRole = makeWebsiteBlueprint({
      structure: {
        ...base.structure,
        nodes: base.structure.nodes.map((node) =>
          node.ref === 'ref-2' ? { ...node, role: 'heading-label' } : node,
        ) as unknown as WebsiteBlueprint['structure']['nodes'],
      },
    });
    const unknownCategory = makeWebsiteBlueprint({
      structure: {
        ...base.structure,
        nodes: base.structure.nodes.map((node) =>
          node.ref === 'ref-2' ? { ...node, category: 'hero' } : node,
        ) as unknown as WebsiteBlueprint['structure']['nodes'],
      },
    });

    expect(isWebsiteBlueprint(unsafeCss)).toBe(false);
    expect(isWebsiteBlueprint(unknownRole)).toBe(false);
    expect(isWebsiteBlueprint(unknownCategory)).toBe(false);
  });

  it('rejects malformed message envelopes', () => {
    const base = makeWebsiteBlueprint();
    expect(isPanelRequest({ type: MessageType.ExtractWebsiteBlueprint })).toBe(false);
    expect(isPanelRequest({ type: 'pixelpeek/unknown', requestId: 'bp-1' })).toBe(false);
    expect(isPanelEvent({ type: MessageType.BlueprintChanged })).toBe(false);
    expect(isPanelEvent({ type: MessageType.BlueprintChanged, payload: {} })).toBe(false);
    expect(isContentEvent({ type: MessageType.BlueprintChanged, payload: base })).toBe(true);
    const circular = makeWebsiteBlueprint() as unknown as Record<string, unknown>;
    circular.self = circular;
    expect(isWebsiteBlueprint(circular)).toBe(false);
    expect(isRequestResult({ ok: true })).toBe(true);
    expect(isRequestResult({
      ok: false,
      error: 'Blueprint extraction failed',
      errorCode: 'website-blueprint-extraction-failed',
    })).toBe(true);
  });

  it('preserves design-system, motion, and runtime-error contracts', () => {
    expect(isDesignSystemSnapshot(makeDesignSystemSnapshot())).toBe(true);
    expect(isMotionSnapshot(makeMotionSnapshot())).toBe(true);
    expect(isPanelEvent({
      type: MessageType.DesignSystemChanged,
      payload: makeDesignSystemSnapshot(),
    })).toBe(true);
    expect(isPanelRequest({ type: MessageType.ReplayMotion, action: 'isolated-start' })).toBe(true);
    expect(isRuntimeErrorPayload({
      source: 'design-system',
      message: 'failed',
      requestId: 'ds-1',
    })).toBe(true);
    expect(isRuntimeErrorPayload({
      source: 'website-blueprint',
      message: 'failed',
      requestId: 'bp-1',
    })).toBe(true);
    expect(isRuntimeErrorPayload({ source: 'website-blueprint', message: 'failed' })).toBe(false);
  });
});
