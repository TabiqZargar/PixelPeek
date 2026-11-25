import { describe, expect, it } from 'vitest';
import {
  MOTION_LIMITS,
  easingSvgPath,
  extractMotion,
  parseEasing,
  parseTimingList,
  serializeKeyframesCss,
  serializeMotionCss,
  serializeMotionJson,
  type MotionDeps,
  type ObservedAnimationRecord,
  type RawTimingRecord,
} from '../src/content/motion';
import type { MotionTarget } from '../src/shared/types';
import { makeMotionSnapshot } from './fixtures';

const target: MotionTarget = { tag: 'button', id: 'cta', classes: ['primary'], depth: 1 };
const element = {} as Element;

function style(values: Record<string, string>): CSSStyleDeclaration {
  return {
    getPropertyValue: (name: string) => values[name] ?? '',
  } as CSSStyleDeclaration;
}

function timing(overrides: Partial<RawTimingRecord> = {}): RawTimingRecord {
  return {
    duration: 1000,
    delay: 0,
    iterations: null,
    infinite: true,
    direction: 'normal',
    fill: 'none',
    easing: 'ease-in-out',
    playState: 'running',
    currentTime: 250,
    playbackRate: 1,
    ...overrides,
  };
}

function record(id: string, overrides: Partial<ObservedAnimationRecord> = {}): ObservedAnimationRecord {
  return {
    id,
    target,
    animationName: 'pulse',
    transitionProperty: null,
    timing: timing(),
    keyframes: [
      { offset: 0, declarations: [['opacity', '1']], easing: null },
      { offset: 1, declarations: [['opacity', '0.5']], easing: null },
    ],
    ...overrides,
  };
}

function deps(overrides: Partial<MotionDeps> = {}): MotionDeps {
  return {
    computedStyle: () =>
      style({
        animation: 'pulse 1000ms ease-in-out infinite',
        transition: 'opacity 200ms ease',
      }),
    readStylesheets: () => ({
      readable: 1,
      inaccessible: 1,
      keyframes: [
        {
          name: 'pulse',
          frames: [
            { keyText: 'from', declarations: [['opacity', '1']] },
            { keyText: 'to', declarations: [['opacity', '0.5']] },
          ],
        },
      ],
    }),
    readAnimations: () => [],
    readTransitionEvents: () => [],
    reducedMotion: () => true,
    interaction: () => ({ hover: true, focus: false, active: false }),
    targetMeta: () => target,
    isRelated: () => true,
    now: () => 'fixed-time',
    replayState: () => ({ isolatedActiveId: 'a1', liveRestorableIds: ['a2'] }),
    ...overrides,
  };
}

describe('motion parsing', () => {
  it('parses comma-separated timing values without multiplying values across items', () => {
    const parsed = parseTimingList('opacity 200ms ease 50ms, transform 1s linear', 'transition');
    expect(parsed.map((item) => item.name)).toEqual(['opacity', 'transform']);
    expect(parsed.map((item) => item.duration)).toEqual([200, 1000]);
    expect(parsed.map((item) => item.delay)).toEqual([50, 0]);
    expect(parsed.map((item) => item.easing)).toEqual(['ease', 'linear']);
  });

  it('parses easings and renders cubic-bezier curves', () => {
    const bezier = parseEasing('cubic-bezier(0.1, 0.2, 0.3, 0.4)');
    expect(bezier.kind).toBe('cubic-bezier');
    expect(bezier.points).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(bezier.visualizable).toBe(true);
    expect(easingSvgPath([0, 0, 1, 1])).toBe('M 0 1 C 0 1 1 0 1 0');
    expect(parseEasing('steps(4, end)')).toEqual({
      value: 'steps(4, end)',
      kind: 'steps',
      points: null,
      visualizable: false,
    });
  });
});

