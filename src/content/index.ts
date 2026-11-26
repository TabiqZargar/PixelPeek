import {
  MessageType,
  isContentEvent,
  isDesignSystemRequest,
  isDesignSystemSnapshot,
  isHierarchyDirection,
  isMotionReplayAction,
  type ContentEvent,
} from '../shared/messages';
import {
  DESIGN_SYSTEM_LIMITS,
  type ElementSnapshot,
  type HierarchyDirection,
  type MotionReplayAction,
  type MotionTarget,
} from '../shared/types';
import {
  extractDesignSystemSnapshot,
  type DesignElementMeta,
  type DesignStylesheetRecord,
  type DesignStylesheetRule,
  type DesignSystemDeps,
} from './design-system';
import {
  MOTION_LIMITS,
  type ObservedAnimationRecord,
  type RawKeyframeRecord,
  type RawTimingRecord,
  type StylesheetReadResult,
  type TransitionEventRecord,
} from './motion';
import { createSnapshot, type SnapshotDeps } from './snapshot';

const HOST_ID = 'pixelpeek-overlay-host';
const DESIGN_STYLESHEET_DEPTH = 6;

const OVERLAY_CSS = `
:host {
  all: initial;
  position: fixed;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  z-index: 2147483647;
  pointer-events: none;
}
.box {
  position: fixed;
  box-sizing: border-box;
  border: 2px solid #8b6dff;
  border-radius: 2px;
  background: rgba(139, 109, 255, 0.09);
  box-shadow: 0 0 0 1px rgba(8, 8, 10, 0.8);
  pointer-events: none;
}
.selected {
  border-color: #48d6a8;
  background: rgba(72, 214, 168, 0.08);
  box-shadow: 0 0 0 1px rgba(8, 8, 10, 0.85), 0 0 14px rgba(72, 214, 168, 0.25);
}
.label {
  position: fixed;
  box-sizing: border-box;
  padding: 3px 7px;
  border: 1px solid rgba(139, 109, 255, 0.5);
  border-radius: 3px;
  background: #14121c;
  color: #ececf1;
  font: 600 11px/1.3 ui-monospace, SFMono-Regular, Consolas, monospace;
  white-space: nowrap;
  pointer-events: none;
}
.label.selected {
  border-color: rgba(72, 214, 168, 0.6);
  color: #c8f7e6;
}
.hidden { display: none; }
`;

interface Overlay {
  host: HTMLElement;
  box: HTMLElement;
  label: HTMLElement;
}

function createOverlay(doc: Document): Overlay | null {
  doc.getElementById(HOST_ID)?.remove();
  const host = doc.createElement('div');
  host.id = HOST_ID;
  host.setAttribute('aria-hidden', 'true');
  host.style.setProperty('all', 'initial', 'important');
  host.style.setProperty('display', 'block', 'important');
  host.style.setProperty('position', 'fixed', 'important');
  host.style.setProperty('pointer-events', 'none', 'important');
  host.style.setProperty('z-index', '2147483647', 'important');

  const root = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = OVERLAY_CSS;
  const box = doc.createElement('div');
  box.className = 'box hidden';
  const label = doc.createElement('div');
  label.className = 'label hidden';
  label.textContent = '';
  root.append(style, box, label);
  doc.documentElement.appendChild(host);
  return { host, box, label };
}

function isIgnored(element: Element): boolean {
  if (!element || element.id === HOST_ID) return true;
  return /^(HTML|BODY|HEAD|SCRIPT|STYLE|NOSCRIPT|TEMPLATE|LINK|META|TITLE)$/.test(
    element.tagName.toUpperCase(),
  );
}

function designSelector(element: Element): string {
  const tag = element.tagName.toLowerCase();
  if (tag.length > DESIGN_SYSTEM_LIMITS.maxTagLength || !/^[a-z][a-z0-9-]*$/.test(tag)) return 'div';
  const classes = Array.from(element.classList)
    .filter((name) => /^[a-z][a-z0-9_-]*$/.test(name) && name.length <= DESIGN_SYSTEM_LIMITS.maxTagLength)
    .slice(0, 2);
  return classes.length ? `${tag}.${classes.join('.')}` : tag;
}

