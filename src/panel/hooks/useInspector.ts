import { useCallback, useEffect, useState } from 'react';
import { MessageType } from '../../shared/messages';
import {
  getInspectionState,
  getSnapshot,
  navigateHierarchy,
  onPanelEvent,
  replayMotion,
  sendToBackground,
} from '../../shared/transport';
import type {
  ElementInfo,
  ElementSnapshot,
  HierarchyDirection,
  InspectorStatus,
  MotionReplayAction,
} from '../../shared/types';
import { serializeCss, serializeSnapshotCss } from '../../content/css';
import { writeClipboard } from '../clipboard';

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useInspector() {
  const [status, setStatus] = useState<InspectorStatus>('idle');
  const [element, setElement] = useState<ElementInfo | null>(null);
  const [snapshot, setSnapshot] = useState<ElementSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [replayValid, setReplayValid] = useState(true);

  useEffect(() => {
    let mounted = true;
    void getInspectionState()
      .then((state) => {
        if (mounted) setStatus(state.active ? 'active' : 'idle');
      })
      .catch(() => {});
    void getSnapshot().catch(() => {});
    const dispose = onPanelEvent((event) => {
      if (!mounted) return;
      switch (event.type) {
        case MessageType.ElementSelected:
          setElement(event.payload);
          setStatus('idle');
          setCopiedKey(null);
          setError(null);
          setReplayValid(true);
          break;
        case MessageType.SnapshotChanged:
          setSnapshot(event.payload);
          setElement(event.payload.element);
          setStatus('idle');
          setCopiedKey(null);
          setError(null);
          setReplayValid(true);
          break;
        case MessageType.SelectionCleared:
          setSnapshot(null);
          setElement(null);
          setCopiedKey(null);
          setReplayValid(false);
          break;
        case MessageType.ReplayInvalidated:
          setReplayValid(false);
          break;
        case MessageType.StateChanged:
          setStatus(event.payload.active ? 'active' : 'idle');
          break;
        case MessageType.RuntimeError:
          if (event.payload.source !== 'inspector') break;
          setError(event.payload.message);
          setStatus('error');
          break;
      }
    });
    return () => {
      mounted = false;
      dispose();
    };
  }, []);

  const start = useCallback(async () => {
    setStatus('starting');
    setError(null);
    try {
      await sendToBackground({ type: MessageType.StartInspection });
      setStatus('active');
    } catch (cause) {
      setError(describe(cause));
      setStatus('error');
    }
  }, []);

  const stop = useCallback(async () => {
    setStatus('stopping');
    try {
      await sendToBackground({ type: MessageType.StopInspection });
      setStatus('idle');
    } catch (cause) {
      setError(describe(cause));
      setStatus('error');
    }
  }, []);

  const navigate = useCallback(async (direction: HierarchyDirection, index?: number) => {
    setError(null);
    try {
      await navigateHierarchy(direction, index);
      return true;
    } catch (cause) {
      setError(describe(cause));
      return false;
    }
  }, []);

  const copyText = useCallback(async (text: string, key = 'css') => {
    const ok = await writeClipboard(text);
    setCopiedKey(ok ? key : null);
    if (ok) window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1600);
    else setError('Clipboard access was denied.');
    return ok;
  }, []);

  const replay = useCallback(async (action: MotionReplayAction, animationId?: string) => {
    if (!replayValid) {
      setError('Replay is no longer available for this selection. Capture an element again.');
      return false;
    }
    setError(null);
    try {
      await replayMotion(action, animationId);
      return true;
    } catch (cause) {
      setError(describe(cause));
      return false;
    }
  }, [replayValid]);

  const copyCss = useCallback(async () => {
    if (!element) return false;
    const css = snapshot ? serializeSnapshotCss(snapshot) : serializeCss(element);
    return copyText(css, 'css');
  }, [copyText, element, snapshot]);

  return {
    status,
    element,
    snapshot,
    error,
    copied: copiedKey === 'css',
    copiedKey,
    replayValid,
    start,
    stop,
    navigate,
    replay,
    copyText,
    copyCss,
  };
}
