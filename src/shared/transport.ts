import {
  MessageType,
  isContentEvent,
  isDesignSystemRequest,
  isRequestResult,
  isStateResult,
  isWebsiteBlueprintRequest,
  type ContentEvent,
  type ContentRequest,
  type PanelRequest,
  type RequestResult,
} from './messages';
import type { HierarchyDirection, InspectionState, MotionReplayAction } from './types';

export function hasRuntime(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
}

export function runtimeUnavailableError(): Error {
  return new Error('Extension runtime is unavailable. Load PixelPeek as an unpacked extension.');
}

export class ExtensionRequestError extends Error {
  readonly code: string | null;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'ExtensionRequestError';
    this.code = code ?? null;
  }
}

export async function sendToBackground(message: PanelRequest): Promise<RequestResult> {
  if (!hasRuntime()) throw runtimeUnavailableError();
  const response: unknown = await chrome.runtime.sendMessage(message);
  if (!isRequestResult(response)) throw new Error('Invalid response from the background service worker.');
  if (!response.ok) {
    throw new ExtensionRequestError(
      response.error ?? 'The request could not be completed.',
      response.errorCode,
    );
  }
  return response;
}

export async function getInspectionState(): Promise<InspectionState> {
  if (!hasRuntime()) throw runtimeUnavailableError();
  const response: unknown = await chrome.runtime.sendMessage({ type: MessageType.GetState });
  if (!isStateResult(response)) throw new Error('Invalid state response from the background service worker.');
  return response.state;
}

export async function getSnapshot(): Promise<RequestResult> {
  return sendToBackground({ type: MessageType.GetSnapshot });
}

export async function navigateHierarchy(
  direction: HierarchyDirection,
  index?: number,
): Promise<RequestResult> {
  return sendToBackground({ type: MessageType.NavigateHierarchy, direction, index });
}

export async function replayMotion(action: MotionReplayAction, animationId?: string): Promise<RequestResult> {
  return sendToBackground({
    type: MessageType.ReplayMotion,
    action,
    ...(animationId ? { animationId } : {}),
  });
}

export async function extractDesignSystem(requestId: string): Promise<RequestResult> {
  const request = { type: MessageType.ExtractDesignSystem, requestId } as const;
  if (!isDesignSystemRequest(request)) throw new Error('Invalid design-system request.');
  return sendToBackground(request);
}

export async function extractWebsiteBlueprint(requestId: string): Promise<RequestResult> {
  const request = { type: MessageType.ExtractWebsiteBlueprint, requestId } as const;
  if (!isWebsiteBlueprintRequest(request)) throw new Error('Invalid website blueprint request.');
  return sendToBackground(request);
}

export interface ActiveTabInfo {
  tabId: number | null;
  url: string | null;
  origin: string | null;
}

function originOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export async function getActiveTabInfo(): Promise<ActiveTabInfo> {
  if (!hasRuntime()) throw runtimeUnavailableError();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url ?? null;
  return {
    tabId: tab?.id ?? null,
    url,
    origin: originOf(url),
  };
}

export function onActiveTabChanged(listener: () => void): () => void {
  if (!hasRuntime()) return () => {};
  const onActivated = () => listener();
  const onUpdated = (_tabId: number, changeInfo: { url?: string }) => {
    if (changeInfo.url !== undefined) listener();
  };
  const onRemoved = () => listener();
  chrome.tabs.onActivated.addListener(onActivated);
  chrome.tabs.onUpdated.addListener(onUpdated);
  chrome.tabs.onRemoved.addListener(onRemoved);
  return () => {
    chrome.tabs.onActivated.removeListener(onActivated);
    chrome.tabs.onUpdated.removeListener(onUpdated);
    chrome.tabs.onRemoved.removeListener(onRemoved);
  };
}

export async function pingTab(tabId: number): Promise<boolean> {
  if (!hasRuntime()) return false;
  try {
    const response: unknown = await chrome.tabs.sendMessage(tabId, { type: MessageType.Ping });
    return isContentEvent(response) && response.type === MessageType.Pong;
  } catch {
    return false;
  }
}

export async function sendToTab(tabId: number, message: ContentRequest): Promise<void> {
  if (!hasRuntime()) throw runtimeUnavailableError();
  await chrome.tabs.sendMessage(tabId, message);
}

export function onPanelEvent(listener: (event: ContentEvent) => void): () => void {
  if (!hasRuntime()) return () => {};
  const handler = (message: unknown) => {
    if (isContentEvent(message)) listener(message);
  };
  chrome.runtime.onMessage.addListener(handler);
  return () => chrome.runtime.onMessage.removeListener(handler);
}

export function openPanel(tabId: number): Promise<void> {
  return chrome.sidePanel.open({ tabId });
}
