import {
  MessageType,
  isDesignSystemRequest,
  isDesignSystemSnapshot,
  isHierarchyDirection,
  isInspectionState,
  isMotionReplayAction,
  isPanelEvent,
  type ContentEvent,
  type ContentRequest,
  type PanelEvent,
  type RequestResult,
  type StateResult,
} from '../shared/messages';
import { IDLE_STATE, type HierarchyDirection, type InspectionState, type MotionReplayAction } from '../shared/types';
import { describeMessageError, isInspectableUrl } from '../shared/tabs';
import { pingTab, sendToTab } from '../shared/transport';

const STATE_KEY = 'inspection';
const DESIGN_REQUEST_KEY = 'design-system-request';
const BLOCKED_DESIGN_HOSTS = new Set([
  'chromewebstore.google.com',
  'chrome.google.com',
  'microsoftedge.microsoft.com',
  'addons.mozilla.org',
]);

interface DesignSystemRequestState {
  tabId: number;
  requestId: string;
  url: string;
}

type PanelDesignEvent = Extract<PanelEvent, { type: typeof MessageType.DesignSystemChanged }>;

function isDesignInspectableUrl(url: string | undefined): boolean {
  if (!isInspectableUrl(url)) return false;
  try {
    const hostname = new URL(url!).hostname.toLowerCase().replace(/\.$/, '');
    return !BLOCKED_DESIGN_HOSTS.has(hostname) &&
      ![...BLOCKED_DESIGN_HOSTS].some((host) => hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

async function getDesignRequest(): Promise<DesignSystemRequestState | null> {
  const stored = await chrome.storage.session.get(DESIGN_REQUEST_KEY);
  const value: unknown = stored[DESIGN_REQUEST_KEY];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const request = value as Record<string, unknown>;
  if (typeof request.tabId !== 'number' || !Number.isInteger(request.tabId)) return null;
  if (!isDesignSystemRequest({
    type: MessageType.ExtractDesignSystem,
    requestId: request.requestId,
  })) return null;
  if (typeof request.url !== 'string' || !isDesignInspectableUrl(request.url)) return null;
  return {
    tabId: request.tabId,
    requestId: request.requestId as string,
    url: request.url,
  };
}

async function setDesignRequest(request: DesignSystemRequestState): Promise<void> {
  await chrome.storage.session.set({ [DESIGN_REQUEST_KEY]: request });
}

async function clearDesignRequest(): Promise<void> {
  await chrome.storage.session.remove(DESIGN_REQUEST_KEY);
}

async function clearDesignRequestForTab(tabId: number): Promise<void> {
  const pending = await getDesignRequest();
  if (pending?.tabId === tabId) await clearDesignRequest();
}

async function clearDesignRequestOnActivation(tabId: number): Promise<void> {
  const pending = await getDesignRequest();
  if (pending && pending.tabId !== tabId) await clearDesignRequest();
}

async function getState(): Promise<InspectionState> {
  const stored = await chrome.storage.session.get(STATE_KEY);
  const value: unknown = stored[STATE_KEY];
  return isInspectionState(value) ? value : IDLE_STATE;
}

async function setState(state: InspectionState): Promise<void> {
  await chrome.storage.session.set({ [STATE_KEY]: state });
}

function broadcast(event: PanelEvent): void {
  void chrome.runtime.sendMessage(event).catch(() => {
    /* no panel is listening; state is still persisted for the next one */
  });
}

async function stopTab(tabId: number): Promise<void> {
  try {
    await sendToTab(tabId, { type: MessageType.StopInspection });
  } catch {
    /* the tab navigated or closed on its own */
  }
}

async function endInspection(state: InspectionState): Promise<void> {
  if (state.tabId !== null) await stopTab(state.tabId);
  const idle: InspectionState = {
    ...IDLE_STATE,
    lastTabId: state.tabId ?? state.lastTabId ?? null,
  };
  await setState(idle);
  broadcast({ type: MessageType.StateChanged, payload: idle });
}

async function clearInspection(state: InspectionState): Promise<void> {
  if (state.tabId !== null) await stopTab(state.tabId);
  await setState(IDLE_STATE);
  broadcast({ type: MessageType.SelectionCleared, payload: { reason: 'inspection was cleared' } });
  broadcast({ type: MessageType.StateChanged, payload: IDLE_STATE });
}

async function forwardToContent(message: ContentRequest): Promise<RequestResult> {
  const state = await getState();
  const tabId = state.tabId ?? state.lastTabId;
  if (tabId === null || tabId === undefined) {
    return {
      ok: false,
      error: 'Select an element before using the inspector tools.',
      errorCode: 'no-selection',
    };
  }
  try {
    await sendToTab(tabId, message);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: describeMessageError(error),
      errorCode: 'content-unreachable',
    };
  }
}

async function extractDesignSystem(request: unknown): Promise<RequestResult> {
  if (!isDesignSystemRequest(request)) {
    return {
      ok: false,
      error: 'Invalid design-system request.',
      errorCode: 'invalid-request',
    };
  }

  let tabId: number | undefined;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || tab.id === undefined) {
      return { ok: false, error: 'There is no active tab to inspect.', errorCode: 'no-active-tab' };
    }
    const url = tab.url;
    if (!isDesignInspectableUrl(url)) {
      return {
        ok: false,
        error: 'This page cannot be inspected. Try a regular http(s) website.',
        errorCode: 'unsupported-url',
      };
    }

    tabId = tab.id;
    await setDesignRequest({
      tabId,
      requestId: request.requestId,
      url: url ?? '',
    });

    if (!(await pingTab(tabId))) {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      if (!(await pingTab(tabId))) {
        await clearDesignRequest();
        return {
          ok: false,
          error: 'The design system extractor could not start on this page.',
          errorCode: 'injection-failed',
        };
      }
    }
    await sendToTab(tabId, {
      type: MessageType.ExtractDesignSystem,
      requestId: request.requestId,
    });
    return { ok: true };
  } catch (error) {
    const current = await getDesignRequest().catch(() => null);
    if (
      current?.requestId === request.requestId &&
      (tabId === undefined || current.tabId === tabId)
    ) {
      await clearDesignRequest().catch(() => undefined);
    }
    return {
      ok: false,
      error: describeMessageError(error),
      errorCode: 'design-system-extraction-failed',
    };
  }
}

