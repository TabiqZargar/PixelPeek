import { describe, expect, it } from 'vitest';
import {
  MessageType,
  isContentEvent,
  isElementInfo,
  isElementSnapshot,
  isInspectionState,
  isMotionReplayAction,
  isMotionSnapshot,
  isPanelEvent,
  isPanelRequest,
  isRequestResult,
  isStateResult,
} from '../src/shared/messages';
import { describeMessageError, isInspectableUrl } from '../src/shared/tabs';
import type { ElementInfo } from '../src/shared/types';
import { makeSnapshot } from './fixtures';

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

  it('accepts new optional detection fields and rejects malformed ones', () => {
    expect(isElementInfo({ ...element, transition: 'opacity 200ms', animation: null })).toBe(true);
    expect(isElementInfo({ ...element, transition: 200 })).toBe(false);
    expect(isElementInfo({ ...element, flexDirection: false })).toBe(false);
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

describe('Phase 2 message guards', () => {
  it('accepts a full snapshot and rejects malformed nested payloads', () => {
    expect(isElementSnapshot(makeSnapshot())).toBe(true);
    expect(isElementSnapshot({ ...makeSnapshot(), boxModel: { measured: {} } })).toBe(false);
    expect(isElementSnapshot({ ...makeSnapshot(), hierarchy: { children: 'none' } })).toBe(false);
    expect(isPanelEvent({ type: MessageType.SnapshotChanged, payload: makeSnapshot() })).toBe(true);
    expect(isPanelEvent({ type: MessageType.SelectionCleared, payload: { reason: 'stopped' } })).toBe(true);
  });

  it('validates snapshot and hierarchy requests', () => {
    expect(isPanelRequest({ type: MessageType.GetSnapshot })).toBe(true);
    expect(isPanelRequest({ type: MessageType.NavigateHierarchy, direction: 'child', index: 2 })).toBe(true);
    expect(isPanelRequest({ type: MessageType.NavigateHierarchy, direction: 'sideways' })).toBe(false);
    expect(isRequestResult({ ok: false, errorCode: 'no-selection' })).toBe(true);
    expect(isInspectionState({ tabId: 4, active: true, lastTabId: 4 })).toBe(true);
  });
});

describe('Phase 3 message guards', () => {
  it('validates motion snapshots and replay actions', () => {
    const snapshot = makeSnapshot();
    expect(isMotionSnapshot(snapshot.motion)).toBe(true);
    expect(isElementSnapshot({ ...snapshot, motion: { ...snapshot.motion, summary: {} } })).toBe(false);
    expect(isMotionReplayAction('isolated-start')).toBe(true);
    expect(isMotionReplayAction('live-restore')).toBe(true);
    expect(isMotionReplayAction('delete-page')).toBe(false);
  });

  it('validates replay requests through the panel contract', () => {
    expect(
      isPanelRequest({
        type: MessageType.ReplayMotion,
        action: 'isolated-start',
        animationId: 'a1',
      }),
    ).toBe(true);
    expect(isPanelRequest({ type: MessageType.ReplayMotion, action: 'unknown' })).toBe(false);
    expect(isPanelRequest({ type: MessageType.ReplayMotion, action: 'live-restart', animationId: 4 })).toBe(false);
  });
});
