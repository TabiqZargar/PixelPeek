import type { ElementInfo, ElementSnapshot, HierarchyDirection, InspectorStatus } from '../../shared/types';
import type { PanelMetrics } from '../hooks/usePanelWidth';
import { Icon } from './Icon';
import { InspectorDetails } from './InspectorDetails';

interface Props {
  status: InspectorStatus;
  element: ElementInfo | null;
  snapshot: ElementSnapshot | null;
  error: string | null;
  copied: boolean;
  copiedKey: string | null;
  metrics: PanelMetrics;
  onStart: () => void;
  onStop: () => void;
  onNavigate: (direction: HierarchyDirection, index?: number) => void;
  onCopyText: (text: string, key?: string) => void;
  onCopyCss: () => void;
}

const statusLabel: Record<InspectorStatus, string> = {
  idle: 'Idle',
  starting: 'Starting',
  active: 'Inspecting',
  stopping: 'Stopping',
  error: 'Error',
};

export function Inspector({
  status,
  element,
  snapshot,
  error,
  copied,
  copiedKey,
  metrics,
  onStart,
  onStop,
  onNavigate,
  onCopyText,
  onCopyCss,
}: Props) {
  const compact = metrics.layout === 'compact';
  const padding = metrics.contentPadding;
  const active = status === 'active';
  const busy = status === 'starting' || status === 'stopping';

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-ink-950">
      <header
        className="flex shrink-0 items-center gap-2 border-b border-ink-700 bg-ink-900"
        style={{ paddingInline: padding, height: compact ? 48 : 56 }}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-[9px] uppercase tracking-[0.16em] text-fog-500">
            PixelPeek
          </div>
          <h1 className="truncate text-[14px] font-semibold tracking-tight text-fog-100">
            Inspector
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide ${
              active
                ? 'border-accent-dim bg-accent/10 text-accent-bright'
                : 'border-ink-700 bg-ink-850 text-fog-500'
            }`}
          >
            <span className={`size-1 rounded-full ${active ? 'bg-accent' : 'bg-fog-500'}`} />
            {compact ? (active ? 'Live' : statusLabel[status]) : statusLabel[status]}
          </span>
          <button
            type="button"
            onClick={active ? onStop : onStart}
            disabled={busy}
            aria-label={active ? 'Stop inspection' : 'Start inspection'}
            className={`shrink-0 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50 ${
              active
                ? 'border border-ink-600 bg-ink-800 text-fog-200 hover:bg-ink-750'
                : 'bg-accent text-ink-950 hover:bg-accent-bright'
            }`}
          >
            {active ? (compact ? 'Stop' : 'Stop inspection') : compact ? 'Start' : 'Start inspection'}
          </button>
        </div>
      </header>

      {error && (
        <div
          className="shrink-0 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-red-200"
          style={{ marginInline: padding, marginTop: padding }}
          role="alert"
        >
          {error}
        </div>
      )}

      <InspectorDetails
        status={status}
        snapshot={snapshot}
        metrics={metrics}
        copiedKey={copiedKey}
        onNavigate={onNavigate}
        onCopyText={onCopyText}
      />

      <div
        className="shrink-0 border-t border-ink-700 bg-ink-900"
        style={{ paddingInline: padding, paddingBlock: compact ? 8 : 12 }}
      >
        <button
          type="button"
          onClick={onCopyCss}
          disabled={!snapshot && !element}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-ink-600 bg-ink-850 px-3 py-2 text-[11px] font-medium text-fog-200 transition-colors hover:border-accent-dim hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon name={copied ? 'check' : 'copy'} size={14} />
          {copied ? 'Copied CSS' : 'Copy CSS'}
        </button>
      </div>
    </main>
  );
}
