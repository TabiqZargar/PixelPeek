import { MessageType, isHierarchyDirection, type ContentEvent } from '../shared/messages';
import type { ElementSnapshot, HierarchyDirection } from '../shared/types';
import { createSnapshot, type SnapshotDeps } from './snapshot';

const HOST_ID = 'pixelpeek-overlay-host';

const OVERLAY_CSS = `
:host {
  all: initial;
  position: fixed;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  z-index: 2147483647;
  pointer-events: none;
}
.box {
  position: fixed;
  box-sizing: border-box;
  border: 2px solid #8b6dff;
  border-radius: 2px;
  background: rgba(139, 109, 255, 0.09);
  box-shadow: 0 0 0 1px rgba(8, 8, 10, 0.8);
  pointer-events: none;
}
.selected {
  border-color: #48d6a8;
  background: rgba(72, 214, 168, 0.08);
  box-shadow: 0 0 0 1px rgba(8, 8, 10, 0.85), 0 0 14px rgba(72, 214, 168, 0.25);
}
.label {
  position: fixed;
  box-sizing: border-box;
  padding: 3px 7px;
  border: 1px solid rgba(139, 109, 255, 0.5);
  border-radius: 3px;
  background: #14121c;
  color: #ececf1;
  font: 600 11px/1.3 ui-monospace, SFMono-Regular, Consolas, monospace;
  white-space: nowrap;
  pointer-events: none;
}
.label.selected {
  border-color: rgba(72, 214, 168, 0.6);
  color: #c8f7e6;
}
.hidden { display: none; }
`;

interface Overlay {
  host: HTMLElement;
  box: HTMLElement;
  label: HTMLElement;
}

function createOverlay(doc: Document): Overlay | null {
  doc.getElementById(HOST_ID)?.remove();
  const host = doc.createElement('div');
  host.id = HOST_ID;
  host.setAttribute('aria-hidden', 'true');
  host.style.setProperty('all', 'initial', 'important');
  host.style.setProperty('display', 'block', 'important');
  host.style.setProperty('position', 'fixed', 'important');
  host.style.setProperty('pointer-events', 'none', 'important');
  host.style.setProperty('z-index', '2147483647', 'important');

  const root = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = OVERLAY_CSS;
  const box = doc.createElement('div');
  box.className = 'box hidden';
  const label = doc.createElement('div');
  label.className = 'label hidden';
  label.textContent = '';
  root.append(style, box, label);
  doc.documentElement.appendChild(host);
  return { host, box, label };
}

function isIgnored(element: Element): boolean {
  if (!element || element.id === HOST_ID) return true;
  return /^(HTML|BODY|HEAD|SCRIPT|STYLE|NOSCRIPT|TEMPLATE|LINK|META|TITLE)$/.test(
    element.tagName.toUpperCase(),
  );
}

function emit(event: ContentEvent): void {
  void chrome.runtime.sendMessage(event).catch(() => {
    /* the panel or background may be gone; the page is unaffected */
  });
}

const snapshotDeps: SnapshotDeps = {
  computedStyle: (element) => element.ownerDocument.defaultView!.getComputedStyle(element),
  parentStyle: (element) => element.ownerDocument.defaultView!.getComputedStyle(element),
  boundingRect: (element) => element.getBoundingClientRect(),
  hierarchy: {
    parent: (element) => element.parentElement,
    children: (element) => Array.from(element.children),
    previousSibling: (element) => element.previousElementSibling,
    nextSibling: (element) => element.nextElementSibling,
    meta: (element, depth) => ({
      tag: element.tagName.toLowerCase(),
      id: element.id || null,
      classes: Array.from(element.classList).slice(0, 6),
      depth,
    }),
  },
};

let active = false;
let overlay: Overlay | null = null;
let highlighted: Element | null = null;
let selected: Element | null = null;

function hideHighlight(): void {
  highlighted = null;
  if (!overlay) return;
  overlay.box.className = 'box hidden';
  overlay.label.className = 'label hidden';
  if (selected?.isConnected) showSelection(selected);
}

function showBox(element: Element, selectedStyle: boolean): DOMRect {
  const rect = element.getBoundingClientRect();
  if (!overlay) return rect;
  overlay.box.className = selectedStyle ? 'box selected' : 'box';
  overlay.label.className = selectedStyle ? 'label selected' : 'label';
  overlay.label.textContent = `<${element.tagName.toLowerCase()}> ${Math.round(rect.width)} × ${Math.round(rect.height)}${selectedStyle ? ' · selected' : ''}`;
  positionOverlay(rect);
  return rect;
}

function showHighlight(element: Element): void {
  if (!overlay) return;
  if (element === highlighted && element !== selected) {
    positionOverlay(element.getBoundingClientRect());
    return;
  }
  highlighted = element;
  showBox(element, false);
}

function showSelection(element: Element): void {
  if (!overlay) return;
  showBox(element, true);
}