function designMeta(node: unknown): DesignElementMeta {
  const element = node as Element | null;
  if (!element || typeof element.tagName !== 'string') {
    return {
      tag: 'div',
      roleHint: null,
      selector: 'div',
      hidden: true,
      iframe: false,
      shadowRoot: false,
      formControl: false,
      textRendering: false,
    };
  }
  const tag = element.tagName.toLowerCase();
  const editable = element.getAttribute('contenteditable');
  let textRendering = false;
  for (const child of Array.from(element.childNodes ?? [])) {
    if (child.nodeType === 3) {
      textRendering = true;
      break;
    }
  }
  return {
    tag,
    roleHint: element.getAttribute('role'),
    selector: designSelector(element),
    hidden: ('hidden' in element && (element as { hidden?: unknown }).hidden === true) ||
      element.hasAttribute('hidden') ||
      element.getAttribute('aria-hidden') === 'true',
    iframe: tag === 'iframe' || tag === 'frame',
    shadowRoot: Boolean((element as Element & { shadowRoot?: unknown }).shadowRoot),
    formControl: /^(input|textarea|select)$/.test(tag) ||
      (editable !== null && editable !== 'false'),
    textRendering,
  };
}

function designGeometry(node: unknown): { width: number; height: number } {
  try {
    const rect = (node as Element).getBoundingClientRect?.();
    return {
      width: typeof rect?.width === 'number' && Number.isFinite(rect.width) ? rect.width : 0,
      height: typeof rect?.height === 'number' && Number.isFinite(rect.height) ? rect.height : 0,
    };
  } catch {
    return { width: 0, height: 0 };
  }
}

function designComputedStyle(
  node: unknown,
  properties: readonly string[],
): Readonly<Record<string, string>> {
  const element = node as Element | null;
  const view = element?.ownerDocument?.defaultView;
  if (!element || !view) return {};
  try {
    const style = view.getComputedStyle(element);
    const values: Record<string, string> = {};
    for (const property of properties) {
      try {
        values[property] = style.getPropertyValue(property) ?? '';
      } catch {
        values[property] = '';
      }
    }
    return values;
  } catch {
    return {};
  }
}

function readDesignStylesheets(): DesignStylesheetRecord[] {
  const records: DesignStylesheetRecord[] = [];
  const styleRuleType = typeof CSSRule === 'undefined' ? 1 : CSSRule.STYLE_RULE;
  const keyframesRuleType = typeof CSSRule === 'undefined' ? 7 : CSSRule.KEYFRAMES_RULE;
  const webkitKeyframesRuleType =
    typeof CSSRule === 'undefined'
      ? 12
      : ((CSSRule as unknown as Record<string, number>).WEBKIT_KEYFRAMES_RULE ?? 12);

  const walk = (rules: CSSRuleList, depth: number, output: DesignStylesheetRule[]): void => {
    if (depth > DESIGN_STYLESHEET_DEPTH) return;
    for (const rule of Array.from(rules)) {
      if (output.length >= DESIGN_SYSTEM_LIMITS.maxCssRules) return;
      if (rule.type === keyframesRuleType || rule.type === webkitKeyframesRuleType) continue;
      const declarations: Array<[string, string]> = [];
      const style = (rule as CSSStyleRule).style;
      if (style && rule.type === styleRuleType) {
        const count = Math.min(style.length, DESIGN_SYSTEM_LIMITS.maxDeclarationsPerRule);
        for (let index = 0; index < count; index += 1) {
          const name = style.item(index);
          if (!name) continue;
          declarations.push([name, style.getPropertyValue(name)]);
        }
      }
      output.push({
        selector: (rule as CSSStyleRule).selectorText?.trim() || null,
        declarations,
      });
      const nested = (rule as CSSRule & { cssRules?: CSSRuleList }).cssRules;
      if (nested) walk(nested, depth + 1, output);
    }
  };

  for (const sheet of Array.from(document.styleSheets).slice(0, DESIGN_SYSTEM_LIMITS.maxStylesheets)) {
    let rules: CSSRuleList;
    try {
      if (sheet.disabled) {
        records.push({ accessible: false, rules: [] });
        continue;
      }
      rules = sheet.cssRules;
    } catch {
      records.push({ accessible: false, rules: [] });
      continue;
    }
    const output: DesignStylesheetRule[] = [];
    try {
      walk(rules, 0, output);
    } catch {
      records.push({ accessible: false, rules: [] });
      continue;
    }
    records.push({ accessible: true, rules: output });
  }
  return records;
}

