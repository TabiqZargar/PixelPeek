import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageType } from '../src/shared/messages';
import { useDesignSystem } from '../src/panel/hooks/useDesignSystem';
import { ExtensionRequestError } from '../src/shared/transport';
import { makeDesignSystemSnapshot } from './fixtures';

const mockState = vi.hoisted(() => ({
  extract: vi.fn(),
  listener: { current: null as null | ((event: unknown) => void) },
}));

vi.mock('../src/shared/transport', async () => {
  const actual = await vi.importActual<typeof import('../src/shared/transport')>('../src/shared/transport');
  return {
    ...actual,
    extractDesignSystem: mockState.extract,
    onPanelEvent: (listener: (event: unknown) => void) => {
      mockState.listener.current = listener;
      return () => {
        if (mockState.listener.current === listener) mockState.listener.current = null;
      };
    },
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let api: ReturnType<typeof useDesignSystem> | null = null;

function Harness() {
  api = useDesignSystem();
  return (
    <button
      type="button"
      onClick={() => {
        void api!.extract();
      }}
    >
      Extract
    </button>
  );
}

function current(): ReturnType<typeof useDesignSystem> {
  if (!api) throw new Error('Hook did not render.');
  return api;
}

function clickExtract() {
  const button = container.querySelector('button')!;
  act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api = null;
  mockState.extract.mockReset();
  mockState.listener.current = null;
  act(() => root.render(<Harness />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('useDesignSystem', () => {
  it('accepts only the matching guarded snapshot event', () => {
    mockState.extract.mockResolvedValue({ ok: true });
    clickExtract();
    expect(current().status).toBe('loading');

    const requestId = mockState.extract.mock.calls[0]?.[0] as string;
    expect(requestId).toMatch(/^ds-/);
    act(() =>
      mockState.listener.current?.({
        type: MessageType.DesignSystemChanged,
        payload: makeDesignSystemSnapshot({ requestId: 'stale-request' }),
      }),
    );
    expect(current().status).toBe('loading');
    expect(current().snapshot).toBeNull();

    act(() =>
      mockState.listener.current?.({
        type: MessageType.DesignSystemChanged,
        payload: makeDesignSystemSnapshot({ requestId }),
      }),
    );
    expect(current().status).toBe('ready');
    expect(current().snapshot?.requestId).toBe(requestId);
    expect(current().error).toBeNull();
  });

  it('surfaces extraction request error codes', async () => {
    mockState.extract.mockRejectedValueOnce(
      new ExtensionRequestError('This page cannot be inspected. Try a regular http(s) website.', 'unsupported-url'),
    );
    await act(async () => {
      container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(current().status).toBe('error');
    expect(current().error).toContain('regular http(s)');
    expect(current().errorCode).toBe('unsupported-url');
  });

  it('accepts runtime extraction failures while a request is pending', () => {
    mockState.extract.mockResolvedValue({ ok: true });
    clickExtract();
    act(() =>
      mockState.listener.current?.({
        type: MessageType.RuntimeError,
        payload: { message: 'The snapshot failed validation.', code: 'design-system-extraction-failed' },
      }),
    );
    expect(current().status).toBe('error');
    expect(current().errorCode).toBe('design-system-extraction-failed');
  });
});
