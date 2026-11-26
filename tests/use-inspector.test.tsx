import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageType } from '../src/shared/messages';
import { useInspector } from '../src/panel/hooks/useInspector';
import { makeSnapshot } from './fixtures';

const mockState = vi.hoisted(() => ({
  getInspectionState: vi.fn(),
  getSnapshot: vi.fn(),
  replayMotion: vi.fn(),
  sendToBackground: vi.fn(),
  listener: { current: null as null | ((event: unknown) => void) },
}));

vi.mock('../src/shared/transport', async () => {
  const actual = await vi.importActual<typeof import('../src/shared/transport')>('../src/shared/transport');
  return {
    ...actual,
    getInspectionState: mockState.getInspectionState,
    getSnapshot: mockState.getSnapshot,
    replayMotion: mockState.replayMotion,
    sendToBackground: mockState.sendToBackground,
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
let api: ReturnType<typeof useInspector> | null = null;
let lastReplayResult: boolean | null = null;

function Harness() {
  api = useInspector();
  return (
    <button
      type="button"
      onClick={() => {
        void api!.replay('isolated-start', 'a1').then((ok) => {
          lastReplayResult = ok;
        });
      }}
    >
      Replay
    </button>
  );
}

function emit(event: unknown) {
  act(() => mockState.listener.current?.(event));
}

async function clickReplay() {
  await act(async () => {
    container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api = null;
  lastReplayResult = null;
  mockState.getInspectionState.mockResolvedValue({ tabId: null, active: false });
  mockState.getSnapshot.mockResolvedValue({ ok: false });
  mockState.replayMotion.mockResolvedValue({ ok: true });
  mockState.sendToBackground.mockResolvedValue({ ok: true });
  mockState.listener.current = null;
  act(() => root.render(<Harness />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('useInspector lifecycle isolation', () => {
  it('handles only inspector-attributed runtime errors', () => {
    emit({
      type: MessageType.RuntimeError,
      payload: {
        source: 'design-system',
        requestId: 'ds-1',
        message: 'extraction failed',
        code: 'design-system-extraction-failed',
      },
    });
    expect(api?.status).not.toBe('error');
    expect(api?.error).toBeNull();

    emit({
      type: MessageType.RuntimeError,
      payload: { source: 'inspector', message: 'capture failed', code: 'capture-failed' },
    });
    expect(api?.status).toBe('error');
    expect(api?.error).toBe('capture failed');
  });

  it('rejects stale replay actions and restores replay after a fresh snapshot', async () => {
    emit({ type: MessageType.ReplayInvalidated, payload: { reason: 'inspection stopped' } });
    await clickReplay();
    expect(lastReplayResult).toBe(false);
    expect(mockState.replayMotion).not.toHaveBeenCalled();
    expect(api?.error).toContain('no longer available');

    emit({ type: MessageType.SnapshotChanged, payload: makeSnapshot() });
    await clickReplay();
    expect(lastReplayResult).toBe(true);
    expect(mockState.replayMotion).toHaveBeenCalledWith('isolated-start', 'a1');
    expect(api?.error).toBeNull();
  });

  it('clears captured state when selection is cleared', () => {
    emit({ type: MessageType.SnapshotChanged, payload: makeSnapshot() });
    expect(api?.snapshot).not.toBeNull();
    emit({ type: MessageType.SelectionCleared, payload: { reason: 'navigation' } });
    expect(api?.snapshot).toBeNull();
    expect(api?.element).toBeNull();
  });
});