const designSystemDeps: DesignSystemDeps = {
  sample: {
    children: (node) => {
      const element = node as Element | null;
      return element && typeof element.children !== 'undefined' ? Array.from(element.children) : [];
    },
    meta: designMeta,
    geometry: designGeometry,
    computedStyle: designComputedStyle,
  },
  readStylesheets: readDesignStylesheets,
  now: () => new Date().toISOString(),
  origin: () => {
    try {
      return window.location.origin;
    } catch {
      return '';
    }
  },
};

function extractPageDesignSystem(requestId: string) {
  const root = document.body && document.body.isConnected ? document.body : null;
  return extractDesignSystemSnapshot(requestId, root, designSystemDeps);
}

function emit(event: ContentEvent): void {
  if (!isContentEvent(event)) return;
  void chrome.runtime.sendMessage(event).catch(() => {
    /* the panel or background may be gone; the page is unaffected */
  });
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function toCssName(value: string): string {
  const converted = value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  return converted.startsWith('webkit-') ? `-${converted}` : converted;
}

function motionTarget(element: Element, depth = 0): MotionTarget {
  return {
    tag: element.tagName.toLowerCase(),
    id: element.id || null,
    classes: Array.from(element.classList).slice(0, 6),
    depth,
  };
}

function normalizeAnimationTime(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value && typeof value === 'object' && 'value' in value) {
    const nested = (value as { value?: unknown }).value;
    if (typeof nested === 'number' && Number.isFinite(nested)) return nested;
  }
  return null;
}

function styleEntries(style: CSSStyleDeclaration | undefined): Array<[string, string]> {
  if (!style) return [];
  const entries: Array<[string, string]> = [];
  const limit = Math.min(style.length, MOTION_LIMITS.propertiesPerFrame + 4);
  for (let index = 0; index < limit; index += 1) {
    const name = style.item(index);
    if (!name) continue;
    entries.push([name, style.getPropertyValue(name)]);
  }
  return entries;
}

function readStylesheets(): StylesheetReadResult {
  const result: StylesheetReadResult = { readable: 0, inaccessible: 0, keyframes: [] };
  const seen = new Set<string>();
  let visited = 0;
  const keyframesRuleType = typeof CSSRule === 'undefined' ? 7 : CSSRule.KEYFRAMES_RULE;
  const webkitKeyframesRuleType =
    typeof CSSRule === 'undefined'
      ? 12
      : ((CSSRule as unknown as Record<string, number>).WEBKIT_KEYFRAMES_RULE ?? 12);

  const walk = (rules: CSSRuleList, depth: number): void => {
    if (depth > MOTION_LIMITS.stylesheetDepth || visited >= MOTION_LIMITS.stylesheetRules) return;
    for (const rule of Array.from(rules).slice(0, MOTION_LIMITS.stylesheetRules - visited)) {
      visited += 1;
      if (rule.type === keyframesRuleType || rule.type === webkitKeyframesRuleType) {
        const keyframesRule = rule as CSSKeyframesRule;
        const name = keyframesRule.name?.trim();
        if (name && !seen.has(name) && result.keyframes.length < MOTION_LIMITS.keyframeSets) {
          seen.add(name);
          const frames = Array.from(keyframesRule.cssRules ?? [])
            .slice(0, MOTION_LIMITS.keyframesPerSet)
            .map((frame) => {
              const keyframeRule = frame as CSSKeyframeRule;
              return {
                keyText: keyframeRule.keyText || '',
                declarations: styleEntries(keyframeRule.style),
              };
            });
          result.keyframes.push({ name, frames });
        }
        continue;
      }
      const nested = (rule as CSSRule & { cssRules?: CSSRuleList }).cssRules;
      if (nested) walk(nested, depth + 1);
    }
  };

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      walk(sheet.cssRules, 0);
      result.readable += 1;
    } catch {
      result.inaccessible += 1;
    }
  }
  return result;
}

