import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageType } from '../src/shared/messages';
import {
  extractDesignSystem,
  getInspectionState,
  getSnapshot,
  navigateHierarchy,
  hasRuntime,
  onPanelEvent,
  pingTab,
  replayMotion,
  sendToBackground,
  sendToTab,
} from '../src/shared/transport';
import { makeDesignSystemSnapshot } from './fixtures';

function stubChrome(overrides: Record<string, unknown> = {}) {
  const runtime = {
    id: 'pixelpeek-test',
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    ...(overrides.runtime as Record<string, unknown> | undefined),
  };
  const tabs = {
    sendMessage: vi.fn(),
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
