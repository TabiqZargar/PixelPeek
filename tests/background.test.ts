import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageType } from '../src/shared/messages';
import { makeDesignSystemSnapshot, makeWebsiteBlueprint } from './fixtures';

type Listener = (
  message: unknown,
  sender: unknown,
  sendResponse: (value: unknown) => void,
) => boolean | void;

interface BackgroundStub {
  chrome: Record<string, unknown>;
  runtime: {
    id: string;
    sendMessage: ReturnType<typeof vi.fn>;
    onMessage: { addListener: ReturnType<typeof vi.fn> };
    onInstalled: { addListener: ReturnType<typeof vi.fn> };
  };
  tabs: {
    query: ReturnType<typeof vi.fn>;
    sendMessage: ReturnType<typeof vi.fn>;
    onActivated: { addListener: ReturnType<typeof vi.fn> };
    onUpdated: { addListener: ReturnType<typeof vi.fn> };
    onRemoved: { addListener: ReturnType<typeof vi.fn> };
  };
  scripting: { executeScript: ReturnType<typeof vi.fn> };
  storage: { session: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> } };
  store: Map<string, unknown>;
  listener: Listener;
}

function createStub(): Omit<BackgroundStub, 'chrome' | 'listener'> {
  const store = new Map<string, unknown>();
  return {
    runtime: {
      id: 'pixelpeek-test',
      sendMessage: vi.fn().mockResolvedValue({ ok: true }),
      onMessage: { addListener: vi.fn() },
      onInstalled: { addListener: vi.fn() },
    },
    tabs: {
      query: vi.fn(),
      sendMessage: vi.fn(),
      onActivated: { addListener: vi.fn() },
      onUpdated: { addListener: vi.fn() },
      onRemoved: { addListener: vi.fn() },
    },
    scripting: { executeScript: vi.fn().mockResolvedValue(undefined) },
    storage: {
      session: {
        get: vi.fn(async (keys: string | string[]) => {
          if (Array.isArray(keys)) {
            return Object.fromEntries(keys.map((key) => [key, store.get(key)]));
          }
          return { [keys]: store.get(keys) };
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) store.set(key, value);
        }),
        remove: vi.fn(async (key: string) => {
          store.delete(key);
        }),
      },
    },
    store,
  };
}

async function loadBackground(base: Omit<BackgroundStub, 'chrome' | 'listener'>): Promise<BackgroundStub> {
  vi.resetModules();
  const chrome = {
    runtime: base.runtime,
    tabs: base.tabs,
    scripting: base.scripting,
    storage: base.storage,
    sidePanel: { open: vi.fn().mockResolvedValue(undefined) },
    action: { onClicked: { addListener: vi.fn() } },
  };
  vi.stubGlobal('chrome', chrome);
  await import('../src/background/index');
  const listener = base.runtime.onMessage.addListener.mock.calls[0]?.[0] as Listener | undefined;
  if (!listener) throw new Error('Background did not register a message listener.');
  return { ...base, chrome, listener };
}

async function dispatch(
  stub: BackgroundStub,
  message: unknown,
  sender: unknown = {},
): Promise<unknown> {
  let resolve!: (value: unknown) => void;
  const result = new Promise<unknown>((setter) => {
    resolve = setter;
  });
  const returned = stub.listener(message, sender, resolve);
  if (returned !== true) resolve(returned);
  return result;
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function useLiveContent(stub: BackgroundStub, pongs = Number.POSITIVE_INFINITY): void {
  let count = 0;
  stub.tabs.sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => {
    if (message.type === MessageType.Ping) {
      count += 1;
      return count <= pongs ? { type: MessageType.Pong } : undefined;
    }
    return { ok: true };
  });
}

async function startExtraction(
  stub: BackgroundStub,
  requestId: string,
  tab: { id: number; url: string } = { id: 42, url: 'https://example.com/page' },
): Promise<unknown> {
  stub.tabs.query.mockResolvedValue([tab]);
  return dispatch(stub, { type: MessageType.ExtractDesignSystem, requestId }, {});
}

async function startBlueprintExtraction(
  stub: BackgroundStub,
  requestId: string,
  tab: { id: number; url: string } = { id: 42, url: 'https://example.com/page' },
): Promise<unknown> {
  stub.tabs.query.mockResolvedValue([tab]);
  return dispatch(stub, { type: MessageType.ExtractWebsiteBlueprint, requestId }, {});
}

function blueprintFor(requestId: string, origin = 'https://example.com') {
  const base = makeWebsiteBlueprint();
  return makeWebsiteBlueprint({
    metadata: { ...base.metadata, requestId, origin },
    designSystem: makeDesignSystemSnapshot({ ...base.designSystem, origin }),
  });
}