function keyframeData(effect: AnimationEffect | null): { raw: RawKeyframeRecord[]; animate: Keyframe[] } {
  if (!effect || typeof (effect as KeyframeEffect).getKeyframes !== 'function') {
    return { raw: [], animate: [] };
  }
  const frames = (effect as KeyframeEffect).getKeyframes();
  const raw: RawKeyframeRecord[] = [];
  const animate: Keyframe[] = [];
  for (const frame of frames.slice(0, MOTION_LIMITS.keyframesPerSet)) {
    const withOffset = frame as Keyframe & { computedOffset?: unknown };
    const computedOffset = withOffset.computedOffset;
    const offset =
      typeof computedOffset === 'number' && Number.isFinite(computedOffset)
        ? computedOffset
        : typeof frame.offset === 'number' && Number.isFinite(frame.offset)
          ? frame.offset
          : null;
    const easing = typeof frame.easing === 'string' ? frame.easing : null;
    const declarations: Array<[string, string]> = [];
    const replay: Record<string, string | number> = {};
    for (const [name, value] of Object.entries(frame)) {
      if (name === 'offset' || name === 'easing' || name === 'computedOffset') continue;
      if (typeof value !== 'string' && typeof value !== 'number') continue;
      declarations.push([toCssName(name), String(value)]);
      replay[name] = value;
    }
    if (offset !== null) replay.offset = offset;
    if (easing) replay.easing = easing;
    raw.push({ offset, declarations, easing });
    animate.push(replay as Keyframe);
  }
  return { raw, animate };
}

function replayOptions(effect: AnimationEffect | null): KeyframeAnimationOptions {
  const timing = typeof effect?.getTiming === 'function' ? effect.getTiming() : null;
  const duration =
    typeof timing?.duration === 'number' && Number.isFinite(timing.duration)
      ? Math.max(0, timing.duration)
      : 0;
  const iterations =
    timing?.iterations === Number.POSITIVE_INFINITY
      ? Number.POSITIVE_INFINITY
      : Math.max(1, timing?.iterations ?? 1);
  return {
    duration,
    delay: timing?.delay ?? 0,
    iterations,
    easing: timing?.easing ?? 'linear',
    direction: timing?.direction ?? 'normal',
    fill: 'both',
  };
}

function rawTimingRecord(animation: Animation, effect: AnimationEffect | null): RawTimingRecord {
  const timing = typeof effect?.getTiming === 'function' ? effect.getTiming() : null;
  const computed = typeof effect?.getComputedTiming === 'function' ? effect.getComputedTiming() : null;
  const rawIterations = computed?.iterations ?? timing?.iterations ?? 1;
  const infinite = rawIterations === Number.POSITIVE_INFINITY;
  const duration =
    typeof timing?.duration === 'number' && Number.isFinite(timing.duration) ? timing.duration : null;
  return {
    duration,
    delay: timing?.delay ?? null,
    iterations: infinite ? null : rawIterations,
    infinite,
    direction: timing?.direction ?? null,
    fill: timing?.fill ?? null,
    easing: timing?.easing ?? computed?.easing ?? null,
    playState: animation.playState ?? null,
    currentTime: normalizeAnimationTime(animation.currentTime),
    playbackRate: Number.isFinite(animation.playbackRate) ? animation.playbackRate : null,
  };
}

function animationRecord(
  animation: Animation,
  element: Element,
  depth: number,
  id: string,
): ObservedAnimationRecord | null {
  const effect = animation.effect ?? null;
  if (!effect) return null;
  const frames = keyframeData(effect);
  const candidate = animation as Animation & { animationName?: unknown; transitionProperty?: unknown };
  const animationName = typeof candidate.animationName === 'string' ? candidate.animationName : null;
  const transitionProperty =
    typeof candidate.transitionProperty === 'string' ? candidate.transitionProperty : null;
  if (frames.animate.length) {
    replayables.set(id, {
      animation,
      target: element,
      keyframes: frames.animate,
      options: replayOptions(effect),
    });
  }
  return {
    id,
    target: motionTarget(element, depth),
    animationName,
    transitionProperty,
    timing: rawTimingRecord(animation, effect),
    keyframes: frames.raw,
  };
}

