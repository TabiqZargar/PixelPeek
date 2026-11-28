import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageType, isWebsiteBlueprint, type ContentEvent } from '../../shared/messages';
import {
  type ActiveTabInfo,
  ExtensionRequestError,
  extractWebsiteBlueprint,
  getActiveTabInfo,
  onActiveTabChanged,
  onPanelEvent,
} from '../../shared/transport';
import type { WebsiteBlueprint } from '../../shared/types';
import { writeClipboard } from '../clipboard';

export type WebsiteBlueprintStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ExportFeedback {
  kind: 'success' | 'error';
  message: string;
}

const TIMEOUT_MS = 12000;

interface BlueprintOwner {
  requestId: string;
  tab: ActiveTabInfo;
}

function makeRequestId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  return random ? `bp-${random}` : `bp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sameOwner(left: ActiveTabInfo | null, right: ActiveTabInfo | null): boolean {
  return (
    left !== null &&
    right !== null &&
    left.tabId !== null &&
    left.tabId === right.tabId &&
    left.origin === right.origin &&
    left.url === right.url
  );
}

function fileSafe(value: string): string {
  return value.replace(/[^a-z0-9.-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'page';
}

export function useWebsiteBlueprint() {
  const [blueprint, setBlueprint] = useState<WebsiteBlueprint | null>(null);
  const [status, setStatus] = useState<WebsiteBlueprintStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [exportFeedback, setExportFeedback] = useState<ExportFeedback | null>(null);
  const blueprintRef = useRef<WebsiteBlueprint | null>(null);
  const pendingRef = useRef<string | null>(null);
  const ownerRef = useRef<BlueprintOwner | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const updateBlueprint = useCallback((next: WebsiteBlueprint | null) => {
    blueprintRef.current = next;
    setBlueprint(next);
  }, []);

  const clearPending = useCallback((requestId: string) => {
    if (pendingRef.current !== requestId) return;
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    pendingRef.current = null;
  }, []);

  const fail = useCallback((requestId: string, message: string, code: string | null) => {
    if (pendingRef.current !== requestId) return;
    clearPending(requestId);
    if (ownerRef.current?.requestId === requestId) ownerRef.current = null;
    updateBlueprint(null);
    setStatus('error');
    setError(message);
    setErrorCode(code);
    setCopiedKey(null);
    setExportFeedback(null);
  }, [clearPending, updateBlueprint]);

  const invalidate = useCallback((requestId: string, message: string | null) => {
    const ownsPending = pendingRef.current === requestId;
    const ownsReady = ownerRef.current?.requestId === requestId;
    if (!ownsPending && !ownsReady) return;
    if (pendingRef.current !== null && !ownsPending) return;
    if (ownsPending) {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      pendingRef.current = null;
    }
    if (ownsReady) ownerRef.current = null;
    updateBlueprint(null);
    setStatus(message ? 'error' : 'idle');
    setError(message);
    setErrorCode(message ? 'stale-page' : null);
    setCopiedKey(null);
    setExportFeedback(null);
  }, [updateBlueprint]);

  useEffect(() => {
    let mounted = true;

    const handleEvent = (event: ContentEvent) => {
      const requestId = pendingRef.current;
      if (!requestId) return;
      const owner = ownerRef.current;
      if (!owner || owner.requestId !== requestId) return;

      const verifyOwner = async (): Promise<boolean> => {
        try {
          const current = await getActiveTabInfo();
          if (!mounted) return false;
          if (!sameOwner(owner.tab, current)) {
            invalidate(requestId, 'The active page changed, so the blueprint was cleared.');
            return false;
          }
          return true;
        } catch {
          if (mounted) invalidate(requestId, 'Could not verify the active page. Retry capture.');
          return false;
        }
      };

      if (event.type === MessageType.BlueprintChanged) {
        if (event.payload.metadata.requestId !== requestId) return;
        if (event.payload.metadata.origin !== owner.tab.origin) return;
        if (!isWebsiteBlueprint(event.payload)) return;
        void verifyOwner().then((owned) => {
          if (!owned || pendingRef.current !== requestId || ownerRef.current?.requestId !== requestId || !mounted) return;
          clearPending(requestId);
          updateBlueprint(event.payload);
          setStatus('ready');
          setError(null);
          setErrorCode(null);
          setCopiedKey(null);
          setExportFeedback(null);
        });
        return;
      }

      if (event.type === MessageType.RuntimeError && event.payload.source === 'website-blueprint') {
        if (event.payload.requestId !== requestId) return;
        void verifyOwner().then((owned) => {
          if (!owned || pendingRef.current !== requestId || ownerRef.current?.requestId !== requestId || !mounted) return;
          fail(requestId, event.payload.message, event.payload.code ?? 'website-blueprint-extraction-failed');
        });
      }
    };

    const disposeEvents = onPanelEvent(handleEvent);
    const disposeTabs = onActiveTabChanged(() => {
      const requestId = pendingRef.current ?? ownerRef.current?.requestId;
      if (!mounted || !requestId) return;
      void getActiveTabInfo()
        .then((current) => {
          const owner = ownerRef.current;
          if (!mounted) return;
          if (owner && owner.requestId !== requestId) return;
          if (owner && sameOwner(owner.tab, current)) return;
          invalidate(requestId, 'The active page changed, so the blueprint was cleared.');
        })
        .catch(() => undefined);
    });

    return () => {
      mounted = false;
      disposeEvents();
      disposeTabs();
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      pendingRef.current = null;
      ownerRef.current = null;
    };
  }, [clearPending, fail, invalidate, updateBlueprint]);

  const extract = useCallback(async () => {
    if (pendingRef.current !== null) return false;
    const requestId = makeRequestId();
    pendingRef.current = requestId;
    ownerRef.current = null;
    timeoutRef.current = window.setTimeout(() => {
      fail(requestId, 'The website blueprint capture timed out. Retry on this page.', 'timeout');
    }, TIMEOUT_MS);
    setStatus('loading');
    setError(null);
    setErrorCode(null);
    setCopiedKey(null);
    setExportFeedback(null);

    try {
      const target = await getActiveTabInfo();
      if (target.tabId === null) {
        throw new ExtensionRequestError('There is no active tab to inspect.', 'no-active-tab');
      }
      if (pendingRef.current !== requestId) return false;
      ownerRef.current = { requestId, tab: target };
      const result = await extractWebsiteBlueprint(requestId);
      if (!result.ok) {
        throw new ExtensionRequestError(
          result.error ?? 'The website blueprint request could not be started.',
          result.errorCode,
        );
      }
      if (pendingRef.current !== requestId) return false;
      const confirmed = await getActiveTabInfo();
      if (!sameOwner(target, confirmed)) {
        throw new ExtensionRequestError('The active page changed before capture started. Retry on the same page.', 'stale-page');
      }
      if (pendingRef.current !== requestId) return false;
      ownerRef.current = { requestId, tab: confirmed };
      return true;
    } catch (cause) {
      fail(
        requestId,
        describe(cause),
        cause instanceof ExtensionRequestError ? cause.code : 'website-blueprint-extraction-failed',
      );
      return false;
    }
  }, [fail]);

  const copyJson = useCallback(async () => {
    const current = blueprintRef.current;
    if (!current || !isWebsiteBlueprint(current)) {
      setExportFeedback({ kind: 'error', message: 'There is no validated blueprint to copy.' });
      return false;
    }
    const ok = await writeClipboard(JSON.stringify(current, null, 2));
    setCopiedKey(ok ? 'blueprint-json' : null);
    setExportFeedback({
      kind: ok ? 'success' : 'error',
      message: ok ? 'Blueprint JSON copied.' : 'Clipboard access was denied.',
    });
    if (ok) {
      window.setTimeout(() => setCopiedKey((key) => (key === 'blueprint-json' ? null : key)), 1600);
    }
    return ok;
  }, []);

  const downloadJson = useCallback(async () => {
    const current = blueprintRef.current;
    if (!current || !isWebsiteBlueprint(current)) {
      setExportFeedback({ kind: 'error', message: 'There is no validated blueprint to download.' });
      return false;
    }
    try {
      const json = JSON.stringify(current, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `pixelpeek-blueprint-${fileSafe(ownerRef.current?.tab.origin ?? current.metadata.origin)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      setExportFeedback({ kind: 'success', message: 'Blueprint JSON downloaded.' });
      return true;
    } catch {
      setExportFeedback({ kind: 'error', message: 'Download could not be started.' });
      return false;
    }
  }, []);

  return {
    blueprint,
    status,
    error,
    errorCode,
    copiedKey,
    exportFeedback,
    extract,
    copyJson,
    downloadJson,
  };
}
