import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageType, isWebsiteBlueprint } from '../src/shared/messages';
import { DESIGN_SYSTEM_LIMITS } from '../src/shared/types';

type ContentListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (value: unknown) => void,
) => boolean | void;

interface ContentStub {
  runtime: {
    id: string;
    sendMessage: ReturnType<typeof vi.fn>;
    onMessage: { addListener: ReturnType<typeof vi.fn> };
  };
  listener: ContentListener;
}

function eventOfType(stub: ContentStub, type: string) {
  return eventsOfType(stub, type)[0];
}

function eventsOfType(stub: ContentStub, type: string) {
  const calls = stub.runtime.sendMessage.mock.calls as unknown[][];
  return calls
    .map(([message]) => message as { type?: unknown; payload?: unknown })
    .filter((message) => message?.type === type);
}

function dispatch(stub: ContentStub, message: unknown): unknown {
  let response: unknown;
  stub.listener(message, {}, (value) => {
    response = value;
  });
  return response;
}

async function loadContent(): Promise<ContentStub> {
  vi.resetModules();
  const runtime = {
    id: 'pixelpeek-test',
    sendMessage: vi.fn().mockResolvedValue({ ok: true }),
    onMessage: { addListener: vi.fn() },
  };
  vi.stubGlobal('chrome', { runtime });
  await import('../src/content/index');
  const listener = runtime.onMessage.addListener.mock.calls[0]?.[0] as ContentListener | undefined;
  if (!listener) throw new Error('Content script did not register a message listener.');
  return { runtime, listener };
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.getElementById('pixelpeek-overlay-host')?.remove();
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 100,
    bottom: 20,
    width: 100,
    height: 20,
    toJSON: () => ({}),
  } as DOMRect);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  document.getElementById('pixelpeek-overlay-host')?.remove();
});

