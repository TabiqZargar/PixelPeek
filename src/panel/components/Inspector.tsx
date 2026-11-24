import type { ElementInfo, InspectorStatus } from '../../shared/types';
import type { PanelMetrics } from '../hooks/usePanelWidth';
import { Icon } from './Icon';
import { ColorField, Field, Section } from './Field';

interface Props {
  status: InspectorStatus;
  element: ElementInfo | null;
  error: string | null;
  copied: boolean;
  metrics: PanelMetrics;
  onStart: () => void;
  onStop: () => void;
  onCopyCss: () => void;
}

const statusLabel: Record<InspectorStatus, string> = {
  idle: 'Idle',
  starting: 'Starting',
  active: 'Inspecting',
  stopping: 'Stopping',
  error: 'Error',
};

function labelWidthFor(metrics: PanelMetrics): number {
  if (metrics.layout === 'compact') return 58;
  if (metrics.layout === 'regular') return 70;
  return 80;
}

function EmptyState({ compact, padding }: { compact: boolean; padding: number }) {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto text-center"
      style={{ paddingInline: padding, paddingBlock: padding * 2 }}
    >
      <div
        className={`flex shrink-0 items-center justify-center rounded-xl border border-ink-700 bg-ink-850 text-accent-bright ${
          compact ? 'size-10' : 'size-12'
        }`}
      >
        <Icon name="cursor" size={compact ? 20 : 24} />
      </div>
      <h2 className={`mt-4 font-semibold tracking-tight text-fog-100 ${compact ? 'text-base' : 'text-lg'}`}>
        Inspect any element
      </h2>
      <p
        className={`mt-2 max-w-[260px] leading-relaxed text-fog-400 ${compact ? 'text-[11px]' : 'text-[12px]'}`}
      >
        Start inspection, then click an element on the page to capture its computed design values.
      </p>
      {!compact && (
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-fog-500">
          Escape cancels
        </p>
      )}
    </div>
  );
}

function Geometry({ element }: { element: ElementInfo }) {
  return (
    <div
      className="grid gap-1.5"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(88px, 1fr))' }}
    >
      <div className="min-w-0 rounded-md border border-ink-750 bg-ink-850 px-2.5 py-2">
        <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-fog-500">Width</div>
        <div className="mt-0.5 truncate font-mono text-[13px] tabular-nums text-fog-100" title={`${element.dimensions.width}px`}>
          {element.dimensions.width}px
        </div>
      </div>
      <div className="min-w-0 rounded-md border border-ink-750 bg-ink-850 px-2.5 py-2">
        <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-fog-500">Height</div>
        <div className="mt-0.5 truncate font-mono text-[13px] tabular-nums text-fog-100" title={`${element.dimensions.height}px`}>
          {element.dimensions.height}px
        </div>
      </div>
    </div>
  );
}

function ElementDetails({
  element,
  metrics,
}: {
  element: ElementInfo;
  metrics: PanelMetrics;
}) {
  const labelWidth = labelWidthFor(metrics);
  const compact = metrics.layout === 'compact';
  const padding = metrics.contentPadding;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div
        className="flex min-w-0 items-center gap-2 border-b border-ink-800"
        style={{ paddingInline: padding, paddingBlock: padding + 2 }}
      >
        <span className="shrink-0 rounded border border-accent-dim bg-accent/10 px-1.5 py-0.5 font-mono text-[11px] text-accent-bright">
          {element.tag}
        </span>
        {element.id && (
          <span className="min-w-0 truncate font-mono text-[11px] text-fog-200" title={`#${element.id}`}>
            #{element.id}
          </span>
        )}
      </div>

      <Section title="Element" padding={padding}>
        <Field
          label="Classes"
          value={element.classes.length ? element.classes.join(' · ') : null}
          labelWidth={labelWidth}
          long
        />
      </Section>

      <Section title="Geometry" padding={padding}>
        <Geometry element={element} />
        <div className="pt-1">
          <Field label="Display" value={element.display} labelWidth={labelWidth} />
          <Field label="Position" value={element.position} labelWidth={labelWidth} />
        </div>
      </Section>

      <Section title="Typography" padding={padding}>
        <Field label="Family" value={element.fontFamily} labelWidth={labelWidth} long />
        <Field label="Size" value={element.fontSize} labelWidth={labelWidth} numeric />
        <Field label="Weight" value={element.fontWeight} labelWidth={labelWidth} numeric />
      </Section>

      <Section title="Spacing" padding={padding}>
        <Field label="Padding" value={element.padding} labelWidth={labelWidth} long />
        <Field label="Margin" value={element.margin} labelWidth={labelWidth} long />
      </Section>

      <Section title="Surface" padding={padding}>
        <ColorField label="Background" value={element.backgroundColor} labelWidth={labelWidth} />
        <ColorField label="Text" value={element.color} labelWidth={labelWidth} />
        <Field label="Radius" value={element.borderRadius} labelWidth={labelWidth} long />
        <Field label="Shadow" value={element.boxShadow} labelWidth={labelWidth} long />
      </Section>

      {!compact && (
        <div
          className="pb-4 pt-1 font-mono text-[9px] leading-relaxed text-fog-500"
          style={{ paddingInline: padding }}
          title={element.capturedAt}
        >
          Captured {new Date(element.capturedAt).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

export function Inspector({
  status,
  element,
  error,
  copied,
  metrics,
  onStart,
  onStop,
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

      {element ? (
        <ElementDetails element={element} metrics={metrics} />
      ) : (
        <EmptyState compact={compact} padding={padding} />
      )}

      <div
        className="shrink-0 border-t border-ink-700 bg-ink-900"
        style={{ paddingInline: padding, paddingBlock: compact ? 8 : 12 }}
      >
        <button
          type="button"
          onClick={onCopyCss}
          disabled={!element}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-ink-600 bg-ink-850 px-3 py-2 text-[11px] font-medium text-fog-200 transition-colors hover:border-accent-dim hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon name={copied ? 'check' : 'copy'} size={14} />
          {copied ? 'Copied CSS' : 'Copy CSS'}
        </button>
      </div>
    </main>
  );
}
