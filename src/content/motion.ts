import type {
  EasingInfo,
  MotionAnimation,
  MotionKeyframe,
  MotionKeyframeProperty,
  MotionKeyframes,
  MotionSnapshot,
  MotionSource,
  MotionTarget,
  MotionTiming,
  MotionTransition,
} from '../shared/types';
import { sanitizeCssValue } from './css';

export const MOTION_LIMITS = {
  animations: 24,
  keyframeSets: 12,
  keyframesPerSet: 24,
  propertiesPerFrame: 12,
  transitions: 24,
  easings: 12,
  animatedProperties: 24,
  stylesheetRules: 240,
  stylesheetDepth: 3,
  descendantNodes: 48,
  descendantDepth: 3,
  transitionEvents: 24,
} as const;

export interface DeclaredKeyframeRecord {
  name: string;
  frames: Array<{ keyText: string; declarations: Array<[string, string]> }>;
}

export interface StylesheetReadResult {
  readable: number;
  inaccessible: number;
  keyframes: DeclaredKeyframeRecord[];
}

export interface RawKeyframeRecord {
  offset: number | null;
  declarations: Array<[string, string]>;
  easing: string | null;
}

export interface RawTimingRecord {
  duration: number | null;
  delay: number | null;
  iterations: number | null;
  infinite: boolean;
  direction: string | null;
  fill: string | null;
  easing: string | null;
  playState: string | null;
  currentTime: number | null;
  playbackRate: number | null;
}

export interface ObservedAnimationRecord {
  id: string;
  target: MotionTarget;
  animationName: string | null;
  transitionProperty: string | null;
  timing: RawTimingRecord;
  keyframes: RawKeyframeRecord[];
}

export interface TransitionEventRecord {
  target: Element;
  property: string;
  elapsed: number;
  phase: 'run' | 'start' | 'end' | 'cancel';
  at: string;
}

export interface MotionDeps {
  computedStyle: (element: Element) => CSSStyleDeclaration;
  readStylesheets: () => StylesheetReadResult;
  readAnimations: (element: Element) => ObservedAnimationRecord[];
  readTransitionEvents: () => TransitionEventRecord[];
  reducedMotion: () => boolean;
  interaction: (element: Element) => { hover: boolean; focus: boolean; active: boolean };
  targetMeta: (element: Element) => MotionTarget;
  isRelated: (element: Element) => boolean;
  now: () => string;
  replayState: () => { isolatedActiveId: string | null; liveRestorableIds: string[] };
}

export interface ParsedTimingItem {
  rawText: string;
  name: string | null;
  duration: number | null;
  delay: number | null;
  easing: string | null;
  iterations: number | null;
  infinite: boolean;
  direction: string | null;
  fill: string | null;
  playState: string | null;
}

const KEYWORD_POINTS: Record<string, [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

const DIRECTIONS = new Set(['normal', 'reverse', 'alternate', 'alternate-reverse']);
const FILLS = new Set(['none', 'forwards', 'backwards', 'both']);
const PLAY_STATES = new Set(['running', 'paused']);

function round(value: number, places = 1): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function clampTime(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return round(Math.max(-600000, Math.min(600000, value)));
}

export function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(-?(?:\d+(?:\.\d+)?|\.\d+))\s*(ms|s)?$/i.exec(value.trim());
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  return match[2]?.toLowerCase() === 'ms' ? amount : amount * 1000;
}

