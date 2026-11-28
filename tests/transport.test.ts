import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageType } from '../src/shared/messages';
import {
  extractDesignSystem,
  extractWebsiteBlueprint,
  getActiveTabInfo,
  getInspectionState,
  getSnapshot,
  hasRuntime,
  navigateHierarchy,
  onActiveTabChanged,
  onPanelEvent,
  pingTab,
  replayMotion,
  sendToBackground,
  sendToTab,
} from '../src/shared/transport';
import { makeDesignSystemSnapshot, makeWebsiteBlueprint } from './fixtures';

function stubChrome(overrides: Record<string, unknown> = {}) {
  const runtime = {
    id: 'pixelpeek-test',
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    ...(overrides.runtime as Record<string, unknown> | undefined),
  };
  const tabs = {
    sendMessage: vi.fn(),
    query: vi.fn().mockResolvedValue([{ id: 7, url: 'https://example.com/' }]),
    onActivated: { addListener: vi.fn(), removeListener: vi.fn() },
    onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
    onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
    ...(overrides.tabs as Record<string, unknown> | undefined),
  };
  vi.stubGlobal('chrome', { runtime, tabs });
  return { runtime, tabs };
}

afterEach(() => vi.unstubAllGlobals());

describe('transport', () => {
  it('reports a missing extension runtime', async () => {
    vi.stubGlobal('chrome', undefined);
    expect(hasRuntime()).toBe(false);
    await expect(getInspectionState()).rejects.toThrow(/unpacked extension/);
  });

  it('rejects malformed and failed background responses', async () => {
    const { runtime } = stubChrome();
    runtime.sendMessage.mockResolvedValueOnce({ unexpected: true });
    await expect(sendToBackground({ type: MessageType.StartInspection })).rejects.toThrow(
      /Invalid response/,
    );

    runtime.sendMessage.mockResolvedValueOnce({ ok: false, error: 'No active tab' });
    await expect(sendToBackground({ type: MessageType.StartInspection })).rejects.toThrow(
      'No active tab',
    );

    runtime.sendMessage.mockResolvedValueOnce({
      ok: false,
      error: 'This page cannot be inspected.',
      errorCode: 'unsupported-url',
    });
    await expect(sendToBackground({ type: MessageType.StartInspection })).rejects.toMatchObject({
      name: 'ExtensionRequestError',
      message: 'This page cannot be inspected.',
      code: 'unsupported-url',
    });
  });

  it('returns the state from a valid response', async () => {
    const { runtime } = stubChrome();
    const state = { tabId: 7, active: true };
    runtime.sendMessage.mockResolvedValueOnce({ ok: true, state });
    await expect(getInspectionState()).resolves.toEqual(state);
  });

  it('treats only a typed pong as a live content script', async () => {
    const { tabs } = stubChrome();
    tabs.sendMessage.mockResolvedValueOnce({ type: MessageType.Pong });
    await expect(pingTab(1)).resolves.toBe(true);

    tabs.sendMessage.mockResolvedValueOnce({ hello: 'there' });
    await expect(pingTab(1)).resolves.toBe(false);

    tabs.sendMessage.mockRejectedValueOnce(new Error('Receiving end does not exist'));
    await expect(pingTab(1)).resolves.toBe(false);
  });

  it('surfaces injection-target errors rather than swallowing them', async () => {
    const { tabs } = stubChrome();
    tabs.sendMessage.mockRejectedValueOnce(new Error('Receiving end does not exist'));
    await expect(
      sendToTab(9, { type: MessageType.StartInspection }),
    ).rejects.toThrow('Receiving end does not exist');
  });
});

describe('Phase 2 transport helpers', () => {
  it('sends snapshot requests through the typed contract', async () => {
    const { runtime } = stubChrome();
    runtime.sendMessage.mockResolvedValue({ ok: true });
    await expect(getSnapshot()).resolves.toEqual({ ok: true });
    expect(runtime.sendMessage).toHaveBeenCalledWith({ type: MessageType.GetSnapshot });

    await expect(navigateHierarchy('child', 1)).resolves.toEqual({ ok: true });
    expect(runtime.sendMessage).toHaveBeenLastCalledWith({
      type: MessageType.NavigateHierarchy,
      direction: 'child',
      index: 1,
    });
  });

  it('sends replay actions through the typed contract', async () => {
    const { runtime } = stubChrome();
    runtime.sendMessage.mockResolvedValue({ ok: true });
    await expect(replayMotion('isolated-start', 'a1')).resolves.toEqual({ ok: true });
    expect(runtime.sendMessage).toHaveBeenLastCalledWith({
      type: MessageType.ReplayMotion,
      action: 'isolated-start',
      animationId: 'a1',
    });
  });
});

