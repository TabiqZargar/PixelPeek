import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/panel/App';
import { MessageType } from '../src/shared/messages';

const mockState = vi.hoisted(() => ({
  sendToBackground: vi.fn(),
  getInspectionState: vi.fn(),
  getSnapshot: vi.fn(),
}));

vi.mock('../src/shared/transport', async () => {
  const actual = await vi.importActual<typeof import('../src/shared/transport')>('../src/shared/transport');
  return {
    ...actual,
    sendToBackground: mockState.sendToBackground,
    getInspectionState: mockState.getInspectionState,
    getSnapshot: mockState.getSnapshot,
    onPanelEvent: () => () => {},
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mockState.sendToBackground.mockReset();
  mockState.sendToBackground.mockResolvedValue({ ok: true, state: { tabId: null, active: false } });
  mockState.getInspectionState.mockResolvedValue({ tabId: 7, active: true, lastTabId: 7 });
  mockState.getSnapshot.mockResolvedValue({ ok: false });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('workspace navigation', () => {
  it('stops an active picker when leaving the Inspector workspace', async () => {
    await act(async () => {
      root.render(<App />);
      await Promise.resolve();
    });
    const motionButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Motion',
    );
    expect(motionButton).toBeDefined();

    await act(async () => {
      motionButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockState.sendToBackground).toHaveBeenCalledWith({ type: MessageType.StopInspection });
    expect(container.textContent).toContain('Inspect animations, transitions, keyframes and easing');
  });
});