function readAnimations(element: Element): ObservedAnimationRecord[] {
  replayables = new Map();
  const seen = new Set<Animation>();
  const records: ObservedAnimationRecord[] = [];
  const nodes: Array<{ element: Element; depth: number }> = [{ element, depth: 0 }];
  let index = 0;

  while (
    index < nodes.length &&
    nodes.length < MOTION_LIMITS.descendantNodes &&
    records.length < MOTION_LIMITS.animations
  ) {
    const current = nodes[index]!;
    index += 1;
    const getter = (current.element as Element & { getAnimations?: () => Animation[] }).getAnimations;
    if (typeof getter !== 'function') continue;
    let list: Animation[] = [];
    try {
      list = getter.call(current.element) ?? [];
    } catch {
      continue;
    }
    for (const animation of list) {
      if (seen.has(animation) || isolatedAnimations.has(animation)) continue;
      seen.add(animation);
      const record = animationRecord(
        animation,
        current.element,
        current.depth,
        `a${records.length + 1}`,
      );
      if (!record) continue;
      records.push(record);
      if (records.length >= MOTION_LIMITS.animations) break;
    }
    if (current.depth >= MOTION_LIMITS.descendantDepth) continue;
    const remaining = MOTION_LIMITS.descendantNodes - nodes.length;
    for (const child of Array.from(current.element.children).slice(0, Math.max(0, remaining))) {
      nodes.push({ element: child, depth: current.depth + 1 });
    }
  }
  return records;
}

