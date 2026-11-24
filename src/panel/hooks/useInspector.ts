import { useCallback, useEffect, useState } from 'react';
import { MessageType } from '../../shared/messages';
import { getInspectionState, onPanelEvent, sendToBackground } from '../../shared/transport';
import type { ElementInfo, InspectorStatus } from '../../shared/types';
import { serializeCss } from '../../content/css';

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  area.remove();
  return ok;
}

export function useInspector() {
  const [status, setStatus] = useState<InspectorStatus>('idle');
  const [element, setElement] = useState<ElementInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let mounted = true;
    void getInspectionState()
      .then((state) => {
        if (mounted) setStatus(state.active ? 'active' : 'idle');
      })
      .catch(() => {});
    const dispose = onPanelEvent((event) => {
      if (!mounted) return;
      switch (event.type) {
        case MessageType.ElementSelected:
          setElement(event.payload);
          setStatus('idle');
          setCopied(false);
          setError(null);
          break;
        case MessageType.StateChanged:
          setStatus(event.payload.active ? 'active' : 'idle');
          break;
        case MessageType.RuntimeError:
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

  const copyCss = useCallback(async () => {
    if (!element) return false;
    const ok = await writeClipboard(serializeCss(element));
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 1800);
    else setError('Clipboard access was denied.');
    return ok;
  }, [element]);

  return { status, element, error, copied, start, stop, copyCss };
}
