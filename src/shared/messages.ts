import type {
  ElementInfo,
  ElementSnapshot,
  HierarchyDirection,
  InspectionState,
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
} as const;

export type MessageTypeValue = (typeof MessageType)[keyof typeof MessageType];

export type PanelRequest =
  | { type: typeof MessageType.StartInspection }
  | { type: typeof MessageType.StopInspection }
  | { type: typeof MessageType.GetState }
  | { type: typeof MessageType.GetSnapshot }
  | { type: typeof MessageType.NavigateHierarchy; direction: HierarchyDirection; index?: number };

export type ContentRequest =
  | { type: typeof MessageType.Ping }
  | { type: typeof MessageType.StartInspection }
  | { type: typeof MessageType.StopInspection }
  | { type: typeof MessageType.GetSnapshot }
  | { type: typeof MessageType.NavigateHierarchy; direction: HierarchyDirection; index?: number };

export type ContentEvent =
  | { type: typeof MessageType.Pong }
  | { type: typeof MessageType.ElementSelected; payload: ElementInfo }
  | { type: typeof MessageType.StateChanged; payload: InspectionState }
  | { type: typeof MessageType.RuntimeError; payload: { message: string; code?: string } }
  | { type: typeof MessageType.SnapshotChanged; payload: ElementSnapshot }
  | { type: typeof MessageType.SelectionCleared; payload: SelectionClearedPayload };

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
    default:
      return false;
  }
}