function onTransitionChange(event: TransitionEvent): void {
  const target = event.target;
  if (!(target instanceof Element) || isIgnored(target)) return;
  const phases: Record<string, TransitionEventRecord['phase']> = {
    transitionrun: 'run',
    transitionstart: 'start',
    transitionend: 'end',
    transitioncancel: 'cancel',
  };
  transitionLog.push({
    target,
    property: event.propertyName,
    elapsed: event.elapsedTime,
    phase: phases[event.type] ?? 'run',
    at: new Date().toISOString(),
  });
  if (transitionLog.length > MOTION_LIMITS.transitionEvents * 2) {
    transitionLog = transitionLog.slice(-MOTION_LIMITS.transitionEvents);
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function interactionState(element: Element): { hover: boolean; focus: boolean; active: boolean } {
  const style = snapshotDeps.computedStyle(element);
  const matches = (selector: string): boolean => {
    try {
      return element.matches(selector);
    } catch {
      return false;
    }
  };
  return {
    hover: matches(':hover') || style.getPropertyValue('cursor').trim() === 'pointer',
    focus: matches(':focus') || document.activeElement === element,
    active: matches(':active'),
  };
}

function isRelatedElement(element: Element): boolean {
  if (!selected) return false;
  return element === selected || selected.contains(element) || element.contains(selected);
}

function motionState(): { isolatedActiveId: string | null; liveRestorableIds: string[] } {
  return { isolatedActiveId, liveRestorableIds: Array.from(liveStates.keys()) };
}

const snapshotDeps: SnapshotDeps = {
  computedStyle: (element) => element.ownerDocument.defaultView!.getComputedStyle(element),
  parentStyle: (element) => element.ownerDocument.defaultView!.getComputedStyle(element),
  boundingRect: (element) => element.getBoundingClientRect(),
  hierarchy: {
    parent: (element) => element.parentElement,
    children: (element) => Array.from(element.children),
    previousSibling: (element) => element.previousElementSibling,
    nextSibling: (element) => element.nextElementSibling,
    meta: (element, depth) => ({
      tag: element.tagName.toLowerCase(),
      id: element.id || null,
      classes: Array.from(element.classList).slice(0, 6),
      depth,
    }),
  },
  motion: {
    computedStyle: (element) => element.ownerDocument.defaultView!.getComputedStyle(element),
    readStylesheets,
    readAnimations,
    readTransitionEvents: () => transitionLog.slice(),
    reducedMotion: prefersReducedMotion,
    interaction: interactionState,
    targetMeta: motionTarget,
    isRelated: isRelatedElement,
    now: () => new Date().toISOString(),
    replayState: motionState,
  },
};

interface ReplayableAnimation {
  animation: Animation;
  target: Element;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
}

interface LiveReplayState {
  animation: Animation;
  currentTime: number | null;
  playbackRate: number;
  playState: AnimationPlayState;
}

let active = false;
let overlay: Overlay | null = null;
let highlighted: Element | null = null;
let selected: Element | null = null;
let selectionObserver: MutationObserver | null = null;
let replayables = new Map<string, ReplayableAnimation>();
let isolatedAnimations = new Set<Animation>();
let isolatedActiveId: string | null = null;
let liveStates = new Map<string, LiveReplayState>();
let transitionLog: TransitionEventRecord[] = [];

function stopIsolated(): void {
  for (const animation of isolatedAnimations) {
    try {
      animation.cancel();
    } catch {
      isolatedAnimations.delete(animation);
    }
  }
  isolatedAnimations.clear();
  isolatedActiveId = null;
}

function restoreLiveState(id?: string): void {
  const ids = id ? [id] : Array.from(liveStates.keys());
  for (const key of ids) {
    const state = liveStates.get(key);
    if (!state) continue;
    try {
      const animation = replayables.get(key)?.animation ?? state.animation;
      animation.updatePlaybackRate(state.playbackRate);
      if (state.currentTime !== null) animation.currentTime = state.currentTime;
      if (state.playState === 'paused') animation.pause();
      else void animation.play();
    } catch {
      liveStates.delete(key);
    }
    liveStates.delete(key);
  }
}

function cleanupReplay(reason = 'replay handles were cleared'): void {
  stopIsolated();
  restoreLiveState();
  replayables = new Map();
  emit({ type: MessageType.ReplayInvalidated, payload: { reason } });
}

function replayMotion(action: MotionReplayAction, animationId?: string): void {
  if (action === 'isolated-stop') {
    stopIsolated();
    return;
  }
  if (action === 'live-restore') {
    restoreLiveState(animationId);
    return;
  }

  let targetId: string | undefined = animationId;
  if (!targetId) {
    targetId = Array.from(replayables.entries()).find(([, handle]) => handle.keyframes.length > 0)?.[0];
  }
  if (!targetId) throw new Error('No replayable animation was found for this selection.');
  const handle = replayables.get(targetId);
  if (!handle || !handle.keyframes.length) {
    throw new Error('That animation cannot be replayed.');
  }

  if (action === 'live-restart') {
    if (!handle.animation.effect) throw new Error('The original animation is no longer available.');
    if (!liveStates.has(targetId)) {
      liveStates.set(targetId, {
        animation: handle.animation,
        currentTime: normalizeAnimationTime(handle.animation.currentTime),
        playbackRate: handle.animation.playbackRate,
        playState: handle.animation.playState,
      });
    }
    handle.animation.currentTime = 0;
    handle.animation.play();
    return;
  }

  stopIsolated();
  const clone = handle.target.animate(handle.keyframes, handle.options);
  isolatedAnimations.add(clone);
  isolatedActiveId = targetId;
}

function observeSelection(): void {
  selectionObserver?.disconnect();
  if (typeof MutationObserver === 'undefined') return;
  selectionObserver = new MutationObserver(() => {
    if (selected && !selected.isConnected) {
      clearSelection('element was removed from the page');
    }
  });
  selectionObserver.observe(document.documentElement, { childList: true, subtree: true });
}

function hideHighlight(): void {
  highlighted = null;
  if (!overlay) return;
  overlay.box.className = 'box hidden';
  overlay.label.className = 'label hidden';
  if (selected?.isConnected) showSelection(selected);
}

function showBox(element: Element, selectedStyle: boolean): DOMRect {
  const rect = element.getBoundingClientRect();
  if (!overlay) return rect;
  overlay.box.className = selectedStyle ? 'box selected' : 'box';
  overlay.label.className = selectedStyle ? 'label selected' : 'label';
  overlay.label.textContent = `<${element.tagName.toLowerCase()}> ${Math.round(rect.width)} × ${Math.round(rect.height)}${selectedStyle ? ' · selected' : ''}`;
  positionOverlay(rect);
  return rect;
}

function showHighlight(element: Element): void {
  if (!overlay) return;
  if (element === highlighted && element !== selected) {
    positionOverlay(element.getBoundingClientRect());
    return;
  }
  highlighted = element;
  showBox(element, false);
}

function showSelection(element: Element): void {
  if (!overlay) return;
  showBox(element, true);
}

function positionOverlay(rect: DOMRect): void {
  if (!overlay) return;
  const { box, label } = overlay;
  box.style.left = `${rect.left}px`;
  box.style.top = `${rect.top}px`;
  box.style.width = `${rect.width}px`;
  box.style.height = `${rect.height}px`;

  const labelWidth = Math.max(60, Math.min(260, rect.width));
  label.style.width = `${labelWidth}px`;
  label.style.left = `${Math.max(0, Math.min(rect.left, window.innerWidth - labelWidth))}px`;
  label.style.top = `${rect.top >= 26 ? rect.top - 24 : rect.top + 2}px`;
}

function clearSelection(reason: string): void {
  selectionObserver?.disconnect();
  selectionObserver = null;
  cleanupReplay();
  selected = null;
  emit({ type: MessageType.SelectionCleared, payload: { reason } });
  hideHighlight();
  overlay?.host.remove();
  overlay = null;
}

function capture(element: Element, resetReplay = false): ElementSnapshot {
  if (resetReplay) cleanupReplay();
  const snapshot = createSnapshot(element, snapshotDeps);
  selected = element;
  observeSelection();
  emit({ type: MessageType.ElementSelected, payload: snapshot.element });
  emit({ type: MessageType.SnapshotChanged, payload: snapshot });
  return snapshot;
}

function currentTarget(direction: HierarchyDirection, index?: number): Element | null {
  if (!selected?.isConnected) return null;
  switch (direction) {
    case 'parent':
      return selected.parentElement;
    case 'child':
      return selected.children[Math.max(0, index ?? 0)] ?? null;
    case 'previous-sibling':
      return selected.previousElementSibling;
    case 'next-sibling':
      return selected.nextElementSibling;
  }
}

function onMove(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element) || isIgnored(target)) {
    hideHighlight();
    return;
  }
  showHighlight(target);
}

function onClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element) || isIgnored(target)) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  try {
    capture(target, true);
  } catch (error) {
    emit({
      type: MessageType.RuntimeError,
      payload: {
        source: 'inspector',
        message: error instanceof Error ? error.message : String(error),
        code: 'capture-failed',
      },
    });
    stop({ clearSelection: true });
    return;
  }
  stop();
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    stop({ clearSelection: true });
  }
}

function onPageHide(): void {
  stop({ clearSelection: true });
}

function onBlur(): void {
  stop();
}

function start(): void {
  if (active) return;
  const doc = document;
  overlay = createOverlay(doc);
  if (!overlay) return;
  active = true;
  highlighted = null;
  transitionLog = [];
  doc.addEventListener('mousemove', onMove, true);
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('keydown', onKeyDown, true);
  doc.addEventListener('transitionrun', onTransitionChange, true);
  doc.addEventListener('transitionstart', onTransitionChange, true);
  doc.addEventListener('transitionend', onTransitionChange, true);
  doc.addEventListener('transitioncancel', onTransitionChange, true);
  window.addEventListener('blur', onBlur, true);
  window.addEventListener('pagehide', onPageHide, true);
  emit({ type: MessageType.StateChanged, payload: { tabId: null, active: true } });
}

function stop(options: { clearSelection?: boolean } = {}): void {
  cleanupReplay();
  if (!active) return;
  active = false;
  document.removeEventListener('mousemove', onMove, true);
  document.removeEventListener('click', onClick, true);
  document.removeEventListener('keydown', onKeyDown, true);
  document.removeEventListener('transitionrun', onTransitionChange, true);
  document.removeEventListener('transitionstart', onTransitionChange, true);
  document.removeEventListener('transitionend', onTransitionChange, true);
  document.removeEventListener('transitioncancel', onTransitionChange, true);
  window.removeEventListener('blur', onBlur, true);
  window.removeEventListener('pagehide', onPageHide, true);
  highlighted = null;
  if (options.clearSelection) {
    clearSelection('inspection stopped');
  } else if (selected?.isConnected) {
    showSelection(selected);
  }
  emit({ type: MessageType.StateChanged, payload: { tabId: null, active: false } });
}

