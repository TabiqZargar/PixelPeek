import { MessageType, type ContentEvent } from '../shared/messages';
import type { ElementInfo } from '../shared/types';
import { extractElementInfo } from './inspect';

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

let active = false;
let overlay: Overlay | null = null;
let highlighted: Element | null = null;

function hideHighlight(): void {
  highlighted = null;
  if (!overlay) return;
  overlay.box.classList.add('hidden');
  overlay.label.classList.add('hidden');
}

function showHighlight(element: Element): void {
  if (!overlay) return;
  if (element === highlighted) {
    const rect = element.getBoundingClientRect();
    positionOverlay(rect);
    return;
  }
  highlighted = element;
  const rect = element.getBoundingClientRect();
  overlay.box.classList.remove('hidden');
  overlay.label.classList.remove('hidden');
  overlay.label.textContent = `<${element.tagName.toLowerCase()}> ${Math.round(rect.width)} × ${Math.round(rect.height)}`;
  positionOverlay(rect);
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

  let info: ElementInfo;
  try {
    info = extractElementInfo(target);
  } catch (error) {
    emit({
      type: MessageType.RuntimeError,
      payload: { message: error instanceof Error ? error.message : String(error) },
    });
    stop();
    return;
  }
  emit({ type: MessageType.ElementSelected, payload: info });
  stop();
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    stop();
  }
}

function onPageHide(): void {
  stop();
}

function start(): void {
  if (active) return;
  const doc = document;
  overlay = createOverlay(doc);
  if (!overlay) return;
  active = true;
  doc.addEventListener('mousemove', onMove, true);
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('blur', stop, true);
  window.addEventListener('pagehide', onPageHide, true);
  emit({ type: MessageType.StateChanged, payload: { tabId: null, active: true } });
}

function stop(): void {
  if (!active) return;
  active = false;
  document.removeEventListener('mousemove', onMove, true);
  document.removeEventListener('click', onClick, true);
  document.removeEventListener('keydown', onKeyDown, true);
  window.removeEventListener('blur', stop, true);
  window.removeEventListener('pagehide', onPageHide, true);
  hideHighlight();
  overlay?.host.remove();
  overlay = null;
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
    default:
      return false;
  }
});