function positionOverlay(rect: DOMRect): void {
  if (!overlay) return;
  const { box, label } = overlay;
  box.style.left = `${rect.left}px`;
  box.style.top = `${rect.top}px`;
  box.style.width = `${rect.width}px`;
  box.style.height = `${rect.height}px`;

  const labelWidth = Math.max(60, Math.min(260, rect.width));
  label.style.width = `${labelWidth}px`;
  label.style.left = `${Math.max(0, Math.min(rect.left, window.innerWidth - labelWidth))}px`;
  label.style.top = `${rect.top >= 26 ? rect.top - 24 : rect.top + 2}px`;
}

function clearSelection(reason: string): void {
  selected = null;
  emit({ type: MessageType.SelectionCleared, payload: { reason } });
  hideHighlight();
  overlay?.host.remove();
  overlay = null;
}

function capture(element: Element): ElementSnapshot {
  const snapshot = createSnapshot(element, snapshotDeps);
  selected = element;
  emit({ type: MessageType.ElementSelected, payload: snapshot.element });
  emit({ type: MessageType.SnapshotChanged, payload: snapshot });
  return snapshot;
}

function currentTarget(direction: HierarchyDirection, index?: number): Element | null {
  if (!selected?.isConnected) return null;
  switch (direction) {
    case 'parent':
      return selected.parentElement;
    case 'child':
      return selected.children[Math.max(0, index ?? 0)] ?? null;
    case 'previous-sibling':
      return selected.previousElementSibling;
    case 'next-sibling':
      return selected.nextElementSibling;
  }
}

function onMove(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element) || isIgnored(target)) {
    hideHighlight();
    return;
  }
  showHighlight(target);
}

function onClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element) || isIgnored(target)) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  try {
    capture(target);
  } catch (error) {
    emit({
      type: MessageType.RuntimeError,
      payload: {
        message: error instanceof Error ? error.message : String(error),
        code: 'capture-failed',
      },
    });
    stop({ clearSelection: true });
    return;
  }
  stop();
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    stop({ clearSelection: true });
  }
}

function onPageHide(): void {
  stop({ clearSelection: true });
}

function onBlur(): void {
  stop();
}

function start(): void {
  if (active) return;
  const doc = document;
  overlay = createOverlay(doc);
  if (!overlay) return;
  active = true;
  highlighted = null;
  doc.addEventListener('mousemove', onMove, true);
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('blur', onBlur, true);
  window.addEventListener('pagehide', onPageHide, true);
  emit({ type: MessageType.StateChanged, payload: { tabId: null, active: true } });
}

function stop(options: { clearSelection?: boolean } = {}): void {
  if (!active) return;
  active = false;
  document.removeEventListener('mousemove', onMove, true);
  document.removeEventListener('click', onClick, true);
  document.removeEventListener('keydown', onKeyDown, true);
  window.removeEventListener('blur', onBlur, true);
  window.removeEventListener('pagehide', onPageHide, true);
  highlighted = null;
  if (options.clearSelection) {
    clearSelection('inspection stopped');
  } else if (selected?.isConnected) {
    showSelection(selected);
  }
  emit({ type: MessageType.StateChanged, payload: { tabId: null, active: false } });
}

function isTypedMessage(value: unknown): value is { type: string } {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isTypedMessage(message)) return false;
  switch (message.type) {
    case MessageType.Ping:
      sendResponse({ type: MessageType.Pong });
      return false;
    case MessageType.StartInspection:
      start();
      sendResponse({ ok: true });
      return false;
    case MessageType.StopInspection:
      stop();
      sendResponse({ ok: true });
      return false;
    case MessageType.GetSnapshot: {
      if (!selected) {
        sendResponse({ ok: false, error: 'No element is selected.', errorCode: 'no-selection' });
        return false;
      }
      if (!selected.isConnected) {
        clearSelection('element was removed from the page');
        sendResponse({ ok: false, error: 'The selected element is no longer in the page.', errorCode: 'detached' });
        return false;
      }
      try {
        capture(selected);
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          errorCode: 'capture-failed',
        });
      }
      return false;
    }
    case MessageType.NavigateHierarchy: {
      const directionValue = (message as { direction?: unknown }).direction;
      if (!isHierarchyDirection(directionValue)) {
        sendResponse({ ok: false, error: 'Unknown hierarchy direction.', errorCode: 'invalid-direction' });
        return false;
      }
      if (!selected) {
        sendResponse({ ok: false, error: 'No element is selected.', errorCode: 'no-selection' });
        return false;
      }
      if (!selected.isConnected) {
        clearSelection('element was removed from the page');
        sendResponse({ ok: false, error: 'The selected element is no longer in the page.', errorCode: 'detached' });
        return false;
      }
      const indexValue = (message as { index?: unknown }).index;
      const index = typeof indexValue === 'number' && Number.isInteger(indexValue) ? indexValue : undefined;
      const target = currentTarget(directionValue, index);
      if (!target || isIgnored(target)) {
        sendResponse({ ok: false, error: 'There is no element in that direction.', errorCode: 'no-target' });
        return false;
      }
      try {
        capture(target);
        if (!active) showSelection(target);
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          errorCode: 'capture-failed',
        });
      }
      return false;
    }
    default:
      return false;
  }
});
