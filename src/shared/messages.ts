import {
  DESIGN_SYSTEM_CATEGORIES,
  DESIGN_SYSTEM_LIMITS,
  type DesignSystemSnapshot,
} from './types';
import type {
  ElementInfo,
  ElementSnapshot,
  HierarchyDirection,
  InspectionState,
  MotionReplayAction,
  MotionSnapshot,
  SelectionClearedPayload,
} from './types';

export const MessageType = {
  Ping: 'pixelpeek/ping',
  Pong: 'pixelpeek/pong',
  StartInspection: 'pixelpeek/start',
  StopInspection: 'pixelpeek/stop',
  GetState: 'pixelpeek/get-state',
  ElementSelected: 'pixelpeek/element-selected',
  StateChanged: 'pixelpeek/state-changed',
  RuntimeError: 'pixelpeek/runtime-error',
  GetSnapshot: 'pixelpeek/get-snapshot',
  NavigateHierarchy: 'pixelpeek/navigate-hierarchy',
  SnapshotChanged: 'pixelpeek/snapshot-changed',
  SelectionCleared: 'pixelpeek/selection-cleared',
  ReplayMotion: 'pixelpeek/replay-motion',
  ExtractDesignSystem: 'pixelpeek/extract-design-system',
  DesignSystemChanged: 'pixelpeek/design-system-changed',
} as const;

export type MessageTypeValue = (typeof MessageType)[keyof typeof MessageType];

export type PanelRequest =
  | { type: typeof MessageType.StartInspection }
  | { type: typeof MessageType.StopInspection }
  | { type: typeof MessageType.GetState }
  | { type: typeof MessageType.GetSnapshot }
  | { type: typeof MessageType.NavigateHierarchy; direction: HierarchyDirection; index?: number }
  | { type: typeof MessageType.ReplayMotion; action: MotionReplayAction; animationId?: string }
  | { type: typeof MessageType.ExtractDesignSystem; requestId: string };

export type ContentRequest =
  | { type: typeof MessageType.Ping }
  | { type: typeof MessageType.StartInspection }
  | { type: typeof MessageType.StopInspection }
  | { type: typeof MessageType.GetSnapshot }
  | { type: typeof MessageType.NavigateHierarchy; direction: HierarchyDirection; index?: number }
  | { type: typeof MessageType.ReplayMotion; action: MotionReplayAction; animationId?: string }
  | { type: typeof MessageType.ExtractDesignSystem; requestId: string };

export type ContentEvent =
  | { type: typeof MessageType.Pong }
  | { type: typeof MessageType.ElementSelected; payload: ElementInfo }
  | { type: typeof MessageType.StateChanged; payload: InspectionState }
  | { type: typeof MessageType.RuntimeError; payload: { message: string; code?: string } }
  | { type: typeof MessageType.SnapshotChanged; payload: ElementSnapshot }
  | { type: typeof MessageType.SelectionCleared; payload: SelectionClearedPayload }
  | { type: typeof MessageType.DesignSystemChanged; payload: DesignSystemSnapshot };

export type PanelEvent = Exclude<ContentEvent, { type: typeof MessageType.Pong }>;

export interface RequestResult {
  ok: boolean;
  error?: string;
  errorCode?: string;
  state?: InspectionState;
}

export interface StateResult extends RequestResult {
  state: InspectionState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return isNonEmptyString(value) && value.length <= maxLength;
}

function isBoundedStringArray(value: unknown, maxLength: number, maxItems: number): boolean {
  return Array.isArray(value) && value.length <= maxItems &&
    value.every((entry) => isBoundedString(entry, maxLength));
}

function isIntegerInRange(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableFiniteNumber(value: unknown): boolean {
  return value === null || isFiniteNumber(value);
}

function isMotionTarget(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.tag) &&
    isNullableString(value.id) &&
    isStringArray(value.classes) &&
    isFiniteNumber(value.depth)
  );
}

