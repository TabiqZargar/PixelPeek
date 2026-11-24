import {
  MessageType,
  type ContentEvent,
  type PanelEvent,
  type RequestResult,
  type StateResult,
} from '../shared/messages';
import { IDLE_STATE, type InspectionState } from '../shared/types';
import { describeMessageError, isInspectableUrl } from '../shared/tabs';
import { pingTab, sendToTab } from '../shared/transport';

const STATE_KEY = 'inspection';

async function getState(): Promise<InspectionState> {
  const stored = await chrome.storage.session.get(STATE_KEY);
  const value = stored[STATE_KEY] as InspectionState | undefined;
  return value ?? IDLE_STATE;
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
  await setState(IDLE_STATE);
  broadcast({ type: MessageType.StateChanged, payload: IDLE_STATE });
}

async function startInspection(): Promise<RequestResult> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id === undefined) {
    return { ok: false, error: 'There is no active tab to inspect.' };
  }
  if (!isInspectableUrl(tab.url)) {
    return { ok: false, error: 'This page cannot be inspected. Try a regular http(s) website.' };
  }

  const tabId = tab.id;
  const previous = await getState();
  if (previous.active && previous.tabId !== tabId) await stopTab(previous.tabId ?? tabId);

  try {
    if (!(await pingTab(tabId))) {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      if (!(await pingTab(tabId))) {
        return { ok: false, error: 'The inspector could not start on this page.' };
      }
    }
    await sendToTab(tabId, { type: MessageType.StartInspection });
  } catch (error) {
    return { ok: false, error: describeMessageError(error) };
  }

  const state: InspectionState = { tabId, active: true };
  await setState(state);
  broadcast({ type: MessageType.StateChanged, payload: state });
  return { ok: true, state };
}

async function stopInspection(): Promise<RequestResult> {
  const state = await getState();
  await endInspection(state);
  return { ok: true, state: IDLE_STATE };
}

type PanelBoundEvent = Exclude<ContentEvent, { type: typeof MessageType.Pong }>;

async function onContentEvent(message: PanelBoundEvent): Promise<void> {
  const state = await getState();
  if (message.type === MessageType.StateChanged) {
    if (!message.payload.active) {
      if (!state.active) return;
      await setState(IDLE_STATE);
      broadcast({ type: MessageType.StateChanged, payload: IDLE_STATE });
      return;
    }
    const merged: InspectionState = { tabId: state.tabId, active: true };
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

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
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
  if (
    type === MessageType.ElementSelected ||
    type === MessageType.StateChanged ||
    type === MessageType.RuntimeError
  ) {
    void onContentEvent(message as PanelBoundEvent).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void getState().then((state) => {
    if (state.active && state.tabId !== null && state.tabId !== tabId) {
      void endInspection(state);
    }
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url) return;
  void getState().then((state) => {
    if (state.active && state.tabId === tabId) void endInspection(state);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void getState().then((state) => {
    if (state.active && state.tabId === tabId) void endInspection(state);
  });
});