describe('motion extraction', () => {
  it('distinguishes CSS animations, CSS transitions and WAAPI animations', () => {
    const snapshot = extractMotion(
      element,
      deps({
        readAnimations: () => [
          record('a1'),
          record('a2', {
            animationName: null,
            transitionProperty: 'opacity',
            timing: timing({ playState: 'finished' }),
          }),
          record('a3', {
            animationName: null,
            transitionProperty: null,
            timing: timing({ easing: 'linear' }),
          }),
        ],
        readTransitionEvents: () => [
          { target: element, property: 'transform', elapsed: 42, phase: 'start', at: 'fixed-time' },
        ],
      }),
    );

    expect(snapshot.summary.animationCount).toBe(3);
    expect(snapshot.summary.cssAnimationCount).toBe(1);
    expect(snapshot.summary.waapiCount).toBe(1);
    expect(snapshot.animations.map((animation) => animation.source)).toEqual([
      'css-animation',
      'css-transition',
      'waapi',
    ]);
    expect(snapshot.transitions.map((transition) => transition.kind)).toEqual([
      'declared',
      'running',
      'observed',
    ]);
    expect(snapshot.keyframes[0]?.referenced).toBe(true);
    expect(snapshot.replay).toEqual({ isolatedActiveId: 'a1', liveRestorableIds: ['a2'] });
    expect(snapshot.interaction).toEqual({ hover: true, focus: false, active: false });
    expect(snapshot.capturedAt).toBe('fixed-time');
    expect(snapshot.limitations.join(' ')).toMatch(/inaccessible/);
  });

  it('enforces bounds on animations, frames and properties', () => {
    const snapshot = extractMotion(
      element,
      deps({
        computedStyle: () => style({ animation: '', transition: '' }),
        readStylesheets: () => ({
          readable: 1,
          inaccessible: 0,
          keyframes: Array.from({ length: 20 }, (_, index) => ({
            name: `set${index}`,
            frames: Array.from({ length: 30 }, (_, frame) => ({
              keyText: `${frame * 2}%`,
              declarations: [['opacity', '1']],
            })),
          })),
        }),
        readAnimations: () =>
          Array.from({ length: MOTION_LIMITS.animations + 10 }, (_, index) =>
            record(`a${index}`, {
              keyframes: Array.from({ length: MOTION_LIMITS.keyframesPerSet + 10 }, (_, frame) => ({
                offset: frame / 40,
                declarations: Array.from(
                  { length: MOTION_LIMITS.propertiesPerFrame + 10 },
                  (_, property) => [`prop${property}`, '1px'] as [string, string],
                ),
                easing: null,
              })),
            }),
          ),
      }),
    );

    const firstAnimation = snapshot.animations[0]!;
    const firstSet = snapshot.keyframes[0]!;
    expect(snapshot.animations).toHaveLength(MOTION_LIMITS.animations);
    expect(snapshot.keyframes).toHaveLength(MOTION_LIMITS.keyframeSets);
    expect(firstAnimation.keyframes).toHaveLength(MOTION_LIMITS.keyframesPerSet);
    expect(firstSet.keyframes).toHaveLength(MOTION_LIMITS.keyframesPerSet);
    expect(
      firstAnimation.keyframes.every(
        (frame) => frame.properties.length <= MOTION_LIMITS.propertiesPerFrame,
      ),
    ).toBe(true);
  });
});

describe('motion exports', () => {
  it('serializes sanitized keyframes and motion snapshots', () => {
    const motion = makeMotionSnapshot();
    const css = serializeMotionCss(motion, 'button');
    expect(css).toContain('/* PixelPeek reconstructed motion; verify against the page. */');
    expect(css).toContain('button {');
    expect(css).toContain('@keyframes pulse');
    expect(css).not.toContain('url(');
    expect(JSON.parse(serializeMotionJson(motion))).toEqual(motion);

    const unsafeSet = {
      ...motion.keyframes[0]!,
      name: 'pulse;injected',
      keyframes: [
        {
          ...motion.keyframes[0]!.keyframes[0]!,
          properties: [{ name: 'opacity', value: '0.5; background: url(javascript:alert(1))' }],
        },
      ],
    };
    expect(serializeKeyframesCss(unsafeSet)).toBeNull();
  });
});