function isMotionTiming(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isNullableFiniteNumber(value.duration) &&
    isNullableFiniteNumber(value.delay) &&
    isNullableFiniteNumber(value.iterations) &&
    isNullableFiniteNumber(value.currentTime) &&
    isNullableFiniteNumber(value.playbackRate) &&
    typeof value.infinite === 'boolean' &&
    isNullableString(value.direction) &&
    isNullableString(value.fill) &&
    isNullableString(value.easing) &&
    isNullableString(value.playState)
  );
}

function isMotionKeyframeProperty(value: unknown): boolean {
  return isRecord(value) && isNonEmptyString(value.name) && isNonEmptyString(value.value);
}

function isMotionKeyframe(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isFiniteNumber(value.offset) &&
    value.offset >= 0 &&
    value.offset <= 1 &&
    Array.isArray(value.properties) &&
    value.properties.every(isMotionKeyframeProperty) &&
    isNullableString(value.easing) &&
    (value.source === 'computed' || value.source === 'declared')
  );
}

function isMotionAnimation(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.id) &&
    ['css-animation', 'css-transition', 'waapi'].includes(String(value.source)) &&
    isNullableString(value.name) &&
    isMotionTarget(value.target) &&
    isMotionTiming(value.timing) &&
    Array.isArray(value.keyframes) &&
    value.keyframes.every(isMotionKeyframe) &&
    typeof value.replayable === 'boolean'
  );
}

function isMotionTransition(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.id) &&
    ['declared', 'running', 'observed'].includes(String(value.kind)) &&
    isMotionTarget(value.target) &&
    isNonEmptyString(value.property) &&
    isNullableFiniteNumber(value.duration) &&
    isNullableFiniteNumber(value.delay) &&
    isNullableFiniteNumber(value.elapsedTime) &&
    isNullableString(value.easing) &&
    isNullableString(value.raw) &&
    isNullableString(value.before) &&
    isNullableString(value.after)
  );
}

function isMotionKeyframes(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.name) &&
    typeof value.referenced === 'boolean' &&
    Array.isArray(value.keyframes) &&
    value.keyframes.every(isMotionKeyframe)
  );
}

function isEasingInfo(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.value !== 'string') return false;
  if (!['linear', 'keyword', 'cubic-bezier', 'steps', 'unsupported'].includes(String(value.kind))) return false;
  if (typeof value.visualizable !== 'boolean') return false;
  if (value.points === null) return true;
  return (
    Array.isArray(value.points) &&
    value.points.length === 4 &&
    value.points.every((point) => isFiniteNumber(point))
  );
}

export function isMotionSnapshot(value: unknown): value is MotionSnapshot {
  if (!isRecord(value)) return false;
  const summary = value.summary;
  if (!isRecord(summary)) return false;
  for (const key of [
    'animationCount',
    'cssAnimationCount',
    'transitionCount',
    'waapiCount',
    'runningCount',
    'keyframeSetCount',
  ]) {
    if (!isFiniteNumber(summary[key])) return false;
  }
  if (typeof summary.reducedMotion !== 'boolean' || !isStringArray(summary.animatedProperties)) return false;
  if (!Array.isArray(value.animations) || !value.animations.every(isMotionAnimation)) return false;
  if (!Array.isArray(value.transitions) || !value.transitions.every(isMotionTransition)) return false;
  if (!Array.isArray(value.keyframes) || !value.keyframes.every(isMotionKeyframes)) return false;
  if (!Array.isArray(value.easings) || !value.easings.every(isEasingInfo)) return false;
  if (!isNullableString(value.declaredAnimation) || !isNullableString(value.declaredTransition)) return false;
  if (!isRecord(value.interaction)) return false;
  if (
    typeof value.interaction.hover !== 'boolean' ||
    typeof value.interaction.focus !== 'boolean' ||
    typeof value.interaction.active !== 'boolean'
  ) {
    return false;
  }
  if (!isRecord(value.stylesheetAccess)) return false;
  if (!isFiniteNumber(value.stylesheetAccess.readable) || !isFiniteNumber(value.stylesheetAccess.inaccessible)) {
    return false;
  }
  if (!isRecord(value.replay)) return false;
  if (
    !isNullableString(value.replay.isolatedActiveId) ||
    !isStringArray(value.replay.liveRestorableIds)
  ) {
    return false;
  }
  return isStringArray(value.limitations) && isNonEmptyString(value.capturedAt);
}

