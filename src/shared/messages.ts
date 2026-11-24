import type { ElementInfo, InspectionState } from './types';

export const MessageType = {
  Ping: 'pixelpeek/ping',
  Pong: 'pixelpeek/pong',
  StartInspection: 'pixelpeek/start',
  StopInspection: 'pixelpeek/stop',
  GetState: 'pixelpeek/get-state',
  ElementSelected: 'pixelpeek/element-selected',
  StateChanged: 'pixelpeek/state-changed',
  RuntimeError: 'pixelpeek/runtime-error',
} as const;

export type MessageTypeValue = (typeof MessageType)[keyof typeof MessageType];

export type PanelRequest =
  | { type: typeof MessageType.StartInspection }
  | { type: typeof MessageType.StopInspection }
  | { type: typeof MessageType.GetState };

export type ContentRequest =
  | { type: typeof MessageType.Ping }
  | { type: typeof MessageType.StartInspection }
  | { type: typeof MessageType.StopInspection };

export type ContentEvent =
  | { type: typeof MessageType.Pong }
  | { type: typeof MessageType.ElementSelected; payload: ElementInfo }
  | { type: typeof MessageType.StateChanged; payload: InspectionState }
  | { type: typeof MessageType.RuntimeError; payload: { message: string } };

export type PanelEvent =
  | { type: typeof MessageType.ElementSelected; payload: ElementInfo }
  | { type: typeof MessageType.StateChanged; payload: InspectionState }
  | { type: typeof MessageType.RuntimeError; payload: { message: string } };

export interface RequestResult {
  ok: boolean;
  error?: string;
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
    'sourceUrl',
  ] as const) {
    if (info[key] !== null && typeof info[key] !== 'string') return false;
  }
  return isNonEmptyString(info.capturedAt);
}

export function isInspectionState(value: unknown): value is InspectionState {
  if (!isRecord(value)) return false;
  const state = value as Record<string, unknown>;
  if (typeof state.active !== 'boolean') return false;
  return state.tabId === null || (typeof state.tabId === 'number' && Number.isInteger(state.tabId));
}

export function isPanelEvent(value: unknown): value is PanelEvent {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  switch (value.type) {
    case MessageType.ElementSelected:
      return isElementInfo(value.payload);
    case MessageType.StateChanged:
      return isInspectionState(value.payload);
    case MessageType.RuntimeError:
      return isRecord(value.payload) && isNonEmptyString(value.payload.message);
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
  if (value.state !== undefined && !isInspectionState(value.state)) return false;
  return true;
}

export function isStateResult(value: unknown): value is StateResult {
  return isRequestResult(value) && isInspectionState((value as RequestResult).state);
}
