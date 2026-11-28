import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/panel/App';
import { MessageType, type ContentEvent } from '../src/shared/messages';
import { makeWebsiteBlueprint } from './fixtures';

const mockState = vi.hoisted(() => ({
  sendToBackground: vi.fn(),
  getInspectionState: vi.fn(),
  getSnapshot: vi.fn(),
  extract: vi.fn(),
  getActiveTabInfo: vi.fn(),
  clipboard: vi.fn(),
  panelListeners: [] as Array<(event: ContentEvent) => void>,
  tabListeners: [] as Array<() => void>,
}));

vi.mock('../src/shared/transport', async () => {
  const actual = await vi.importActual<typeof import('../src/shared/transport')>('../src/shared/transport');
  return {
    ...actual,
    sendToBackground: mockState.sendToBackground,
    getInspectionState: mockState.getInspectionState,
    getSnapshot: mockState.getSnapshot,
    extractWebsiteBlueprint: mockState.extract,
    getActiveTabInfo: mockState.getActiveTabInfo,
    onPanelEvent: (listener: (event: ContentEvent) => void) => {
      mockState.panelListeners.push(listener);
      return () => {
        const index = mockState.panelListeners.indexOf(listener);
        if (index >= 0) mockState.panelListeners.splice(index, 1);
      };
    },
    onActiveTabChanged: (listener: () => void) => {
      mockState.tabListeners.push(listener);
      return () => {
        const index = mockState.tabListeners.indexOf(listener);
        if (index >= 0) mockState.tabListeners.splice(index, 1);
      };
    },
  };
});

vi.mock('../src/panel/clipboard', () => ({ writeClipboard: mockState.clipboard }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function settle(ticks = 8) {
  await act(async () => {
    for (let index = 0; index < ticks; index += 1) await Promise.resolve();
  });
}

async function renderApp() {
  await act(async () => {
    root.render(<App />);
    await Promise.resolve();
  });
  await settle();
}

async function clickNav(label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (item) => item.textContent === label,
  );
  expect(button).toBeDefined();
  await act(async () => {
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  await settle();
}

async function clickAria(label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (item) => item.getAttribute('aria-label') === label,
  );
  expect(button).toBeDefined();
  await act(async () => {
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await settle();
}

async function openExportTab() {
  const tab = Array.from(container.querySelectorAll('[role="tab"]')).find((item) =>
    ['Export', 'JSON'].includes(item.textContent ?? ''),
  );
  expect(tab).toBeDefined();
  await act(async () => {
    tab!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await settle();
}

async function captureBlueprint() {
  await clickAria('Generate Website Blueprint');
  const requestId = mockState.extract.mock.calls[0]?.[0] as string;
  expect(requestId).toMatch(/^bp-/);
  const base = makeWebsiteBlueprint();
  const event: ContentEvent = {
    type: MessageType.BlueprintChanged,
    payload: makeWebsiteBlueprint({ metadata: { ...base.metadata, requestId } }),
  };
  await act(async () => {
    for (const listener of [...mockState.panelListeners]) listener(event);
  });
  await settle(12);
  return requestId;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mockState.sendToBackground.mockReset();
  mockState.sendToBackground.mockResolvedValue({ ok: true, state: { tabId: null, active: false } });
  mockState.getInspectionState.mockReset();
  mockState.getInspectionState.mockResolvedValue({ tabId: 7, active: true, lastTabId: 7 });
  mockState.getSnapshot.mockReset();
  mockState.getSnapshot.mockResolvedValue({ ok: false });
  mockState.extract.mockReset();
  mockState.extract.mockResolvedValue({ ok: true });
  mockState.getActiveTabInfo.mockReset();
  mockState.getActiveTabInfo.mockResolvedValue({
    tabId: 7,
    url: 'https://example.com/',
    origin: 'https://example.com',
  });
  mockState.clipboard.mockReset();
  mockState.clipboard.mockResolvedValue(true);
  mockState.panelListeners.length = 0;
  mockState.tabListeners.length = 0;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('workspace navigation', () => {
  it('stops an active picker when leaving the Inspector workspace', async () => {
    await renderApp();
    await clickNav('Motion');

    expect(mockState.sendToBackground).toHaveBeenCalledWith({ type: MessageType.StopInspection });
    expect(container.textContent).toContain('Inspect animations, transitions, keyframes and easing');
  });

  it('clears website blueprint copy feedback when leaving the workspace', async () => {
    await renderApp();
    await clickNav('Website Blueprint');
    await captureBlueprint();
    await openExportTab();
    await clickAria('Copy Blueprint JSON');
    expect(container.textContent).toContain('Blueprint JSON copied.');

    await clickNav('Motion');
    expect(container.textContent).not.toContain('Blueprint JSON copied.');

    await clickNav('Website Blueprint');
    expect(container.textContent).not.toContain('Blueprint JSON copied.');

    await openExportTab();
    await clickAria('Copy Blueprint JSON');
    expect(container.textContent).toContain('Blueprint JSON copied.');
  });

  it('ignores a stale copy completion after navigating away', async () => {
    await renderApp();
    await clickNav('Website Blueprint');
    await captureBlueprint();
    await openExportTab();
    const pending = deferred<boolean>();
    mockState.clipboard.mockReturnValueOnce(pending.promise);
    await clickAria('Copy Blueprint JSON');

    await clickNav('Motion');
    await act(async () => {
      pending.resolve(true);
      await pending.promise;
    });
    await settle();

    await clickNav('Website Blueprint');
    await openExportTab();
    expect(container.textContent).not.toContain('Blueprint JSON copied.');

    await clickAria('Copy Blueprint JSON');
    expect(container.textContent).toContain('Blueprint JSON copied.');
  });
});