export function isMotionReplayAction(value: unknown): value is MotionReplayAction {
  return (
    value === 'isolated-start' ||
    value === 'isolated-stop' ||
    value === 'live-restart' ||
    value === 'live-restore'
  );
}

function isDesignSystemCategory(value: unknown): boolean {
  return DESIGN_SYSTEM_CATEGORIES.includes(value as (typeof DESIGN_SYSTEM_CATEGORIES)[number]);
}

export function isDesignSystemRequest(value: unknown): value is {
  type: typeof MessageType.ExtractDesignSystem;
  requestId: string;
} {
  return isRecord(value) &&
    value.type === MessageType.ExtractDesignSystem &&
    isBoundedString(value.requestId, DESIGN_SYSTEM_LIMITS.maxRequestIdLength);
}

function isOrigin(value: unknown): boolean {
  if (!isBoundedString(value, DESIGN_SYSTEM_LIMITS.maxValueLength)) return false;
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
}

function hasUnsafeCss(value: string): boolean {
  return /[<>{};]/.test(value) ||
    /(?:url|expression)\s*\(/i.test(value) ||
    /(?:data:|javascript:)/i.test(value);
}

function isBoundedSelector(value: unknown): boolean {
  if (!isBoundedString(value, DESIGN_SYSTEM_LIMITS.maxSelectorLength)) return false;
  if (/[<>{};\[\]\\]/.test(value)) return false;
  if (/(?:url|expression)\s*\(/i.test(value)) return false;
  if (/(?:data:|javascript:)/i.test(value)) return false;
  if (value.includes('#')) return false;
  if (value.includes('\\')) return false;
  return (value.match(/\./g) ?? []).length <= 2;
}

function isDesignDetectedValue(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isBoundedString(value.value, DESIGN_SYSTEM_LIMITS.maxValueLength)) return false;
  if (!isBoundedString(value.normalized, DESIGN_SYSTEM_LIMITS.maxValueLength)) return false;
  if (hasUnsafeCss(value.value) || hasUnsafeCss(value.normalized)) return false;
  if (!isIntegerInRange(value.count, 1, DESIGN_SYSTEM_LIMITS.maxElements)) return false;
  return isBoundedStringArray(
    value.sourceProperties,
    DESIGN_SYSTEM_LIMITS.maxPropertyNameLength,
    DESIGN_SYSTEM_LIMITS.maxPropertiesPerElement,
  );
}

function isDesignDetectedValues(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const keys = ['palette', 'typography', 'spacing', 'effects', 'gradients'] as const;
  return keys.every((key) => {
    const entries = value[key];
    return Array.isArray(entries) &&
      entries.length <= DESIGN_SYSTEM_LIMITS.maxDetectedValuesPerCategory &&
      entries.every(isDesignDetectedValue);
  });
}

function isDesignExemplar(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isBoundedString(value.tag, DESIGN_SYSTEM_LIMITS.maxTagLength)) return false;
  if (value.roleHint !== null && !isBoundedString(value.roleHint, DESIGN_SYSTEM_LIMITS.maxTagLength)) {
    return false;
  }
  return isBoundedSelector(value.selector);
}