function splitOutsideParens(value: string, separator: string | RegExp): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  const isSeparator = (character: string) =>
    typeof separator === 'string' ? character === separator : separator.test(character);

  for (const character of value) {
    if (quote) {
      current += character;
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      current += character;
      continue;
    }
    if (character === '(') depth += 1;
    if (character === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && isSeparator(character)) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function isEasingToken(token: string): boolean {
  const lower = token.toLowerCase();
  return (
    lower in KEYWORD_POINTS ||
    lower.startsWith('cubic-bezier(') ||
    lower.startsWith('steps(') ||
    lower.startsWith('linear(')
  );
}

export function parseTimingList(raw: string | null, kind: 'animation' | 'transition'): ParsedTimingItem[] {
  const source = sanitizeCssValue(raw);
  if (!source) return [];
  const segments = splitOutsideParens(source, ',');
  const parsed = segments.map((segment) => {
    const tokens = splitOutsideParens(segment, /\s/);
    const times: number[] = [];
    const easings: string[] = [];
    const names: string[] = [];
    const iterations: number[] = [];
    let direction: string | null = null;
    let fill: string | null = null;
    let playState: string | null = null;

    for (const token of tokens) {
      const lower = token.toLowerCase();
      const time = parseTime(token);
      if (time !== null) {
        times.push(time);
      } else if (isEasingToken(token)) {
        easings.push(token);
      } else if (lower === 'infinite') {
        iterations.push(Number.POSITIVE_INFINITY);
      } else if (/^\d+(?:\.\d+)?$/.test(lower) && kind === 'animation') {
        iterations.push(Number(lower));
      } else if (DIRECTIONS.has(lower)) {
        direction = lower;
      } else if (FILLS.has(lower)) {
        fill = lower;
      } else if (PLAY_STATES.has(lower)) {
        playState = lower;
      } else {
        names.push(token);
      }
    }

    return {
      rawText: segment,
      names,
      times,
      easings,
      iterations,
      direction,
      fill,
      playState,
    };
  });

  return parsed.map((item) => {
    const iteration = item.iterations[0] ?? null;
    return {
      rawText: item.rawText,
      name: item.names[0] ?? null,
      duration: clampTime(item.times[0] ?? null),
      delay: clampTime(item.times[1] ?? 0) ?? 0,
      easing: item.easings[0] ?? null,
      iterations: iteration === Number.POSITIVE_INFINITY ? null : iteration,
      infinite: iteration === Number.POSITIVE_INFINITY,
      direction: item.direction,
      fill: item.fill,
      playState: item.playState,
    };
  });
}

export function parseEasing(value: string | null | undefined): EasingInfo {
  const raw = value?.trim() ?? '';
  if (!raw) {
    return { value: '', kind: 'unsupported', points: null, visualizable: false };
  }
  if (raw in KEYWORD_POINTS) {
    return { value: raw, kind: raw === 'linear' ? 'linear' : 'keyword', points: KEYWORD_POINTS[raw] ?? null, visualizable: true };
  }
  const bezier = /^cubic-bezier\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)$/i.exec(raw);
  if (bezier) {
    const points: [number, number, number, number] = [
      Number(bezier[1]),
      Number(bezier[2]),
      Number(bezier[3]),
      Number(bezier[4]),
    ];
    const visualizable = points[0] >= 0 && points[0] <= 1 && points[2] >= 0 && points[2] <= 1;
    return { value: raw, kind: 'cubic-bezier', points, visualizable };
  }
  if (/^steps\s*\(/i.test(raw)) {
    return { value: raw, kind: 'steps', points: null, visualizable: false };
  }
  return { value: raw, kind: 'unsupported', points: null, visualizable: false };
}

export function easingSvgPath(points: [number, number, number, number] | null): string | null {
  if (!points) return null;
  const [x1, y1, x2, y2] = points;
  return `M 0 1 C ${round(x1, 3)} ${round(1 - y1, 3)} ${round(x2, 3)} ${round(1 - y2, 3)} 1 0`;
}

export function parseOffsets(keyText: string): number[] {
  const text = keyText.trim().toLowerCase();
  if (text === 'from') return [0];
  if (text === 'to') return [1];
  const offsets: number[] = [];
  for (const part of text.split(',')) {
    const match = /^(\d+(?:\.\d+)?)\s*%?$/.exec(part.trim());
    if (!match) continue;
    const number = Number(match[1]);
    const offset = part.includes('%') ? number / 100 : number;
    if (!Number.isFinite(offset)) continue;
    const bounded = Math.max(0, Math.min(1, offset));
    if (!offsets.includes(bounded)) offsets.push(round(bounded, 4));
    if (offsets.length >= 4) break;
  }
  return offsets;
}

function camelToKebab(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).replace(/^webkit-/, '-webkit-');
}

