import { describe, expect, it } from 'vitest';
import {
  MessageType,
  isContentEvent,
  isElementInfo,
  isInspectionState,
  isPanelEvent,
  isRequestResult,
  isStateResult,
} from '../src/shared/messages';
import { describeMessageError, isInspectableUrl } from '../src/shared/tabs';
import type { ElementInfo } from '../src/shared/types';

const element: ElementInfo = {
  tag: 'button',
  id: 'cta',
  classes: ['primary'],
  dimensions: { width: 120, height: 40 },
  backgroundColor: '#8b6dff',
  color: null,
  fontFamily: null,
  fontSize: '14px',
  fontWeight: null,
  padding: null,
  margin: null,
  borderRadius: null,
  boxShadow: null,
  display: null,
  position: null,
  capturedAt: 'fixed',
  sourceUrl: 'https://example.com/',
};

describe('runtime guards', () => {
  it('accepts a well-formed element and rejects partial or hostile payloads', () => {
    expect(isElementInfo(element)).toBe(true);
    expect(isElementInfo({ ...element, dimensions: { width: '120' } })).toBe(false);
    expect(isElementInfo({ ...element, classes: ['ok', 3] })).toBe(false);
    expect(isElementInfo({ ...element, outerHTML: '<html>...' })).toBe(true);
  });

  it('discriminates panel events by type and payload', () => {
    expect(isPanelEvent({ type: MessageType.ElementSelected, payload: element })).toBe(true);
    expect(isPanelEvent({ type: MessageType.ElementSelected, payload: { tag: 'div' } })).toBe(false);
    expect(isPanelEvent({ type: MessageType.StateChanged, payload: { tabId: 4, active: true } })).toBe(true);
    expect(isPanelEvent({ type: MessageType.StateChanged, payload: { tabId: '4', active: true } })).toBe(false);
    expect(isPanelEvent({ type: 'unexpected' })).toBe(false);
  });

  it('treats pong as a content event but not a panel event', () => {
    const pong = { type: MessageType.Pong };
    expect(isContentEvent(pong)).toBe(true);
    expect(isPanelEvent(pong)).toBe(false);
  });

  it('validates inspection state and request results', () => {
    expect(isInspectionState({ tabId: null, active: false })).toBe(true);
    expect(isInspectionState({ tabId: -1, active: true })).toBe(true);
    expect(isInspectionState({ tabId: 1.5, active: true })).toBe(false);
    expect(isRequestResult({ ok: true, state: { tabId: null, active: false } })).toBe(true);
    expect(isRequestResult({ ok: true, error: 42 })).toBe(false);
    expect(isStateResult({ ok: true })).toBe(false);
    expect(isStateResult({ ok: true, state: { tabId: null, active: false } })).toBe(true);
  });
});

describe('tab and error helpers', () => {
  it('allows only http(s) pages for injection', () => {
    expect(isInspectableUrl('https://example.com/path')).toBe(true);
    expect(isInspectableUrl('http://localhost:3000/')).toBe(true);
    expect(isInspectableUrl('chrome://extensions')).toBe(false);
    expect(isInspectableUrl('chrome-extension://abc/panel.html')).toBe(false);
    expect(isInspectableUrl('about:blank')).toBe(false);
    expect(isInspectableUrl('file:///tmp/a.html')).toBe(false);
    expect(isInspectableUrl(undefined)).toBe(false);
  });

  it('stringifies unknown errors', () => {
    expect(describeMessageError(new Error('boom'))).toBe('boom');
    expect(describeMessageError('raw')).toBe('raw');
  });
});