function isDesignTokenCandidate(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isBoundedString(value.id, DESIGN_SYSTEM_LIMITS.maxRequestIdLength)) return false;
  if (!isDesignSystemCategory(value.category)) return false;
  if (typeof value.inferredName !== 'string' ||
    value.inferredName.length > DESIGN_SYSTEM_LIMITS.maxTokenNameLength ||
    !/^--[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.inferredName)
  ) {
    return false;
  }
  if (value.nameBasis !== 'rank' && value.nameBasis !== 'heuristic') return false;
  if (!isRecord(value.detected)) return false;
  if (!isIntegerInRange(
    value.detected.support,
    DESIGN_SYSTEM_LIMITS.minTokenSupport,
    DESIGN_SYSTEM_LIMITS.maxElements,
  )) {
    return false;
  }
  const values = value.detected.values;
  const exemplars = value.detected.exemplars;
  if (!Array.isArray(values) || values.length === 0 ||
    values.length > DESIGN_SYSTEM_LIMITS.maxValuesPerToken || !values.every(isDesignDetectedValue)
  ) {
    return false;
  }
  return Array.isArray(exemplars) &&
    exemplars.length <= DESIGN_SYSTEM_LIMITS.maxExemplarsPerToken &&
    exemplars.every(isDesignExemplar);
}

function isDesignSystemSummary(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const counts: Array<[unknown, number]> = [
    [value.elementsScanned, DESIGN_SYSTEM_LIMITS.maxElements],
    [value.elementsSkipped, DESIGN_SYSTEM_LIMITS.maxElements],
    [value.textElementsInspected, DESIGN_SYSTEM_LIMITS.maxElements],
    [value.stylesheetsReadable, DESIGN_SYSTEM_LIMITS.maxStylesheets],
    [value.stylesheetsInaccessible, DESIGN_SYSTEM_LIMITS.maxStylesheets],
  ];
  if (!counts.every(([count, max]) => isIntegerInRange(count, 0, max))) return false;
  const tokensByCategory = value.tokensByCategory;
  if (!isRecord(tokensByCategory)) return false;
  return DESIGN_SYSTEM_CATEGORIES.every((category) =>
    isIntegerInRange(
      tokensByCategory[category],
      0,
      DESIGN_SYSTEM_LIMITS.maxTokensPerCategory,
    ),
  );
}

export function isDesignSystemSnapshot(value: unknown): value is DesignSystemSnapshot {
  if (!isRecord(value)) return false;
  if (!isBoundedString(value.requestId, DESIGN_SYSTEM_LIMITS.maxRequestIdLength)) return false;
  if (!isBoundedString(value.capturedAt, DESIGN_SYSTEM_LIMITS.maxValueLength)) return false;
  if (!isOrigin(value.origin)) return false;
  if (!isDesignSystemSummary(value.summary)) return false;
  if (!isDesignDetectedValues(value.detected)) return false;
  if (!Array.isArray(value.tokens) || value.tokens.length > DESIGN_SYSTEM_LIMITS.maxTotalTokens ||
    !value.tokens.every(isDesignTokenCandidate)
  ) {
    return false;
  }
  if (!isBoundedStringArray(value.unavailable, DESIGN_SYSTEM_LIMITS.maxValueLength, DESIGN_SYSTEM_LIMITS.maxNotes)) {
    return false;
  }
  if (!isBoundedStringArray(value.limitations, DESIGN_SYSTEM_LIMITS.maxValueLength, DESIGN_SYSTEM_LIMITS.maxNotes)) {
    return false;
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return false;
  }
  return serialized.length <= DESIGN_SYSTEM_LIMITS.maxPayloadChars;
}

function isDimensions(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.width === 'number' &&
    Number.isFinite(value.width) &&
    typeof value.height === 'number' &&
    Number.isFinite(value.height)
  );
}

function isEdges(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return ['top', 'right', 'bottom', 'left'].every((side) => isNullableString(value[side]));
}

