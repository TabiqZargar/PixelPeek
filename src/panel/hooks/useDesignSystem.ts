import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageType } from '../../shared/messages';
import {
  ExtensionRequestError,
  extractDesignSystem,
  onPanelEvent,
} from '../../shared/transport';
import type { DesignSystemSnapshot } from '../../shared/types';
import { writeClipboard } from '../clipboard';

export type DesignSystemStatus = 'idle' | 'loading' | 'ready' | 'error';

const TIMEOUT_MS = 12000;

function makeRequestId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  return random ? `ds-${random}` : `ds-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useDesignSystem() {
  const [snapshot, setSnapshot] = useState<DesignSystemSnapshot | null>(null);
  const [status, setStatus] = useState<DesignSystemStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const pendingRef = useRef<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const clearTimeoutFor = useCallback((requestId: string) => {
    if (pendingRef.current !== requestId) return;
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    pendingRef.current = null;
  }, []);

  const fail = useCallback((requestId: string, message: string, code: string | null) => {
    if (pendingRef.current !== requestId) return;
    clearTimeoutFor(requestId);
    setStatus('error');
    setError(message);
    setErrorCode(code);
  }, [clearTimeoutFor]);

  useEffect(() => {
    let mounted = true;
    const dispose = onPanelEvent((event) => {
      if (!mounted) return;
      if (event.type === MessageType.DesignSystemChanged) {
        const requestId = pendingRef.current;
        if (!requestId || event.payload.requestId !== requestId) return;
        clearTimeoutFor(requestId);
        setSnapshot(event.payload);
        setStatus('ready');
        setError(null);
        setErrorCode(null);
        return;
      }
      if (event.type === MessageType.RuntimeError) {
        const requestId = pendingRef.current;
        if (!requestId) return;
        fail(requestId, event.payload.message, event.payload.code ?? 'design-system-extraction-failed');
      }
    });
    return () => {
      mounted = false;
      dispose();
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    };
  }, [clearTimeoutFor, fail]);

  const extract = useCallback(async () => {
    const requestId = makeRequestId();
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    pendingRef.current = requestId;
    timeoutRef.current = window.setTimeout(() => {
      fail(requestId, 'The design system extraction timed out. Retry on this page.', 'timeout');
    }, TIMEOUT_MS);
    setStatus('loading');
    setError(null);
    setErrorCode(null);
    setCopiedKey(null);
    try {
      await extractDesignSystem(requestId);
    } catch (cause) {
      fail(
        requestId,
        describe(cause),
        cause instanceof ExtensionRequestError ? cause.code : 'design-system-extraction-failed',
      );
    }
  }, [fail]);

  const copyText = useCallback(async (text: string, key = 'export') => {
    const ok = await writeClipboard(text);
    setCopiedKey(ok ? key : null);
    if (ok) window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1600);
    else {
      setError('Clipboard access was denied.');
      setErrorCode('clipboard');
    }
    return ok;
  }, []);

  return {
    snapshot,
    status,
    error,
    errorCode,
    copiedKey,
    extract,
    copyText,
  };
}
