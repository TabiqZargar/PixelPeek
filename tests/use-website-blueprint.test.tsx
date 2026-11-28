import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageType, type ContentEvent } from '../src/shared/messages';
import { useWebsiteBlueprint } from '../src/panel/hooks/useWebsiteBlueprint';
import { makeWebsiteBlueprint } from './fixtures';

const mockState = vi.hoisted(() => ({
  extract: vi.fn(),
  getActiveTabInfo: vi.fn(),
  clipboard: vi.fn(),
  panelListener: { current: null as null | ((event: ContentEvent) => void) },
  tabListener: { current: null as null | (() => void) },
}));

vi.mock('../src/shared/transport', async () => {
  const actual = await vi.importActual<typeof import('../src/shared/transport')>('../src/shared/transport');
  return {
    ...actual,
    extractWebsiteBlueprint: mockState.extract,
    getActiveTabInfo: mockState.getActiveTabInfo,
    onPanelEvent: (listener: (event: ContentEvent) => void) => {
      mockState.panelListener.current = listener;
      return () => {
        if (mockState.panelListener.current === listener) mockState.panelListener.current = null;
      };
    },
    onActiveTabChanged: (listener: () => void) => {
      mockState.tabListener.current = listener;
      return () => {
        if (mockState.tabListener.current === listener) mockState.tabListener.current = null;
      };
    },
  };
});

vi.mock('../src/panel/clipboard', () => ({ writeClipboard: mockState.clipboard }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let api: ReturnType<typeof useWebsiteBlueprint> | null = null;

function Harness() {
  api = useWebsiteBlueprint();
  return (
    <>
      <button type="button" onClick={() => void api!.extract()}>
        Generate
      </button>
      <button type="button" onClick={() => void api!.copyJson()}>
        Copy
      </button>
    </>
  );
}

function current(): ReturnType<typeof useWebsiteBlueprint> {
  if (!api) throw new Error('Hook did not render.');
  return api;
}

async function clickButton(label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (item) => item.textContent === label,
  );
  expect(button).toBeDefined();
  await act(async () => {
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
  });
}

async function emit(event: ContentEvent) {
  await act(async () => {
    mockState.panelListener.current?.(event);
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api = null;
  mockState.extract.mockReset();
  mockState.getActiveTabInfo.mockReset();
  mockState.clipboard.mockReset();
  mockState.panelListener.current = null;
  mockState.tabListener.current = null;
  mockState.extract.mockResolvedValue({ ok: true });
  mockState.getActiveTabInfo.mockResolvedValue({
    tabId: 7,
    url: 'https://example.com/',
    origin: 'https://example.com',
  });
  mockState.clipboard.mockResolvedValue(true);
  act(() => root.render(<Harness />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('useWebsiteBlueprint', () => {
  it('accepts only the matching blueprint event from the captured page', async () => {
    await clickButton('Generate');
    expect(current().status).toBe('loading');
    const requestId = mockState.extract.mock.calls[0]?.[0] as string;
    expect(requestId).toMatch(/^bp-/);

    const base = makeWebsiteBlueprint();
    await emit({
      type: MessageType.BlueprintChanged,
      payload: makeWebsiteBlueprint({ metadata: { ...base.metadata, requestId: 'stale-request' } }),
    });
    expect(current().status).toBe('loading');
    expect(current().blueprint).toBeNull();

    await emit({
      type: MessageType.BlueprintChanged,
      payload: makeWebsiteBlueprint({ metadata: { ...base.metadata, requestId } }),
    });
    expect(current().status).toBe('ready');
    expect(current().blueprint?.metadata.requestId).toBe(requestId);
    expect(current().error).toBeNull();
  });

  it('accepts only matching website-blueprint runtime failures while pending', async () => {
    await clickButton('Generate');
    const requestId = mockState.extract.mock.calls[0]?.[0] as string;

    await emit({
      type: MessageType.RuntimeError,
      payload: {
        source: 'design-system',
        requestId,
        message: 'wrong source',
        code: 'design-system-extraction-failed',
      },
    });
    expect(current().status).toBe('loading');

    await emit({
      type: MessageType.RuntimeError,
      payload: {
        source: 'website-blueprint',
        requestId: 'stale-request',
        message: 'stale failure',
        code: 'website-blueprint-extraction-failed',
      },
    });
    expect(current().status).toBe('loading');

    await emit({
      type: MessageType.RuntimeError,
      payload: {
        source: 'website-blueprint',
        requestId,
        message: 'The snapshot failed validation.',
        code: 'website-blueprint-extraction-failed',
      },
    });
    expect(current().status).toBe('error');
    expect(current().errorCode).toBe('website-blueprint-extraction-failed');
  });

  it('clears the blueprint when the active page no longer owns it', async () => {
    await clickButton('Generate');
    const requestId = mockState.extract.mock.calls[0]?.[0] as string;
    const base = makeWebsiteBlueprint();
    await emit({
      type: MessageType.BlueprintChanged,
      payload: makeWebsiteBlueprint({ metadata: { ...base.metadata, requestId } }),
    });
    expect(current().status).toBe('ready');

    mockState.getActiveTabInfo.mockResolvedValue({
      tabId: 8,
      url: 'https://other.example/',
      origin: 'https://other.example',
    });
    await act(async () => {
      mockState.tabListener.current?.();
      for (let index = 0; index < 8; index += 1) await Promise.resolve();
    });
    expect(current().status).toBe('error');
    expect(current().errorCode).toBe('stale-page');
    expect(current().blueprint).toBeNull();
  });

  it('reports a missing active tab before sending a request', async () => {
    mockState.getActiveTabInfo.mockResolvedValue({ tabId: null, url: null, origin: null });
    await clickButton('Generate');
    expect(current().status).toBe('error');
    expect(current().errorCode).toBe('no-active-tab');
    expect(mockState.extract).not.toHaveBeenCalled();
  });

  it('copies only the validated blueprint as JSON', async () => {
    await clickButton('Generate');
    const requestId = mockState.extract.mock.calls[0]?.[0] as string;
    const base = makeWebsiteBlueprint();
    await emit({
      type: MessageType.BlueprintChanged,
      payload: makeWebsiteBlueprint({ metadata: { ...base.metadata, requestId } }),
    });
    await clickButton('Copy');
    expect(mockState.clipboard).toHaveBeenCalledTimes(1);
    const copied = mockState.clipboard.mock.calls[0]?.[0] as string;
    expect(JSON.parse(copied)).toMatchObject({ metadata: { requestId } });
    expect(current().copiedKey).toBe('blueprint-json');
    expect(current().exportFeedback).toEqual({ kind: 'success', message: 'Blueprint JSON copied.' });
  });

  it('times out a pending capture', async () => {
    vi.useFakeTimers();
    try {
      await clickButton('Generate');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(12000);
      });
      expect(current().status).toBe('error');
      expect(current().errorCode).toBe('timeout');
    } finally {
      vi.useRealTimers();
    }
  });
});