function cleanProperties(entries: Array<[string, string]>): MotionKeyframeProperty[] {
  const seen = new Set<string>();
  const properties: MotionKeyframeProperty[] = [];
  for (const [rawName, rawValue] of entries) {
    if (properties.length >= MOTION_LIMITS.propertiesPerFrame) break;
    const name = rawName.trim().toLowerCase();
    if (!/^-?[a-z][a-z0-9-]*$/.test(name) || seen.has(name)) continue;
    const value = sanitizeCssValue(rawValue);
    if (!value) continue;
    seen.add(name);
    properties.push({ name, value });
  }
  return properties;
}

function easingFromDeclarations(entries: Array<[string, string]>): string | null {
  const found = entries.find(([name]) => name.toLowerCase() === 'animation-timing-function');
  return found ? sanitizeCssValue(found[1]) : null;
}

function normalizeDeclaredKeyframes(
  records: DeclaredKeyframeRecord[],
  referenced: Set<string>,
): MotionKeyframes[] {
  return records.slice(0, MOTION_LIMITS.keyframeSets).map((record) => {
    const name = record.name.trim();
    const frames = record.frames.slice(0, MOTION_LIMITS.keyframesPerSet).flatMap((frame) => {
      const properties = cleanProperties(frame.declarations);
      const easing = easingFromDeclarations(frame.declarations);
      return parseOffsets(frame.keyText).map((offset) => ({
        offset,
        properties,
        easing,
        source: 'declared' as const,
      }));
    });
    return {
      name,
      referenced: referenced.has(name),
      keyframes: frames.slice(0, MOTION_LIMITS.keyframesPerSet),
    };
  });
}

function normalizeObservedKeyframes(records: RawKeyframeRecord[]): MotionKeyframe[] {
  const limited = records.slice(0, MOTION_LIMITS.keyframesPerSet);
  return limited.map((record, index) => {
    const fallback = limited.length > 1 ? index / (limited.length - 1) : 0;
    const rawOffset = record.offset === null ? fallback : record.offset;
    return {
      offset: round(Math.max(0, Math.min(1, rawOffset)), 4),
      properties: cleanProperties(record.declarations),
      easing: sanitizeCssValue(record.easing),
      source: 'computed' as const,
    };
  });
}

function normalizeTiming(timing: RawTimingRecord): MotionTiming {
  return {
    duration: clampTime(timing.duration),
    delay: clampTime(timing.delay),
    iterations: timing.infinite ? null : timing.iterations === null ? null : round(Math.max(0, Math.min(1000, timing.iterations)), 2),
    infinite: timing.infinite,
    direction: sanitizeCssValue(timing.direction),
    fill: sanitizeCssValue(timing.fill),
    easing: sanitizeCssValue(timing.easing),
    playState: sanitizeCssValue(timing.playState),
    currentTime: clampTime(timing.currentTime),
    playbackRate: timing.playbackRate === null || !Number.isFinite(timing.playbackRate)
      ? null
      : round(Math.max(-100, Math.min(100, timing.playbackRate)), 2),
  };
}

function sourceOf(record: ObservedAnimationRecord): MotionSource {
  if (record.animationName) return 'css-animation';
  if (record.transitionProperty) return 'css-transition';
  return 'waapi';
}

function transitionValues(keyframes: MotionKeyframe[], property: string): { before: string | null; after: string | null } {
  const needle = camelToKebab(property).toLowerCase();
  const values = keyframes.flatMap((frame) =>
    frame.properties.filter((entry) => entry.name === needle).map((entry) => entry.value),
  );
  return { before: values[0] ?? null, after: values[values.length - 1] ?? null };
}