function isTypedMessage(value: unknown): value is { type: string } {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isTypedMessage(message)) return false;
  switch (message.type) {
    case MessageType.Ping:
      sendResponse({ type: MessageType.Pong });
      return false;
    case MessageType.ExtractDesignSystem: {
      if (!isDesignSystemRequest(message)) {
        sendResponse({
          ok: false,
          error: 'Invalid design-system request.',
          errorCode: 'invalid-request',
        });
        return false;
      }
      try {
        const snapshot = extractPageDesignSystem(message.requestId);
        if (!isDesignSystemSnapshot(snapshot)) {
          throw new Error('The design system snapshot failed validation.');
        }
        emit({ type: MessageType.DesignSystemChanged, payload: snapshot });
        sendResponse({ ok: true });
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        emit({
          type: MessageType.RuntimeError,
          payload: {
            source: 'design-system',
            requestId: message.requestId,
            message: messageText,
            code: 'design-system-extraction-failed',
          },
        });
        sendResponse({
          ok: false,
          error: messageText,
          errorCode: 'design-system-extraction-failed',
        });
      }
      return false;
    }
    case MessageType.StartInspection:
      start();
      sendResponse({ ok: true });
      return false;
    case MessageType.StopInspection:
      stop();
      sendResponse({ ok: true });
      return false;
    case MessageType.GetSnapshot: {
      if (!selected) {
        sendResponse({ ok: false, error: 'No element is selected.', errorCode: 'no-selection' });
        return false;
      }
      if (!selected.isConnected) {
        clearSelection('element was removed from the page');
        sendResponse({ ok: false, error: 'The selected element is no longer in the page.', errorCode: 'detached' });
        return false;
      }
      try {
        capture(selected);
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          errorCode: 'capture-failed',
        });
      }
      return false;
    }
    case MessageType.ReplayMotion: {
      const action = (message as { action?: unknown }).action;
      if (!isMotionReplayAction(action)) {
        sendResponse({ ok: false, error: 'Unknown replay action.', errorCode: 'invalid-replay-action' });
        return false;
      }
      if (!selected) {
        sendResponse({ ok: false, error: 'No element is selected.', errorCode: 'no-selection' });
        return false;
      }
      if (!selected.isConnected) {
        clearSelection('element was removed from the page');
        sendResponse({ ok: false, error: 'The selected element is no longer in the page.', errorCode: 'detached' });
        return false;
      }
      const animationIdValue = (message as { animationId?: unknown }).animationId;
      const animationId = isNonEmpty(animationIdValue) ? animationIdValue : undefined;
      try {
        replayMotion(action, animationId);
        capture(selected);
        sendResponse({ ok: true });
      } catch (error) {
        cleanupReplay();
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          errorCode: 'replay-failed',
        });
      }
      return false;
    }
    case MessageType.NavigateHierarchy: {
      const directionValue = (message as { direction?: unknown }).direction;
      if (!isHierarchyDirection(directionValue)) {
        sendResponse({ ok: false, error: 'Unknown hierarchy direction.', errorCode: 'invalid-direction' });
        return false;
      }
      if (!selected) {
        sendResponse({ ok: false, error: 'No element is selected.', errorCode: 'no-selection' });
        return false;
      }
      if (!selected.isConnected) {
        clearSelection('element was removed from the page');
        sendResponse({ ok: false, error: 'The selected element is no longer in the page.', errorCode: 'detached' });
        return false;
      }
      const indexValue = (message as { index?: unknown }).index;
      const index = typeof indexValue === 'number' && Number.isInteger(indexValue) ? indexValue : undefined;
      const target = currentTarget(directionValue, index);
      if (!target || isIgnored(target)) {
        sendResponse({ ok: false, error: 'There is no element in that direction.', errorCode: 'no-target' });
        return false;
      }
      try {
        capture(target, true);
        if (!active) showSelection(target);
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          errorCode: 'capture-failed',
        });
      }
      return false;
    }
    default:
      return false;
  }
});
