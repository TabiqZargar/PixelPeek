import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageType, type ContentEvent } from '../src/shared/messages';
import { useWebsiteBlueprint } from '../src/panel/hooks/useWebsiteBlueprint';
import { makeDesignSystemSnapshot, makeWebsiteBlueprint } from './fixtures';

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

async function emitDirect(event: ContentEvent) {
  mockState.panelListener.current?.(event);
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

async function emit(event: ContentEvent) {
  await act(async () => {
    await emitDirect(event);
  });
}

function blueprintPayload(requestId: string, origin = 'https://example.com') {
  const base = makeWebsiteBlueprint();
  return makeWebsiteBlueprint({
    metadata: { ...base.metadata, requestId, origin },
    designSystem: makeDesignSystemSnapshot({ ...base.designSystem, origin }),
  });
}

function blueprintEvent(requestId: string, origin?: string): ContentEvent {
  return {
    type: MessageType.BlueprintChanged,
    payload: blueprintPayload(requestId, origin),
  };
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

  it('accepts a valid blueprint event that arrives before the acknowledgement', async () => {
    mockState.extract.mockImplementation(async (requestId: string) => {
      await emitDirect(blueprintEvent(requestId));
      return { ok: true };
    });

    await clickButton('Generate');
    const requestId = mockState.extract.mock.calls[0]?.[0] as string;
    expect(mockState.extract).toHaveBeenCalledTimes(1);
    expect(current().status).toBe('ready');
    expect(current().blueprint?.metadata.requestId).toBe(requestId);
  });

  it('accepts a valid blueprint event that arrives after the acknowledgement', async () => {
    await clickButton('Generate');
    const requestId = mockState.extract.mock.calls[0]?.[0] as string;

    await emit(blueprintEvent(requestId));
    expect(current().status).toBe('ready');
    expect(current().blueprint?.metadata.requestId).toBe(requestId);
  });

  it('rejects a blueprint event for a different request id', async () => {
    await clickButton('Generate');

    await emit(blueprintEvent('stale-request'));
    expect(current().status).toBe('loading');
    expect(current().blueprint).toBeNull();
  });

  it('rejects a blueprint event when the active tab changed', async () => {
    await clickButton('Generate');
    const requestId = mockState.extract.mock.calls[0]?.[0] as string;
    mockState.getActiveTabInfo.mockResolvedValue({
      tabId: 8,
      url: 'https://other.example/',
      origin: 'https://other.example',
    });

    await emit(blueprintEvent(requestId));
    expect(current().status).toBe('error');
    expect(current().errorCode).toBe('stale-page');
    expect(current().blueprint).toBeNull();
  });

  it('rejects a blueprint event from a different page origin', async () => {
    await clickButton('Generate');
    const requestId = mockState.extract.mock.calls[0]?.[0] as string;

    await emit(blueprintEvent(requestId, 'https://other.example'));
    expect(current().status).toBe('loading');
    expect(current().blueprint).toBeNull();
  });

  it('does not dispatch a second request while one is pending', async () => {
    const pending = deferred<{ ok: true }>();
    mockState.extract.mockReturnValueOnce(pending.promise);

    await clickButton('Generate');
    await clickButton('Generate');
    expect(mockState.extract).toHaveBeenCalledTimes(1);
  });

  it('keeps the first request valid after a duplicate extract attempt', async () => {
    const pending = deferred<{ ok: true }>();
    mockState.extract.mockReturnValueOnce(pending.promise);

    await clickButton('Generate');
    const firstId = mockState.extract.mock.calls[0]?.[0] as string;
    await clickButton('Generate');
    expect(mockState.extract).toHaveBeenCalledTimes(1);

    pending.resolve({ ok: true });
    await act(async () => {
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
    await emit(blueprintEvent(firstId));
    expect(current().status).toBe('ready');
    expect(current().blueprint?.metadata.requestId).toBe(firstId);
  });

  it('clears only the matching ownership when acknowledgement fails', async () => {
    mockState.extract.mockRejectedValueOnce(new Error('ack failed'));

    await clickButton('Generate');
    const firstId = mockState.extract.mock.calls[0]?.[0] as string;
    expect(current().status).toBe('error');
    expect(current().errorCode).toBe('website-blueprint-extraction-failed');

    await emit(blueprintEvent(firstId));
    expect(current().status).toBe('error');
    expect(current().blueprint).toBeNull();

    await clickButton('Generate');
    const secondId = mockState.extract.mock.calls[1]?.[0] as string;
    await emit(blueprintEvent(secondId));
    expect(current().status).toBe('ready');
    expect(current().blueprint?.metadata.requestId).toBe(secondId);
  });

  it('clears ownership when a pending capture times out', async () => {
    vi.useFakeTimers();
    try {
      await clickButton('Generate');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(12000);
      });
      expect(current().status).toBe('error');
      expect(current().errorCode).toBe('timeout');

      await clickButton('Generate');
      expect(mockState.extract).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a late blueprint event after timeout', async () => {
    vi.useFakeTimers();
    try {
      await clickButton('Generate');
      const requestId = mockState.extract.mock.calls[0]?.[0] as string;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(12000);
      });

      await emit(blueprintEvent(requestId));
      expect(current().status).toBe('error');
      expect(current().errorCode).toBe('timeout');
      expect(current().blueprint).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('prevents stale cleanup from clearing a newer request', async () => {
    vi.useFakeTimers();
    try {
      const first = deferred<{ ok: true }>();
      mockState.extract.mockReturnValueOnce(first.promise);
      await clickButton('Generate');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(12000);
      });
      expect(current().errorCode).toBe('timeout');

      mockState.extract.mockImplementationOnce(async (requestId: string) => {
        await emitDirect(blueprintEvent(requestId));
        return { ok: true };
      });
      await clickButton('Generate');
      const secondId = mockState.extract.mock.calls[1]?.[0] as string;
      expect(current().status).toBe('ready');

      first.resolve({ ok: true });
      await act(async () => {
        for (let index = 0; index < 12; index += 1) await Promise.resolve();
      });
      expect(current().status).toBe('ready');
      expect(current().blueprint?.metadata.requestId).toBe(secondId);
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts a fresh capture after a timed-out capture', async () => {
    vi.useFakeTimers();
    try {
      await clickButton('Generate');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(12000);
      });
      expect(current().status).toBe('error');

      await clickButton('Generate');
      const secondId = mockState.extract.mock.calls[1]?.[0] as string;
      await emit(blueprintEvent(secondId));
      expect(current().status).toBe('ready');
      expect(current().blueprint?.metadata.requestId).toBe(secondId);
    } finally {
      vi.useRealTimers();
    }
  });
});