export function extractMotion(element: Element, deps: MotionDeps): MotionSnapshot {
  const style = deps.computedStyle(element);
  const declaredAnimation = sanitizeCssValue(style.getPropertyValue('animation'));
  const declaredTransition = sanitizeCssValue(style.getPropertyValue('transition'));
  const target = deps.targetMeta(element);
  const stylesheet = deps.readStylesheets();

  const animations: MotionAnimation[] = deps
    .readAnimations(element)
    .slice(0, MOTION_LIMITS.animations)
    .map((record) => {
      const source = sourceOf(record);
      const keyframes = normalizeObservedKeyframes(record.keyframes);
      return {
        id: record.id,
        source,
        name: sanitizeCssValue(source === 'waapi' ? null : record.animationName ?? record.transitionProperty),
        target: record.target,
        timing: normalizeTiming(record.timing),
        keyframes,
        replayable: keyframes.length > 0,
      };
    });

  const referencedNames = new Set(
    animations.filter((animation) => animation.source === 'css-animation').flatMap((animation) => (animation.name ? [animation.name] : [])),
  );
  const keyframes = normalizeDeclaredKeyframes(stylesheet.keyframes, referencedNames);

  const declaredTransitions: MotionTransition[] = parseTimingList(declaredTransition, 'transition')
    .slice(0, MOTION_LIMITS.transitions)
    .map((item, index) => ({
      id: `declared-${index + 1}`,
      kind: 'declared',
      target,
      property: sanitizeCssValue(item.name) ?? 'all',
      duration: item.duration,
      delay: item.delay,
      easing: sanitizeCssValue(item.easing),
      raw: sanitizeCssValue(item.rawText),
      before: null,
      after: null,
      elapsedTime: null,
    }));

  const runningTransitions: MotionTransition[] = animations
    .filter((animation) => animation.source === 'css-transition')
    .slice(0, MOTION_LIMITS.transitions)
    .map((animation) => {
      const values = transitionValues(animation.keyframes, animation.name ?? 'all');
      return {
        id: `running-${animation.id}`,
        kind: 'running',
        target: animation.target,
        property: animation.name ?? 'all',
        duration: animation.timing.duration,
        delay: animation.timing.delay,
        easing: animation.timing.easing,
        raw: null,
        before: values.before,
        after: values.after,
        elapsedTime: animation.timing.currentTime,
      };
    });

  const observedTransitions: MotionTransition[] = deps
    .readTransitionEvents()
    .filter((event) => deps.isRelated(event.target))
    .slice(-MOTION_LIMITS.transitions)
    .map((event, index) => ({
      id: `observed-${index + 1}`,
      kind: 'observed',
      target: deps.targetMeta(event.target),
      property: camelToKebab(event.property),
      duration: null,
      delay: null,
      easing: null,
      raw: null,
      before: null,
      after: null,
      elapsedTime: round(Math.max(0, event.elapsed), 2),
    }));

  const transitions = [...declaredTransitions, ...runningTransitions, ...observedTransitions].slice(
    0,
    MOTION_LIMITS.transitions,
  );

  const easings = Array.from(
    new Set(
      [
        ...animations.flatMap((animation) => (animation.timing.easing ? [animation.timing.easing] : [])),
        ...animations.flatMap((animation) => animation.keyframes.flatMap((frame) => (frame.easing ? [frame.easing] : []))),
        ...keyframes.flatMap((set) => set.keyframes.flatMap((frame) => (frame.easing ? [frame.easing] : []))),
        ...transitions.flatMap((transition) => (transition.easing ? [transition.easing] : [])),
      ]
        .map((value) => sanitizeCssValue(value))
        .filter((value): value is string => Boolean(value)),
    ),
  )
    .slice(0, MOTION_LIMITS.easings)
    .map(parseEasing);

  const animatedProperties = Array.from(
    new Set(
      [
        ...animations.flatMap((animation) => animation.keyframes.flatMap((frame) => frame.properties.map((property) => property.name))),
        ...keyframes.flatMap((set) => set.keyframes.flatMap((frame) => frame.properties.map((property) => property.name))),
      ].sort(),
    ),
  ).slice(0, MOTION_LIMITS.animatedProperties);

  const limitations = [
    'Animation triggers are not inferred; only observed states are reported.',
    'Reconstructed keyframes come from computed frames and may omit authored syntax or CSS variables.',
    'Isolated replay uses a temporary clone and does not change the original animation.',
  ];
  if (stylesheet.inaccessible > 0) {
    limitations.push(`${stylesheet.inaccessible} stylesheet(s) were inaccessible; authored keyframes may be missing.`);
  }

  return {
    summary: {
      animationCount: animations.length,
      cssAnimationCount: animations.filter((animation) => animation.source === 'css-animation').length,
      transitionCount: transitions.length,
      waapiCount: animations.filter((animation) => animation.source === 'waapi').length,
      runningCount:
        animations.filter((animation) => animation.timing.playState === 'running').length +
        runningTransitions.length,
      keyframeSetCount: keyframes.length,
      reducedMotion: deps.reducedMotion(),
      animatedProperties,
    },
    animations,
    transitions,
    keyframes,
    easings,
    declaredAnimation,
    declaredTransition,
    interaction: deps.interaction(element),
    stylesheetAccess: { readable: stylesheet.readable, inaccessible: stylesheet.inaccessible },
    replay: deps.replayState(),
    limitations,
    capturedAt: deps.now(),
  };
}