function sentEvents(stub: BackgroundStub, type: string) {
  const calls = stub.runtime.sendMessage.mock.calls as unknown[][];
  return calls
    .map(([message]) => message)
    .filter((message) => (message as { type?: unknown })?.type === type);
}

function sentToTab(stub: BackgroundStub, type: string) {
  const calls = stub.tabs.sendMessage.mock.calls as unknown[][];
  return calls.find(([, message]) => (message as { type?: unknown })?.type === type);
}

function largeSnapshot(requestId: string) {
  const entry = {
    value: 'v'.repeat(120),
    normalized: 'v'.repeat(120),
    count: 1,
    sourceProperties: ['font-size'],
  };
  return makeDesignSystemSnapshot({
    requestId,
    detected: {
      palette: Array.from({ length: 30 }, () => entry),
      typography: Array.from({ length: 30 }, () => entry),
      spacing: Array.from({ length: 30 }, () => entry),
      effects: Array.from({ length: 30 }, () => entry),
      gradients: Array.from({ length: 30 }, () => entry),
    },
    tokens: [],
    limitations: [],
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Phase 4 background routing', () => {
  it('reuses a live content script, preserves inspection state, and validates the event once', async () => {
    const base = createStub();
    const state = { tabId: 7, active: true, lastTabId: 7 };
    base.store.set('inspection', state);
    const stub = await loadBackground(base);
    useLiveContent(stub);

    expect(await startExtraction(stub, 'ds-ok')).toEqual({ ok: true });
    expect(sentToTab(stub, MessageType.ExtractDesignSystem)?.[1]).toEqual({
      type: MessageType.ExtractDesignSystem,
      requestId: 'ds-ok',
    });
    expect(stub.scripting.executeScript).not.toHaveBeenCalled();
    expect(stub.store.get('inspection')).toEqual(state);
    expect(stub.store.get('design-system-request')).toEqual({
      tabId: 42,
      requestId: 'ds-ok',
      url: 'https://example.com/page',
    });

    const snapshot = makeDesignSystemSnapshot({ requestId: 'ds-ok' });
    expect(await dispatch(stub, { type: MessageType.DesignSystemChanged, payload: snapshot }, {
      tab: { id: 42, url: 'https://example.com/page' },
    })).toEqual({ ok: true });
    expect(sentEvents(stub, MessageType.DesignSystemChanged)).toHaveLength(1);
    expect(stub.store.has('design-system-request')).toBe(false);

    await dispatch(stub, { type: MessageType.DesignSystemChanged, payload: snapshot }, {
      tab: { id: 42, url: 'https://example.com/page' },
    });
    expect(sentEvents(stub, MessageType.DesignSystemChanged)).toHaveLength(1);
  });

  it('rejects browser and unsupported URLs without injecting', async () => {
    const stub = await loadBackground(createStub());
    useLiveContent(stub);

    stub.tabs.query.mockResolvedValue([{ id: 42, url: 'chrome://extensions' }]);
    expect(await dispatch(stub, { type: MessageType.ExtractDesignSystem, requestId: 'ds-1' }, {})).toEqual({
      ok: false,
      error: 'This page cannot be inspected. Try a regular http(s) website.',
      errorCode: 'unsupported-url',
    });

    stub.tabs.query.mockResolvedValue([{ id: 43, url: 'https://chromewebstore.google.com/detail/x' }]);
    expect(await dispatch(stub, { type: MessageType.ExtractDesignSystem, requestId: 'ds-2' }, {})).toEqual({
      ok: false,
      error: 'This page cannot be inspected. Try a regular http(s) website.',
      errorCode: 'unsupported-url',
    });
    expect(stub.tabs.sendMessage).not.toHaveBeenCalled();
    expect(stub.scripting.executeScript).not.toHaveBeenCalled();
    expect(stub.store.has('design-system-request')).toBe(false);
  });

  it('injects only when no live content script responds', async () => {
    const stub = await loadBackground(createStub());
    let pings = 0;
    stub.tabs.sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => {
      if (message.type === MessageType.Ping) {
        pings += 1;
        return pings === 2 ? { type: MessageType.Pong } : undefined;
      }
      return { ok: true };
    });

    expect(await startExtraction(stub, 'ds-inject')).toEqual({ ok: true });
    expect(stub.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 42 },
      files: ['content.js'],
    });
    expect(sentToTab(stub, MessageType.ExtractDesignSystem)?.[1]).toEqual({
      type: MessageType.ExtractDesignSystem,
      requestId: 'ds-inject',
    });
  });

  it('reports injection failure and discards the pending request', async () => {
    const stub = await loadBackground(createStub());
    useLiveContent(stub, 0);
    stub.scripting.executeScript.mockRejectedValue(new Error('cannot inject'));
    stub.tabs.query.mockResolvedValue([{ id: 42, url: 'https://example.com/page' }]);

    const result = (await dispatch(stub, {
      type: MessageType.ExtractDesignSystem,
      requestId: 'ds-fail',
    }, {})) as { ok?: boolean; error?: string; errorCode?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toContain('cannot inject');
    expect(result.errorCode).toBe('design-system-extraction-failed');
    expect(stub.store.has('design-system-request')).toBe(false);
    expect(sentToTab(stub, MessageType.ExtractDesignSystem)).toBeUndefined();
  });

  it('returns a typed acknowledgement when active-tab lookup fails', async () => {
    const stub = await loadBackground(createStub());
    stub.tabs.query.mockRejectedValue(new Error('query failed'));

    expect(await dispatch(stub, {
      type: MessageType.ExtractDesignSystem,
      requestId: 'ds-query-failure',
    }, {})).toEqual({
      ok: false,
      error: 'query failed',
      errorCode: 'design-system-extraction-failed',
    });
  });

  it('returns a typed acknowledgement when pending state cannot be stored', async () => {
    const base = createStub();
    base.storage.session.set = vi.fn().mockRejectedValue(new Error('session unavailable'));
    const stub = await loadBackground(base);
    useLiveContent(stub);
    stub.tabs.query.mockResolvedValue([{ id: 42, url: 'https://example.com/page' }]);

    expect(await dispatch(stub, {
      type: MessageType.ExtractDesignSystem,
      requestId: 'ds-storage-failure',
    }, {})).toEqual({
      ok: false,
      error: 'session unavailable',
      errorCode: 'design-system-extraction-failed',
    });
  });

  it('acknowledges a missing active tab with a typed error', async () => {
    const stub = await loadBackground(createStub());
    stub.tabs.query.mockResolvedValue([]);

    expect(await dispatch(stub, {
      type: MessageType.ExtractDesignSystem,
      requestId: 'ds-no-tab',
    }, {})).toEqual({
      ok: false,
      error: 'There is no active tab to inspect.',
      errorCode: 'no-active-tab',
    });
  });

  it('delivers a snapshot emitted before the acknowledgement resolves', async () => {
    const stub = await loadBackground(createStub());
    stub.tabs.query.mockResolvedValue([{ id: 42, url: 'https://example.com/page' }]);
    stub.tabs.sendMessage.mockImplementation(async (_tabId: number, message: { type: string; requestId?: string }) => {
      if (message.type === MessageType.Ping) return { type: MessageType.Pong };
      if (message.type === MessageType.ExtractDesignSystem) {
        const requestId = message.requestId ?? '';
        void dispatch(stub, {
          type: MessageType.DesignSystemChanged,
          payload: makeDesignSystemSnapshot({ requestId }),
        }, { tab: { id: 42, url: 'https://example.com/page' } });
        return { ok: true };
      }
      return { ok: true };
    });

    expect(await dispatch(stub, {
      type: MessageType.ExtractDesignSystem,
      requestId: 'ds-early-event',
    }, {})).toEqual({ ok: true });
    await flush();

    expect(sentEvents(stub, MessageType.DesignSystemChanged)).toHaveLength(1);
    expect(stub.store.has('design-system-request')).toBe(false);
  });

  it('clears pending extraction on tab switch, closure, and navigation', async () => {
    const stub = await loadBackground(createStub());
    useLiveContent(stub);
    const event = { type: MessageType.DesignSystemChanged, payload: makeDesignSystemSnapshot() };
    const sender = { tab: { id: 42, url: 'https://example.com/page' } };

    await startExtraction(stub, 'ds-switch');
    const onActivated = stub.tabs.onActivated.addListener.mock.calls[0]?.[0] as
      | ((details: { tabId: number }) => void)
      | undefined;
    onActivated?.({ tabId: 99 });
    await flush();
    await dispatch(stub, event, sender);
    expect(stub.store.has('design-system-request')).toBe(false);

    await startExtraction(stub, 'ds-close');
    const onRemoved = stub.tabs.onRemoved.addListener.mock.calls[0]?.[0] as
      | ((tabId: number) => void)
      | undefined;
    onRemoved?.(42);
    await flush();
    await dispatch(stub, event, sender);
    expect(stub.store.has('design-system-request')).toBe(false);

    await startExtraction(stub, 'ds-nav');
    const onUpdated = stub.tabs.onUpdated.addListener.mock.calls[0]?.[0] as
      | ((tabId: number, changeInfo: { url?: string }) => void)
      | undefined;
    onUpdated?.(42, { url: 'https://example.com/new' });
    await flush();
    await dispatch(stub, event, sender);
    expect(stub.store.has('design-system-request')).toBe(false);
    expect(sentEvents(stub, MessageType.DesignSystemChanged)).toHaveLength(0);
  });

  it('rejects stale results from older requests and older tabs', async () => {
    const stub = await loadBackground(createStub());
    useLiveContent(stub);

    await startExtraction(stub, 'ds-old', { id: 42, url: 'https://example.com/page' });
    await startExtraction(stub, 'ds-new', { id: 43, url: 'https://other.example/page' });

    await dispatch(stub, { type: MessageType.DesignSystemChanged, payload: makeDesignSystemSnapshot({
      requestId: 'ds-old',
    }) }, { tab: { id: 42, url: 'https://example.com/page' } });
    expect(sentEvents(stub, MessageType.DesignSystemChanged)).toHaveLength(0);

    await dispatch(stub, { type: MessageType.DesignSystemChanged, payload: makeDesignSystemSnapshot({
      requestId: 'ds-new',
    }) }, { tab: { id: 43, url: 'https://other.example/page' } });
    expect(sentEvents(stub, MessageType.DesignSystemChanged)).toHaveLength(1);
  });

  it('validates sender URL and payload before broadcasting', async () => {
    const stub = await loadBackground(createStub());
    useLiveContent(stub);
    await startExtraction(stub, 'ds-url');
    const snapshot = makeDesignSystemSnapshot({ requestId: 'ds-url' });

    await dispatch(stub, { type: MessageType.DesignSystemChanged, payload: snapshot }, {
      tab: { id: 42, url: 'https://example.com/elsewhere' },
    });
    expect(sentEvents(stub, MessageType.DesignSystemChanged)).toHaveLength(0);
    expect(stub.store.has('design-system-request')).toBe(false);

    await startExtraction(stub, 'ds-payload');
    await dispatch(stub, { type: MessageType.DesignSystemChanged, payload: {} }, {
      tab: { id: 42, url: 'https://example.com/page' },
    });
    await dispatch(stub, { type: MessageType.DesignSystemChanged, payload: snapshot }, {});
    expect(sentEvents(stub, MessageType.DesignSystemChanged)).toHaveLength(0);
  });

  it('acknowledges large extractions immediately and delivers the snapshot as an event', async () => {
    const stub = await loadBackground(createStub());
    useLiveContent(stub);
    const snapshot = largeSnapshot('ds-large');

    expect(await startExtraction(stub, 'ds-large')).toEqual({ ok: true });
    expect(sentToTab(stub, MessageType.ExtractDesignSystem)?.[1]).toEqual({
      type: MessageType.ExtractDesignSystem,
      requestId: 'ds-large',
    });
    expect(JSON.stringify(sentToTab(stub, MessageType.ExtractDesignSystem)?.[1] ?? '')).not.toContain(
      'vvvv',
    );

    await dispatch(stub, { type: MessageType.DesignSystemChanged, payload: snapshot }, {
      tab: { id: 42, url: 'https://example.com/page' },
    });
    const events = sentEvents(stub, MessageType.DesignSystemChanged);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: MessageType.DesignSystemChanged, payload: snapshot });
  });

  it('clears stale captured state on tab activation and rejects cleanup from unrelated tabs', async () => {
    const base = createStub();
    base.store.set('inspection', { tabId: null, active: false, lastTabId: 7 });
    const stub = await loadBackground(base);
    const onActivated = stub.tabs.onActivated.addListener.mock.calls[0]?.[0] as
      | ((details: { tabId: number }) => void)
      | undefined;

    onActivated?.({ tabId: 7 });
    await flush();
    expect(stub.store.get('inspection')).toEqual({ tabId: null, active: false, lastTabId: 7 });
    expect(sentEvents(stub, MessageType.SelectionCleared)).toHaveLength(0);

    onActivated?.({ tabId: 99 });
    await flush();
    expect(stub.store.get('inspection')).toEqual({ tabId: null, active: false });
    expect(sentEvents(stub, MessageType.SelectionCleared)).toEqual([
      { type: MessageType.SelectionCleared, payload: { reason: 'inspection was cleared' } },
    ]);

    base.store.set('inspection', { tabId: 7, active: true, lastTabId: 7 });
    stub.runtime.sendMessage.mockClear();
    const onUpdated = stub.tabs.onUpdated.addListener.mock.calls[0]?.[0] as
      | ((tabId: number, changeInfo: { url?: string }) => void)
      | undefined;
    onUpdated?.(99, { url: 'https://other.example/' });
    await flush();
    expect(stub.store.get('inspection')).toEqual({ tabId: 7, active: true, lastTabId: 7 });
    expect(stub.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('broadcasts only attributed, sender-bound inspector events', async () => {
    const stub = await loadBackground(createStub());
    stub.store.set('inspection', { tabId: 7, active: true, lastTabId: 7 });
    const error = {
      type: MessageType.RuntimeError,
      payload: { source: 'inspector', message: 'capture failed', code: 'capture-failed' },
    };

    expect(await dispatch(stub, error, { tab: { id: 7, url: 'https://example.com/' } })).toEqual({ ok: true });
    expect(await dispatch(stub, error, { tab: { id: 99, url: 'https://example.com/' } })).toEqual({ ok: true });
    expect(await dispatch(stub, error, {})).toEqual({ ok: true });
    expect(await dispatch(stub, {
      type: MessageType.RuntimeError,
      payload: { message: 'unattributed' },
    }, { tab: { id: 7 } })).toBe(false);
    expect(await dispatch(stub, {
      type: MessageType.RuntimeError,
      payload: { source: 'design-system', requestId: 'ds-1', message: 'failed' },
    }, { tab: { id: 7 } })).toEqual({ ok: true });

    expect(sentEvents(stub, MessageType.RuntimeError)).toEqual([error]);
  });

  it('reports start failures through typed error codes and ignores malformed stored state', async () => {
    const stub = await loadBackground(createStub());
    stub.tabs.query.mockResolvedValue([]);
    expect(await dispatch(stub, { type: MessageType.StartInspection }, {})).toMatchObject({
      ok: false,
      errorCode: 'no-active-tab',
    });

    stub.tabs.query.mockResolvedValue([{ id: 7, url: 'chrome://extensions' }]);
    expect(await dispatch(stub, { type: MessageType.StartInspection }, {})).toMatchObject({
      ok: false,
      errorCode: 'unsupported-url',
    });

    stub.tabs.query.mockResolvedValue([{ id: 7, url: 'https://example.com/' }]);
    useLiveContent(stub, 0);
    expect(await dispatch(stub, { type: MessageType.StartInspection }, {})).toMatchObject({
      ok: false,
      errorCode: 'injection-failed',
    });

    stub.store.set('inspection', { tabId: '7', active: 'yes' });
    expect(await dispatch(stub, { type: MessageType.GetState }, {})).toMatchObject({
      ok: true,
      state: { tabId: null, active: false },
    });
  });

  it('keeps inspector and motion routing unchanged', async () => {
    const stub = await loadBackground(createStub());
    stub.store.set('inspection', { tabId: 7, active: true, lastTabId: 7 });
    stub.tabs.sendMessage.mockResolvedValue({ ok: true });

    expect(await dispatch(stub, { type: MessageType.GetSnapshot }, {})).toEqual({ ok: true });
    expect(stub.tabs.sendMessage).toHaveBeenCalledWith(7, { type: MessageType.GetSnapshot });

    expect(await dispatch(stub, {
      type: MessageType.ReplayMotion,
      action: 'isolated-start',
      animationId: 'a1',
    }, {})).toEqual({ ok: true });
    expect(stub.tabs.sendMessage).toHaveBeenCalledWith(7, {
      type: MessageType.ReplayMotion,
      action: 'isolated-start',
      animationId: 'a1',
    });
    expect(stub.store.get('inspection')).toEqual({ tabId: 7, active: true, lastTabId: 7 });
  });
});

describe('Phase 5 website blueprint background routing', () => {
  it('routes a validated request, stores only metadata, and accepts one matching result', async () => {
    const base = createStub();
    const state = { tabId: 7, active: true, lastTabId: 7 };
    base.store.set('inspection', state);
    const stub = await loadBackground(base);
    useLiveContent(stub);

    expect(await startBlueprintExtraction(stub, 'bp-ok')).toEqual({ ok: true });
    expect(sentToTab(stub, MessageType.ExtractWebsiteBlueprint)?.[1]).toEqual({
      type: MessageType.ExtractWebsiteBlueprint,
      requestId: 'bp-ok',
    });
    expect(stub.scripting.executeScript).not.toHaveBeenCalled();
    expect(stub.store.get('inspection')).toEqual(state);
    expect(stub.store.get('website-blueprint-request')).toEqual({
      tabId: 42,
      requestId: 'bp-ok',
      url: 'https://example.com/page',
    });
    expect(JSON.stringify(sentToTab(stub, MessageType.ExtractWebsiteBlueprint)?.[1] ?? '')).not.toContain(
      'payload',
    );

    const blueprint = blueprintFor('bp-ok');
    const sender = { tab: { id: 42, url: 'https://example.com/page' } };
    expect(await dispatch(stub, {
      type: MessageType.BlueprintChanged,
      payload: blueprint,
    }, sender)).toEqual({ ok: true });
    expect(sentEvents(stub, MessageType.BlueprintChanged)).toEqual([
      { type: MessageType.BlueprintChanged, payload: blueprint },
    ]);
    expect(stub.store.has('website-blueprint-request')).toBe(false);

    await dispatch(stub, { type: MessageType.BlueprintChanged, payload: blueprint }, sender);
    expect(sentEvents(stub, MessageType.BlueprintChanged)).toHaveLength(1);
  });

  it('rejects invalid requests and unsupported tabs without injecting', async () => {
    const stub = await loadBackground(createStub());
    useLiveContent(stub);

    expect(await dispatch(stub, {
      type: MessageType.ExtractWebsiteBlueprint,
      requestId: '',
    }, {})).toEqual({
      ok: false,
      error: 'Invalid website blueprint request.',
      errorCode: 'invalid-request',
    });

    stub.tabs.query.mockResolvedValue([]);
    expect(await dispatch(stub, {
      type: MessageType.ExtractWebsiteBlueprint,
      requestId: 'bp-no-tab',
    }, {})).toEqual({
      ok: false,
      error: 'There is no active tab to inspect.',
      errorCode: 'no-active-tab',
    });

    stub.tabs.query.mockResolvedValue([{ id: 42, url: 'chrome://extensions' }]);
    expect(await dispatch(stub, {
      type: MessageType.ExtractWebsiteBlueprint,
      requestId: 'bp-unsupported',
    }, {})).toEqual({
      ok: false,
      error: 'This page cannot be inspected. Try a regular http(s) website.',
      errorCode: 'unsupported-url',
    });
    expect(stub.tabs.sendMessage).not.toHaveBeenCalled();
    expect(stub.scripting.executeScript).not.toHaveBeenCalled();
    expect(stub.store.has('website-blueprint-request')).toBe(false);
  });

  it('injects only when no live content script responds', async () => {
    const stub = await loadBackground(createStub());
    let pings = 0;
    stub.tabs.sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => {
      if (message.type === MessageType.Ping) {
        pings += 1;
        return pings === 2 ? { type: MessageType.Pong } : undefined;
      }
      return { ok: true };
    });

    expect(await startBlueprintExtraction(stub, 'bp-inject')).toEqual({ ok: true });
    expect(stub.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 42 },
      files: ['content.js'],
    });
    expect(sentToTab(stub, MessageType.ExtractWebsiteBlueprint)?.[1]).toEqual({
      type: MessageType.ExtractWebsiteBlueprint,
      requestId: 'bp-inject',
    });
  });

  it('clears pending state when injection, forwarding, or acknowledgement fails', async () => {
    const injection = await loadBackground(createStub());
    useLiveContent(injection, 0);
    injection.scripting.executeScript.mockRejectedValue(new Error('cannot inject'));
    expect(await startBlueprintExtraction(injection, 'bp-injection-fail')).toMatchObject({
      ok: false,
      errorCode: 'website-blueprint-extraction-failed',
    });
    expect(injection.store.has('website-blueprint-request')).toBe(false);

    const forwarding = await loadBackground(createStub());
    forwarding.tabs.sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => {
      if (message.type === MessageType.Ping) return { type: MessageType.Pong };
      if (message.type === MessageType.ExtractWebsiteBlueprint) throw new Error('forward failed');
      return { ok: true };
    });
    expect(await startBlueprintExtraction(forwarding, 'bp-forward-fail')).toMatchObject({
      ok: false,
      errorCode: 'website-blueprint-extraction-failed',
    });
    expect(forwarding.store.has('website-blueprint-request')).toBe(false);

    const ack = await loadBackground(createStub());
    ack.tabs.sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => {
      if (message.type === MessageType.Ping) return { type: MessageType.Pong };
      if (message.type === MessageType.ExtractWebsiteBlueprint) return { ok: false, errorCode: 'capture-in-progress' };
      return { ok: true };
    });
    expect(await startBlueprintExtraction(ack, 'bp-ack-fail')).toEqual({
      ok: false,
      error: 'The website blueprint request was not accepted.',
      errorCode: 'capture-in-progress',
    });
    expect(ack.store.has('website-blueprint-request')).toBe(false);

    const invalidAck = await loadBackground(createStub());
    invalidAck.tabs.sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => {
      if (message.type === MessageType.Ping) return { type: MessageType.Pong };
      if (message.type === MessageType.ExtractWebsiteBlueprint) return undefined;
      return { ok: true };
    });
    expect(await startBlueprintExtraction(invalidAck, 'bp-invalid-ack')).toEqual({
      ok: false,
      error: 'Invalid acknowledgement from the website blueprint extractor.',
      errorCode: 'invalid-ack',
    });
    expect(invalidAck.store.has('website-blueprint-request')).toBe(false);
  });

  it('returns a typed acknowledgement when pending state cannot be stored', async () => {
    const base = createStub();
    base.storage.session.set = vi.fn().mockRejectedValue(new Error('session unavailable'));
    const stub = await loadBackground(base);
    useLiveContent(stub);

    expect(await startBlueprintExtraction(stub, 'bp-storage-failure')).toEqual({
      ok: false,
      error: 'session unavailable',
      errorCode: 'website-blueprint-extraction-failed',
    });
    expect(stub.store.has('website-blueprint-request')).toBe(false);
  });

  it('delivers a result emitted before the acknowledgement resolves', async () => {
    const stub = await loadBackground(createStub());
    const requestId = 'bp-early-event';
    stub.tabs.query.mockResolvedValue([{ id: 42, url: 'https://example.com/page' }]);
    stub.tabs.sendMessage.mockImplementation(async (_tabId: number, message: { type: string; requestId?: string }) => {
      if (message.type === MessageType.Ping) return { type: MessageType.Pong };
      if (message.type === MessageType.ExtractWebsiteBlueprint) {
        void dispatch(stub, {
          type: MessageType.BlueprintChanged,
          payload: blueprintFor(requestId),
        }, { tab: { id: 42, url: 'https://example.com/page' } });
        return { ok: true };
      }
      return { ok: true };
    });

    expect(await startBlueprintExtraction(stub, requestId)).toEqual({ ok: true });
    await flush();
    expect(sentEvents(stub, MessageType.BlueprintChanged)).toHaveLength(1);
    expect(stub.store.has('website-blueprint-request')).toBe(false);
  });

  it('rejects wrong request, wrong tab, wrong URL, missing sender, and malformed payloads', async () => {
    const stub = await loadBackground(createStub());
    useLiveContent(stub);
    await startBlueprintExtraction(stub, 'bp-validate');
    const blueprint = blueprintFor('bp-validate');
    const sender = { tab: { id: 42, url: 'https://example.com/page' } };

    await dispatch(stub, {
      type: MessageType.BlueprintChanged,
      payload: blueprintFor('bp-wrong'),
    }, sender);
    await dispatch(stub, {
      type: MessageType.BlueprintChanged,
      payload: blueprint,
    }, { tab: { id: 99, url: 'https://example.com/page' } });
    await dispatch(stub, {
      type: MessageType.BlueprintChanged,
      payload: blueprint,
    }, { tab: { id: 42, url: 'https://example.com/elsewhere' } });
    await dispatch(stub, {
      type: MessageType.BlueprintChanged,
      payload: blueprint,
    }, {});
    expect(await dispatch(stub, {
      type: MessageType.BlueprintChanged,
      payload: {},
    }, sender)).toBe(false);
    expect(sentEvents(stub, MessageType.BlueprintChanged)).toHaveLength(0);

    expect(await dispatch(stub, {
      type: MessageType.BlueprintChanged,
      payload: blueprint,
    }, sender)).toEqual({ ok: true });
    expect(sentEvents(stub, MessageType.BlueprintChanged)).toHaveLength(1);
  });

  it('ignores malformed stored pending state', async () => {
    const base = createStub();
    base.store.set('website-blueprint-request', {
      tabId: '42',
      requestId: 'bp-malformed',
      url: 'https://example.com/page',
    });
    const stub = await loadBackground(base);

    await dispatch(stub, {
      type: MessageType.BlueprintChanged,
      payload: blueprintFor('bp-malformed'),
    }, { tab: { id: 42, url: 'https://example.com/page' } });
    expect(sentEvents(stub, MessageType.BlueprintChanged)).toHaveLength(0);
  });

  it('broadcasts a matching website-blueprint error and clears only its pending state', async () => {
    const stub = await loadBackground(createStub());
    useLiveContent(stub);
    await startBlueprintExtraction(stub, 'bp-error');
    const sender = { tab: { id: 42, url: 'https://example.com/page' } };

    expect(await dispatch(stub, {
      type: MessageType.RuntimeError,
      payload: {
        source: 'website-blueprint',
        requestId: 'bp-error',
        message: 'capture failed',
        code: 'website-blueprint-extraction-failed',
      },
    }, sender)).toEqual({ ok: true });
    expect(sentEvents(stub, MessageType.RuntimeError)).toHaveLength(1);
    expect(stub.store.has('website-blueprint-request')).toBe(false);

    await startBlueprintExtraction(stub, 'bp-unrelated-error');
    await dispatch(stub, {
      type: MessageType.RuntimeError,
      payload: {
        source: 'design-system',
        requestId: 'bp-unrelated-error',
        message: 'not blueprint',
      },
    }, sender);
    expect(sentEvents(stub, MessageType.RuntimeError)).toHaveLength(1);
    expect(stub.store.has('website-blueprint-request')).toBe(true);
  });

  it('clears pending blueprints on tab switch, closure, and navigation', async () => {
    const stub = await loadBackground(createStub());
    useLiveContent(stub);
    const event = {
      type: MessageType.BlueprintChanged,
      payload: blueprintFor('bp-clear'),
    };
    const sender = { tab: { id: 42, url: 'https://example.com/page' } };

    await startBlueprintExtraction(stub, 'bp-clear');
    const onActivated = stub.tabs.onActivated.addListener.mock.calls[0]?.[0] as
      | ((details: { tabId: number }) => void)
      | undefined;
    onActivated?.({ tabId: 99 });
    await flush();
    await dispatch(stub, event, sender);
    expect(stub.store.has('website-blueprint-request')).toBe(false);

    await startBlueprintExtraction(stub, 'bp-clear');
    const onRemoved = stub.tabs.onRemoved.addListener.mock.calls[0]?.[0] as
      | ((tabId: number) => void)
      | undefined;
    onRemoved?.(42);
    await flush();
    await dispatch(stub, event, sender);
    expect(stub.store.has('website-blueprint-request')).toBe(false);

    await startBlueprintExtraction(stub, 'bp-clear');
    const onUpdated = stub.tabs.onUpdated.addListener.mock.calls[0]?.[0] as
      | ((tabId: number, changeInfo: { url?: string }) => void)
      | undefined;
    onUpdated?.(42, { url: 'https://example.com/new' });
    await flush();
    await dispatch(stub, event, sender);
    expect(stub.store.has('website-blueprint-request')).toBe(false);
    expect(sentEvents(stub, MessageType.BlueprintChanged)).toHaveLength(0);
  });

  it('keeps design system, inspector, and motion state untouched', async () => {
    const base = createStub();
    const state = { tabId: 7, active: true, lastTabId: 7 };
    base.store.set('inspection', state);
    const stub = await loadBackground(base);
    useLiveContent(stub);

    await startExtraction(stub, 'ds-isolation');
    await startBlueprintExtraction(stub, 'bp-isolation');
    const sender = { tab: { id: 42, url: 'https://example.com/page' } };
    await dispatch(stub, {
      type: MessageType.BlueprintChanged,
      payload: blueprintFor('bp-isolation'),
    }, sender);

    expect(sentEvents(stub, MessageType.BlueprintChanged)).toHaveLength(1);
    expect(stub.store.has('website-blueprint-request')).toBe(false);
    expect(stub.store.get('design-system-request')).toEqual({
      tabId: 42,
      requestId: 'ds-isolation',
      url: 'https://example.com/page',
    });
    expect(stub.store.get('inspection')).toEqual(state);
    expect(sentEvents(stub, MessageType.DesignSystemChanged)).toHaveLength(0);

    await dispatch(stub, {
      type: MessageType.DesignSystemChanged,
      payload: makeDesignSystemSnapshot({ requestId: 'ds-isolation' }),
    }, sender);
    expect(sentEvents(stub, MessageType.DesignSystemChanged)).toHaveLength(1);

    expect(await dispatch(stub, { type: MessageType.GetSnapshot }, {})).toEqual({ ok: true });
    expect(stub.tabs.sendMessage).toHaveBeenCalledWith(7, { type: MessageType.GetSnapshot });
    expect(await dispatch(stub, {
      type: MessageType.ReplayMotion,
      action: 'isolated-start',
      animationId: 'a1',
    }, {})).toEqual({ ok: true });
    expect(stub.tabs.sendMessage).toHaveBeenCalledWith(7, {
      type: MessageType.ReplayMotion,
      action: 'isolated-start',
      animationId: 'a1',
    });
    expect(stub.store.get('inspection')).toEqual(state);
  });

  it('still broadcasts a valid result when pending cleanup fails', async () => {
    const base = createStub();
    base.storage.session.remove = vi.fn().mockRejectedValue(new Error('remove failed'));
    const stub = await loadBackground(base);
    useLiveContent(stub);
    await startBlueprintExtraction(stub, 'bp-cleanup-failure');

    expect(await dispatch(stub, {
      type: MessageType.BlueprintChanged,
      payload: blueprintFor('bp-cleanup-failure'),
    }, { tab: { id: 42, url: 'https://example.com/page' } })).toEqual({ ok: true });
    expect(sentEvents(stub, MessageType.BlueprintChanged)).toHaveLength(1);
  });
});