async function onDesignSystemEvent(
  message: PanelDesignEvent,
  sender: chrome.runtime.MessageSender,
): Promise<void> {
  if (!isDesignSystemSnapshot(message.payload)) return;
  const pending = await getDesignRequest();
  if (!pending) return;
  const senderTabId = sender.tab?.id;
  if (senderTabId === undefined || senderTabId !== pending.tabId) return;
  if (message.payload.requestId !== pending.requestId) return;
  const senderUrl = sender.tab?.url;
  if (!isDesignInspectableUrl(senderUrl) || senderUrl !== pending.url) {
    await clearDesignRequest();
    return;
  }
  await clearDesignRequest();
  broadcast(message);
}

async function startInspection(): Promise<RequestResult> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id === undefined) {
    return {
      ok: false,
      error: 'There is no active tab to inspect.',
      errorCode: 'no-active-tab',
    };
  }
  if (!isInspectableUrl(tab.url)) {
    return {
      ok: false,
      error: 'This page cannot be inspected. Try a regular http(s) website.',
      errorCode: 'unsupported-url',
    };
  }

  const tabId = tab.id;
  const previous = await getState();
  if (previous.active && previous.tabId !== tabId) await stopTab(previous.tabId ?? tabId);

  try {
    if (!(await pingTab(tabId))) {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      if (!(await pingTab(tabId))) {
        return {
          ok: false,
          error: 'The inspector could not start on this page.',
          errorCode: 'injection-failed',
        };
      }
    }
    await sendToTab(tabId, { type: MessageType.StartInspection });
  } catch (error) {
    return {
      ok: false,
      error: describeMessageError(error),
      errorCode: 'inspection-start-failed',
    };
  }

  const state: InspectionState = { tabId, active: true, lastTabId: tabId };
  await setState(state);
  broadcast({ type: MessageType.StateChanged, payload: state });
  return { ok: true, state };
}

async function stopInspection(): Promise<RequestResult> {
  const state = await getState();
  await endInspection(state);
  return {
    ok: true,
    state: { ...IDLE_STATE, lastTabId: state.tabId ?? state.lastTabId ?? null },
  };
}

type PanelBoundEvent = Exclude<ContentEvent, { type: typeof MessageType.Pong }>;

function matchesDesignSender(
  sender: chrome.runtime.MessageSender,
  pending: DesignSystemRequestState,
): boolean {
  const senderTabId = sender.tab?.id;
  if (senderTabId === undefined || senderTabId !== pending.tabId) return false;
  const senderUrl = sender.tab?.url;
  return isDesignInspectableUrl(senderUrl) && senderUrl === pending.url;
}

