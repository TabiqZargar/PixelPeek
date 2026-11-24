import {
  MessageType,
  isContentEvent,
  isRequestResult,
  isStateResult,
  type ContentEvent,
  type ContentRequest,
  type PanelRequest,
  type RequestResult,
} from './messages';
import type { InspectionState } from './types';

export function hasRuntime(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
}

export function runtimeUnavailableError(): Error {
  return new Error('Extension runtime is unavailable. Load PixelPeek as an unpacked extension.');
}

export async function sendToBackground(message: PanelRequest): Promise<RequestResult> {
  if (!hasRuntime()) throw runtimeUnavailableError();
  const response: unknown = await chrome.runtime.sendMessage(message);
  if (!isRequestResult(response)) throw new Error('Invalid response from the background service worker.');
  if (!response.ok) throw new Error(response.error ?? 'The request could not be completed.');
  return response;
}

export async function getInspectionState(): Promise<InspectionState> {
  if (!hasRuntime()) throw runtimeUnavailableError();
  const response: unknown = await chrome.runtime.sendMessage({ type: MessageType.GetState });
  if (!isStateResult(response)) throw new Error('Invalid state response from the background service worker.');
  return response.state;
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