describe('Phase 4 design-system transport', () => {
  it('sends bounded extract requests through the typed contract', async () => {
    const { runtime } = stubChrome();
    runtime.sendMessage.mockResolvedValue({ ok: true });
    await expect(extractDesignSystem('ds-1')).resolves.toEqual({ ok: true });
    expect(runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.ExtractDesignSystem,
      requestId: 'ds-1',
    });
  });

  it('rejects malformed extraction acknowledgements', async () => {
    const { runtime } = stubChrome();
    runtime.sendMessage.mockResolvedValueOnce(undefined);
    await expect(extractDesignSystem('ds-malformed')).rejects.toThrow(/Invalid response/);

    runtime.sendMessage.mockResolvedValueOnce({ type: MessageType.Pong });
    await expect(extractDesignSystem('ds-pong')).rejects.toThrow(/Invalid response/);

    runtime.sendMessage.mockResolvedValueOnce({ ok: true, error: 123 });
    await expect(extractDesignSystem('ds-extra-error')).rejects.toThrow(
      'Invalid response from the background service worker.',
    );
  });

  it('rejects unbounded extract requests before sending them', async () => {
    const { runtime } = stubChrome();
    await expect(extractDesignSystem('')).rejects.toThrow(/Invalid design-system request/);
    expect(runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('forwards only guarded design-system events', () => {
    const { runtime } = stubChrome();
    const listener = vi.fn();
    onPanelEvent(listener);
    const handler = runtime.onMessage.addListener.mock.calls[0]?.[0] as
      | ((message: unknown) => void)
      | undefined;
    expect(handler).toBeTypeOf('function');

    handler?.({ type: MessageType.DesignSystemChanged, payload: makeDesignSystemSnapshot() });
    expect(listener).toHaveBeenCalledTimes(1);

    handler?.({ type: MessageType.DesignSystemChanged, payload: {} });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('Phase 5 website blueprint transport', () => {
  it('sends bounded extract requests through the typed contract', async () => {
    const { runtime } = stubChrome();
    runtime.sendMessage.mockResolvedValue({ ok: true });
    await expect(extractWebsiteBlueprint('bp-1')).resolves.toEqual({ ok: true });
    expect(runtime.sendMessage).toHaveBeenCalledWith({
      type: MessageType.ExtractWebsiteBlueprint,
      requestId: 'bp-1',
    });
  });

  it('rejects malformed extract requests before sending them', async () => {
    const { runtime } = stubChrome();
    await expect(extractWebsiteBlueprint('')).rejects.toThrow(/Invalid website blueprint request/);
    expect(runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('rejects malformed extraction acknowledgements', async () => {
    const { runtime } = stubChrome();
    runtime.sendMessage.mockResolvedValueOnce(undefined);
    await expect(extractWebsiteBlueprint('bp-malformed')).rejects.toThrow(/Invalid response/);

    runtime.sendMessage.mockResolvedValueOnce({ type: MessageType.Pong });
    await expect(extractWebsiteBlueprint('bp-pong')).rejects.toThrow(/Invalid response/);

    runtime.sendMessage.mockResolvedValueOnce({ ok: false, error: 'Blueprint failed', errorCode: 'blueprint-failed' });
    await expect(extractWebsiteBlueprint('bp-failed')).rejects.toMatchObject({
      name: 'ExtensionRequestError',
      message: 'Blueprint failed',
      code: 'blueprint-failed',
    });
  });

  it('forwards only guarded blueprint events', () => {
    const { runtime } = stubChrome();
    const listener = vi.fn();
    onPanelEvent(listener);
    const handler = runtime.onMessage.addListener.mock.calls[0]?.[0] as
      | ((message: unknown) => void)
      | undefined;
    expect(handler).toBeTypeOf('function');

    handler?.({ type: MessageType.BlueprintChanged, payload: makeWebsiteBlueprint() });
    expect(listener).toHaveBeenCalledTimes(1);

    handler?.({ type: MessageType.BlueprintChanged, payload: {} });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('reads active tab ownership for panel-side event filtering', async () => {
    const { tabs } = stubChrome();
    tabs.query.mockResolvedValueOnce([{ id: 12, url: 'https://example.com/design' }]);
    await expect(getActiveTabInfo()).resolves.toEqual({
      tabId: 12,
      url: 'https://example.com/design',
      origin: 'https://example.com',
    });
    expect(tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
  });

  it('observes activation, navigation and removal lifecycle changes', () => {
    const { tabs } = stubChrome();
    const listener = vi.fn();
    const dispose = onActiveTabChanged(listener);
    expect(tabs.onActivated.addListener).toHaveBeenCalledTimes(1);
    expect(tabs.onUpdated.addListener).toHaveBeenCalledTimes(1);
    expect(tabs.onRemoved.addListener).toHaveBeenCalledTimes(1);

    const onActivated = tabs.onActivated.addListener.mock.calls[0]?.[0] as () => void;
    const onUpdated = tabs.onUpdated.addListener.mock.calls[0]?.[0] as
      | ((tabId: number, changeInfo: { url?: string }) => void)
      | undefined;
    const onRemoved = tabs.onRemoved.addListener.mock.calls[0]?.[0] as () => void;
    onActivated();
    onUpdated?.(12, {});
    expect(listener).toHaveBeenCalledTimes(1);
    onUpdated?.(12, { url: 'https://example.com/next' });
    onRemoved();
    expect(listener).toHaveBeenCalledTimes(3);

    dispose();
    expect(tabs.onActivated.removeListener).toHaveBeenCalledWith(onActivated);
    expect(tabs.onUpdated.removeListener).toHaveBeenCalledWith(onUpdated);
    expect(tabs.onRemoved.removeListener).toHaveBeenCalledWith(onRemoved);
  });
});