function isTypographyValue(value: unknown): boolean {
  return isRecord(value) && isNullableString(value.value) && typeof value.matchesParent === 'boolean';
}

function isParsedColor(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.original) &&
    isNullableString(value.hex) &&
    isNullableString(value.rgb) &&
    isNullableString(value.hsl) &&
    typeof value.alpha === 'number' &&
    Number.isFinite(value.alpha) &&
    typeof value.supported === 'boolean'
  );
}

function isGradientInfo(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.property) || !isNonEmptyString(value.raw)) return false;
  if (!['linear', 'radial', 'conic', 'unknown'].includes(String(value.kind))) return false;
  if (!isNullableString(value.direction) || !Array.isArray(value.stops)) return false;
  return value.stops.every(
    (stop) =>
      isRecord(stop) && isNonEmptyString(stop.color) && isNullableString(stop.position),
  );
}

function isHierarchyNode(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.tag) &&
    isNullableString(value.id) &&
    isStringArray(value.classes) &&
    typeof value.depth === 'number' &&
    Number.isFinite(value.depth)
  );
}

export function isElementInfo(value: unknown): value is ElementInfo {
  if (!isRecord(value)) return false;
  const info = value as Record<string, unknown>;
  if (!isNonEmptyString(info.tag)) return false;
  if (info.id !== null && typeof info.id !== 'string') return false;
  if (!Array.isArray(info.classes) || !info.classes.every((c) => typeof c === 'string')) {
    return false;
  }
  if (!isRecord(info.dimensions)) return false;
  const dims = info.dimensions as Record<string, unknown>;
  if (typeof dims.width !== 'number' || !Number.isFinite(dims.width)) return false;
  if (typeof dims.height !== 'number' || !Number.isFinite(dims.height)) return false;
  for (const key of [
    'backgroundColor',
    'color',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'padding',
    'margin',
    'borderRadius',
    'boxShadow',
    'display',
    'position',
    'lineHeight',
    'letterSpacing',
    'textAlign',
    'textTransform',
    'opacity',
    'overflow',
    'gap',
    'flexDirection',
    'alignItems',
    'justifyContent',
    'gridTemplateColumns',
    'borderWidth',
    'borderStyle',
    'borderColor',
    'transition',
    'animation',
    'sourceUrl',
  ] as const) {
    if (info[key] !== null && info[key] !== undefined && typeof info[key] !== 'string') {
      return false;
    }
  }
  return isNonEmptyString(info.capturedAt);
}

export function isElementSnapshot(value: unknown): value is ElementSnapshot {
  if (!isRecord(value)) return false;
  if (!isElementInfo(value.element)) return false;
  if (!isNonEmptyString(value.capturedAt)) return false;
  if (!isRecord(value.boxModel)) return false;
  const box = value.boxModel as Record<string, unknown>;
  if (!isNullableString(box.boxSizing) || !isNullableString(box.computedWidth)) return false;
  if (!isNullableString(box.computedHeight) || !isDimensions(box.measured)) return false;
  if (box.contentWidth !== null && typeof box.contentWidth !== 'number') return false;
  if (box.contentHeight !== null && typeof box.contentHeight !== 'number') return false;
  if (box.estimatedOuter !== null && !isDimensions(box.estimatedOuter)) return false;
  if (!isEdges(box.margin) || !isEdges(box.border) || !isEdges(box.padding)) return false;
  if (!isStringArray(box.notes)) return false;
  if (!Array.isArray(value.properties)) return false;
  if (
    !value.properties.every(
      (property) =>
        isRecord(property) &&
        isNonEmptyString(property.name) &&
        isNonEmptyString(property.value) &&
        isNonEmptyString(property.category),
    )
  ) {
    return false;
  }
  if (!isRecord(value.typography)) return false;
  if (!Object.values(value.typography).every(isTypographyValue)) return false;
  if (!Array.isArray(value.colors)) return false;
  if (
    !value.colors.every(
      (entry) =>
        isRecord(entry) &&
        isNonEmptyString(entry.property) &&
        isNonEmptyString(entry.raw) &&
        (entry.parsed === null || isParsedColor(entry.parsed)),
    )
  ) {
    return false;
  }
  if (!Array.isArray(value.gradients) || !value.gradients.every(isGradientInfo)) return false;
  if (!isRecord(value.hierarchy)) return false;
  const hierarchy = value.hierarchy as Record<string, unknown>;
  if (hierarchy.parent !== null && !isHierarchyNode(hierarchy.parent)) return false;
  if (!Array.isArray(hierarchy.children) || !hierarchy.children.every(isHierarchyNode)) return false;
  if (hierarchy.previousSibling !== null && !isHierarchyNode(hierarchy.previousSibling)) return false;
  if (hierarchy.nextSibling !== null && !isHierarchyNode(hierarchy.nextSibling)) return false;
  if (!isMotionSnapshot(value.motion)) return false;
  return isStringArray(value.limitations);
}