function matchesContentSender(
  sender: chrome.runtime.MessageSender | undefined,
  state: InspectionState,
): boolean {
  const senderTabId = sender?.tab?.id;
  const expectedTabId = state.tabId ?? state.lastTabId;
  return senderTabId !== undefined && expectedTabId !== null && senderTabId === expectedTabId;
}

async function onContentEvent(
  message: PanelBoundEvent,
  sender?: chrome.runtime.MessageSender,
): Promise<void> {
  if (!isPanelEvent(message)) return;
  if (message.type === MessageType.DesignSystemChanged) {
    if (sender) await onDesignSystemEvent(message, sender);
    return;
  }
  if (message.type === MessageType.RuntimeError && message.payload.source === 'design-system') {
    if (!sender) return;
    const pending = await getDesignRequest();
    if (!pending || pending.requestId !== message.payload.requestId) return;
    if (!matchesDesignSender(sender, pending)) return;
    broadcast(message);
    return;
  }
  const state = await getState();
  if (!matchesContentSender(sender, state)) return;
  if (message.type === MessageType.StateChanged) {
    if (!message.payload.active) {
      if (!state.active) return;
      await endInspection(state);
      return;
    }
    const merged: InspectionState = {
      tabId: state.tabId,
      active: true,
      lastTabId: state.tabId ?? state.lastTabId ?? message.payload.lastTabId ?? null,
    };
    await setState(merged);
    broadcast({ type: MessageType.StateChanged, payload: merged });
    return;
  }
  broadcast(message);
}

chrome.runtime.onInstalled.addListener(() => {
  void setState(IDLE_STATE);
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  void chrome.sidePanel.open({ tabId: tab.id }).catch(() => {
    /* Chrome may refuse to open a panel on a restricted page */
  });
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (typeof message !== 'object' || message === null) return false;
  const type = (message as { type?: unknown }).type;

  if (type === MessageType.GetState) {
    void getState()
      .then((state): StateResult => ({ ok: true, state }))
      .then(sendResponse);
    return true;
  }
  if (type === MessageType.StartInspection) {
    void startInspection().then(sendResponse);
    return true;
  }
  if (type === MessageType.StopInspection) {
    void stopInspection().then(sendResponse);
    return true;
  }
  if (type === MessageType.ExtractDesignSystem) {
    void extractDesignSystem(message).then(sendResponse, (error: unknown) => sendResponse({
      ok: false,
      error: describeMessageError(error),
      errorCode: 'design-system-extraction-failed',
    }));
    return true;
  }
  if (type === MessageType.GetSnapshot) {
    void forwardToContent({ type: MessageType.GetSnapshot }).then(sendResponse);
    return true;
  }
  if (type === MessageType.NavigateHierarchy) {
    if (!isHierarchyDirection((message as { direction?: unknown }).direction)) {
      sendResponse({
        ok: false,
        error: 'Unknown hierarchy direction.',
        errorCode: 'invalid-direction',
      });
      return true;
    }
    const { direction, index } = message as {
      direction: HierarchyDirection;
      index?: unknown;
    };
    void forwardToContent({
      type: MessageType.NavigateHierarchy,
      direction,
      ...(typeof index === 'number' && Number.isInteger(index) ? { index } : {}),
    }).then(sendResponse);
    return true;
  }
  if (type === MessageType.ReplayMotion) {
    if (!isMotionReplayAction((message as { action?: unknown }).action)) {
      sendResponse({
        ok: false,
        error: 'Unknown replay action.',
        errorCode: 'invalid-replay-action',
      });
      return true;
    }
    const { action, animationId } = message as { action: MotionReplayAction; animationId?: unknown };
    void forwardToContent({
      type: MessageType.ReplayMotion,
      action,
      ...(typeof animationId === 'string' && animationId.trim() ? { animationId } : {}),
    }).then(sendResponse);
    return true;
  }
  if (isPanelEvent(message)) {
    void onContentEvent(message as PanelBoundEvent, sender).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void getState().then((state) => {
    const selectedTabId = state.tabId ?? state.lastTabId;
    if (selectedTabId !== null && selectedTabId !== tabId) void clearInspection(state);
  });
  void clearDesignRequestOnActivation(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url) return;
  void getState().then((state) => {
    if (state.tabId === tabId || state.lastTabId === tabId) void clearInspection(state);
  });
  void clearDesignRequestForTab(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void getState().then((state) => {
    if (state.tabId === tabId || state.lastTabId === tabId) void clearInspection(state);
  });
  void clearDesignRequestForTab(tabId);
});