describe('Phase 4 content integration', () => {
  it('extracts the page through a guarded event and acknowledges without a payload', async () => {
    const stub = await loadContent();
    document.body.innerHTML = `
      <style>:root { --brand-accent: #8b6dff; }</style>
      <main>
        <p class="lead" style="font-size:18px;color:rgb(139, 109, 255);padding-top:8px">Hello</p>
        <input value="secret" placeholder="hint" />
      </main>
    `;
    const input = document.querySelector('input');
    if (!input) throw new Error('Missing input fixture.');
    Object.defineProperty(input, 'value', {
      get: () => {
        throw new Error('input value was read');
      },
    });
    Object.defineProperty(input, 'placeholder', {
      get: () => {
        throw new Error('input placeholder was read');
      },
    });
    const textGetter = vi.spyOn(Node.prototype, 'textContent', 'get');

    expect(dispatch(stub, { type: MessageType.ExtractDesignSystem, requestId: 'ds-content' })).toEqual({
      ok: true,
    });

    const event = eventOfType(stub, MessageType.DesignSystemChanged);
    expect(event).toBeDefined();
    const payload = event?.payload as { requestId?: string; summary?: { elementsScanned?: number } };
    expect(payload.requestId).toBe('ds-content');
    expect(payload.summary?.elementsScanned).toBeGreaterThan(0);
    expect(textGetter).not.toHaveBeenCalled();
    expect(document.getElementById('pixelpeek-overlay-host')).toBeNull();
    for (const [message] of stub.runtime.sendMessage.mock.calls as unknown[][]) {
      expect(JSON.stringify(message)).not.toContain('secret');
      expect(JSON.stringify(message)).not.toContain('hint');
    }
  });

  it('rejects an invalid design-system request before extracting', async () => {
    const stub = await loadContent();
    expect(dispatch(stub, { type: MessageType.ExtractDesignSystem, requestId: '' })).toEqual({
      ok: false,
      error: 'Invalid design-system request.',
      errorCode: 'invalid-request',
    });
    expect(stub.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('reports extraction errors through the runtime error contract', async () => {
    const stub = await loadContent();
    const clock = vi.spyOn(Date.prototype, 'toISOString').mockImplementation(() => {
      throw new Error('clock failed');
    });

    expect(dispatch(stub, { type: MessageType.ExtractDesignSystem, requestId: 'ds-error' })).toEqual({
      ok: false,
      error: 'clock failed',
      errorCode: 'design-system-extraction-failed',
    });
    expect(eventOfType(stub, MessageType.RuntimeError)).toEqual({
      type: MessageType.RuntimeError,
      payload: {
        source: 'design-system',
        requestId: 'ds-error',
        message: 'clock failed',
        code: 'design-system-extraction-failed',
      },
    });
    expect(eventOfType(stub, MessageType.DesignSystemChanged)).toBeUndefined();
    clock.mockRestore();
  });

  it('enforces the element limit on a large page', async () => {
    const stub = await loadContent();
    for (let index = 0; index < 40; index += 1) {
      const branch = document.createElement('div');
      for (let child = 0; child < 20; child += 1) {
        const span = document.createElement('span');
        span.style.fontSize = '14px';
        span.appendChild(document.createTextNode('x'));
        branch.appendChild(span);
      }
      document.body.appendChild(branch);
    }

    expect(dispatch(stub, { type: MessageType.ExtractDesignSystem, requestId: 'ds-limit' })).toEqual({
      ok: true,
    });
    const event = eventOfType(stub, MessageType.DesignSystemChanged);
    const payload = event?.payload as { summary?: { elementsScanned?: number } };
    expect(payload.summary?.elementsScanned).toBeLessThanOrEqual(DESIGN_SYSTEM_LIMITS.maxElements);
    expect(isFinite(payload.summary?.elementsScanned ?? Number.NaN)).toBe(true);
  });

  it('keeps the existing ping, inspection, and snapshot responses intact', async () => {
    const stub = await loadContent();
    expect(dispatch(stub, { type: MessageType.Ping })).toEqual({ type: MessageType.Pong });
    expect(eventOfType(stub, MessageType.StateChanged)).toBeUndefined();

    expect(dispatch(stub, { type: MessageType.StartInspection })).toEqual({ ok: true });
    const started = eventOfType(stub, MessageType.StateChanged)?.payload as { active?: boolean };
    expect(started.active).toBe(true);

    expect(dispatch(stub, { type: MessageType.GetSnapshot })).toEqual({
      ok: false,
      error: 'No element is selected.',
      errorCode: 'no-selection',
    });
    expect(dispatch(stub, { type: MessageType.StopInspection })).toEqual({ ok: true });
  });

  it('invalidates stale replay handles when inspection or selection ends', async () => {
    const stub = await loadContent();
    document.body.innerHTML = '<div id="target">inspect me</div>';
    dispatch(stub, { type: MessageType.StartInspection });
    const target = document.getElementById('target');
    if (!target) throw new Error('Missing target fixture.');
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(eventsOfType(stub, MessageType.SnapshotChanged)).toHaveLength(1);
    expect(eventsOfType(stub, MessageType.ReplayInvalidated).length).toBeGreaterThan(0);

    dispatch(stub, { type: MessageType.StopInspection });
    expect(eventsOfType(stub, MessageType.ReplayInvalidated).length).toBeGreaterThan(1);
    expect(eventOfType(stub, MessageType.ReplayInvalidated)?.payload).toEqual({
      reason: 'replay handles were cleared',
    });

    target.remove();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
});

describe('Phase 5 website blueprint content integration', () => {
  it('emits a validated blueprint event and acknowledges without a payload', async () => {
    const stub = await loadContent();
    document.body.innerHTML = `
      <header><nav style="display:flex;gap:8px">Navigation</nav></header>
      <main style="display:flex"><button class="primary" style="color:#8b6dff">Click me</button></main>
      <input value="secret" placeholder="hint" />
    `;
    const input = document.querySelector('input');
    if (!input) throw new Error('Missing input fixture.');
    Object.defineProperty(input, 'value', {
      get: () => {
        throw new Error('input value was read');
      },
    });
    Object.defineProperty(input, 'placeholder', {
      get: () => {
        throw new Error('input placeholder was read');
      },
    });
    const textGetter = vi.spyOn(Node.prototype, 'textContent', 'get');

    expect(dispatch(stub, {
      type: MessageType.ExtractWebsiteBlueprint,
      requestId: 'bp-content',
    })).toEqual({ ok: true });

    const event = eventOfType(stub, MessageType.BlueprintChanged);
    expect(event).toBeDefined();
    const blueprint = event?.payload;
    expect(isWebsiteBlueprint(blueprint)).toBe(true);
    expect((blueprint as { metadata?: { requestId?: string } }).metadata?.requestId).toBe('bp-content');
    expect(textGetter).not.toHaveBeenCalled();
    for (const [message] of stub.runtime.sendMessage.mock.calls as unknown[][]) {
      expect(JSON.stringify(message)).not.toContain('secret');
      expect(JSON.stringify(message)).not.toContain('hint');
      expect(JSON.stringify(message)).not.toContain('Click me');
      expect(JSON.stringify(message)).not.toContain('Navigation');
    }

    expect(dispatch(stub, { type: MessageType.ExtractDesignSystem, requestId: 'ds-after-bp' })).toEqual({
      ok: true,
    });
    expect((eventOfType(stub, MessageType.DesignSystemChanged)?.payload as { requestId?: string }).requestId)
      .toBe('ds-after-bp');
  });

  it('rejects an invalid website blueprint request before extracting', async () => {
    const stub = await loadContent();
    expect(dispatch(stub, { type: MessageType.ExtractWebsiteBlueprint, requestId: '' })).toEqual({
      ok: false,
      error: 'Invalid website blueprint request.',
      errorCode: 'invalid-request',
    });
    expect(stub.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('reports website blueprint extraction errors through the runtime error contract', async () => {
    const stub = await loadContent();
    const getAttribute = vi.spyOn(Element.prototype, 'getAttribute').mockImplementation(() => {
      throw new Error('sampling failed');
    });

    expect(dispatch(stub, {
      type: MessageType.ExtractWebsiteBlueprint,
      requestId: 'bp-error',
    })).toEqual({
      ok: false,
      error: 'sampling failed',
      errorCode: 'website-blueprint-extraction-failed',
    });
    expect(eventOfType(stub, MessageType.RuntimeError)).toEqual({
      type: MessageType.RuntimeError,
      payload: {
        source: 'website-blueprint',
        requestId: 'bp-error',
        message: 'sampling failed',
        code: 'website-blueprint-extraction-failed',
      },
    });
    expect(eventOfType(stub, MessageType.BlueprintChanged)).toBeUndefined();

    getAttribute.mockRestore();
    document.body.innerHTML = '<main style="display:flex"><button>Ready</button></main>';
    expect(dispatch(stub, {
      type: MessageType.ExtractWebsiteBlueprint,
      requestId: 'bp-recovered',
    })).toEqual({ ok: true });
    expect((eventOfType(stub, MessageType.BlueprintChanged)?.payload as {
      metadata?: { requestId?: string };
    }).metadata?.requestId).toBe('bp-recovered');
  });

  it('acknowledges overlapping capture requests without a second event', async () => {
    const stub = await loadContent();
    document.body.innerHTML = '<main style="display:flex"><button>Ready</button></main>';
    const original = Date.prototype.toISOString;
    let dispatched = false;
    const clock = vi.spyOn(Date.prototype, 'toISOString').mockImplementation(function mockToISOString(this: Date) {
      if (!dispatched) {
        dispatched = true;
        expect(dispatch(stub, {
          type: MessageType.ExtractWebsiteBlueprint,
          requestId: 'bp-overlap',
        })).toEqual({
          ok: false,
          error: 'A website blueprint capture is already running.',
          errorCode: 'capture-in-progress',
        });
      }
      return original.call(this);
    });

    expect(dispatch(stub, {
      type: MessageType.ExtractWebsiteBlueprint,
      requestId: 'bp-primary',
    })).toEqual({ ok: true });
    expect(eventsOfType(stub, MessageType.BlueprintChanged)).toHaveLength(1);
    expect((eventOfType(stub, MessageType.BlueprintChanged)?.payload as {
      metadata?: { requestId?: string };
    }).metadata?.requestId).toBe('bp-primary');
    expect(eventOfType(stub, MessageType.RuntimeError)).toBeUndefined();
    clock.mockRestore();
  });
});