export function isSelectionClearedPayload(value: unknown): value is SelectionClearedPayload {
  return isRecord(value) && isNonEmptyString(value.reason);
}

export function isInspectionState(value: unknown): value is InspectionState {
  if (!isRecord(value)) return false;
  if (typeof value.active !== 'boolean') return false;
  if (value.tabId === null || (typeof value.tabId === 'number' && Number.isInteger(value.tabId))) {
    return value.lastTabId === undefined || value.lastTabId === null ||
      (typeof value.lastTabId === 'number' && Number.isInteger(value.lastTabId));
  }
  return false;
}

export function isPanelEvent(value: unknown): value is PanelEvent {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  switch (value.type) {
    case MessageType.ElementSelected:
      return isElementInfo(value.payload);
    case MessageType.StateChanged:
      return isInspectionState(value.payload);
    case MessageType.RuntimeError:
      return isRecord(value.payload) && isNonEmptyString(value.payload.message) &&
        (value.payload.code === undefined || typeof value.payload.code === 'string');
    case MessageType.SnapshotChanged:
      return isElementSnapshot(value.payload);
    case MessageType.SelectionCleared:
      return isSelectionClearedPayload(value.payload);
    case MessageType.DesignSystemChanged:
      return isDesignSystemSnapshot(value.payload);
    default:
      return false;
  }
}

export function isContentEvent(value: unknown): value is ContentEvent {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  if (value.type === MessageType.Pong) return true;
  return isPanelEvent(value);
}

export function isRequestResult(value: unknown): value is RequestResult {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return false;
  if (value.error !== undefined && typeof value.error !== 'string') return false;
  if (value.errorCode !== undefined && typeof value.errorCode !== 'string') return false;
  if (value.state !== undefined && !isInspectionState(value.state)) return false;
  return true;
}

export function isStateResult(value: unknown): value is StateResult {
  return isRequestResult(value) && isInspectionState((value as RequestResult).state);
}

export function isHierarchyDirection(value: unknown): value is HierarchyDirection {
  return (
    value === 'parent' ||
    value === 'child' ||
    value === 'previous-sibling' ||
    value === 'next-sibling'
  );
}

export function isPanelRequest(value: unknown): value is PanelRequest {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  switch (value.type) {
    case MessageType.StartInspection:
    case MessageType.StopInspection:
    case MessageType.GetState:
    case MessageType.GetSnapshot:
      return true;
    case MessageType.NavigateHierarchy:
      return isHierarchyDirection(value.direction) &&
        (value.index === undefined || (typeof value.index === 'number' && Number.isInteger(value.index)));
    case MessageType.ReplayMotion:
      return isMotionReplayAction(value.action) &&
        (value.animationId === undefined || isNonEmptyString(value.animationId));
    case MessageType.ExtractDesignSystem:
      return isDesignSystemRequest(value);
    default:
      return false;
  }
}