function safeKeyframeName(name: string): string | null {
  const trimmed = name.trim();
  return /^-?[_a-zA-Z][_a-zA-Z0-9-]*$/.test(trimmed) ? trimmed : null;
}

export function serializeKeyframesCss(set: MotionKeyframes): string | null {
  const name = safeKeyframeName(set.name);
  if (!name || !set.keyframes.length) return null;
  const blocks = set.keyframes.slice(0, MOTION_LIMITS.keyframesPerSet).map((frame) => {
    const declarations = frame.properties.flatMap((property) => {
      const value = sanitizeCssValue(property.value);
      return value ? [`    ${property.name}: ${value};`] : [];
    });
    const easing = frame.easing ? sanitizeCssValue(frame.easing) : null;
    if (easing) declarations.push(`    animation-timing-function: ${easing};`);
    return `  ${round(frame.offset * 100, 2)}% {\n${declarations.join('\n')}\n  }`;
  });
  return `@keyframes ${name} {\n${blocks.join('\n')}\n}`;
}

export function serializeMotionCss(motion: MotionSnapshot, selector: string): string {
  const declarations: string[] = [];
  const animation = sanitizeCssValue(motion.declaredAnimation);
  const transition = sanitizeCssValue(motion.declaredTransition);
  if (animation) declarations.push(`  animation: ${animation};`);
  if (transition) declarations.push(`  transition: ${transition};`);
  if (!declarations.length) {
    const first = motion.animations[0];
    if (first && first.timing.duration !== null) {
      declarations.push(`  animation-duration: ${first.timing.duration}ms;`);
    }
  }

  const blocks = [`/* PixelPeek reconstructed motion; verify against the page. */`];
  if (declarations.length) blocks.push(`${selector} {\n${declarations.join('\n')}\n}`);
  for (const set of motion.keyframes) {
    if (!set.referenced) continue;
    const block = serializeKeyframesCss(set);
    if (block) blocks.push(block);
  }
  return blocks.join('\n\n');
}

export function serializeMotionJson(motion: MotionSnapshot): string {
  return JSON.stringify(motion, null, 2);
}
