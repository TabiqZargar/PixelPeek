import { Icon } from './Icon';
import { ColorField, Field, Section } from './Field';
import type { ElementInfo, InspectorStatus } from '../../shared/types';

interface Props {
  status: InspectorStatus;
  element: ElementInfo | null;
  error: string | null;
  copied: boolean;
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

function EmptyState({ status }: { status: InspectorStatus }) {
  const active = status === 'active' || status === 'starting';
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-10 pb-16 text-center">
      <div
        className={`mb-5 flex size-12 items-center justify-center rounded-lg border ${
          active
            ? 'border-accent/60 bg-accent/10 text-accent-bright'
            : 'border-ink-700 bg-ink-850 text-fog-500'
        }`}
      >
        <Icon name={active ? 'crosshair' : 'cursor'} size={22} />
      </div>
      <h2 className="text-[14px] font-medium text-fog-200">
        {active ? 'Inspector is live' : 'Nothing selected yet'}
      </h2>
      <p className="mt-2 max-w-[280px] text-[12px] leading-relaxed text-fog-500">
        {active
          ? 'Move over the page to highlight an element, then click to capture its design. Press Esc to cancel.'
          : 'Start inspection, then click any element on the current page to read its computed styles.'}
      </p>
    </div>
  );
}

function ElementDetails({ element }: { element: ElementInfo }) {
  return (
    <>
      <Section title="Element">
        <div className="mb-3 flex items-center justify-between gap-4 rounded-md border border-ink-700 bg-ink-800 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[13px] text-accent-bright">&lt;{element.tag}&gt;</span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-fog-500">Selected</span>
        </div>
        <Field label="ID" value={element.id ?? '—'} />
        <Field
          label="Classes"
          value={element.classes.length ? element.classes.join(' · ') : '—'}
        />
      </Section>

      <Section title="Geometry">
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-md border border-ink-700 bg-ink-800 px-3 py-2.5">
            <div className="font-mono text-[9px] uppercase tracking-wider text-fog-500">Width</div>
            <div className="mt-1 font-mono text-[15px] text-fog-100">{element.dimensions.width}px</div>
          </div>
          <div className="rounded-md border border-ink-700 bg-ink-800 px-3 py-2.5">
            <div className="font-mono text-[9px] uppercase tracking-wider text-fog-500">Height</div>
            <div className="mt-1 font-mono text-[15px] text-fog-100">{element.dimensions.height}px</div>
          </div>
        </div>
      </Section>

      <Section title="Colour">
        <ColorField label="Background" value={element.backgroundColor} />
        <ColorField label="Text" value={element.color} />
      </Section>

      <Section title="Typography">
        <Field label="Family" value={element.fontFamily ?? '—'} />
        <Field label="Size" value={element.fontSize ?? '—'} />
        <Field label="Weight" value={element.fontWeight ?? '—'} />
      </Section>

      <Section title="Spacing">
        <Field label="Padding" value={element.padding ?? '—'} />
        <Field label="Margin" value={element.margin ?? '—'} />
      </Section>

      <Section title="Surface">
        <Field label="Radius" value={element.borderRadius ?? '—'} />
        <Field label="Shadow" value={element.boxShadow ?? '—'} />
        <Field label="Display" value={element.display ?? '—'} />
        <Field label="Position" value={element.position ?? '—'} />
      </Section>
    </>
  );
}

export function Inspector({
  status,
  element,
  error,
  copied,
  onStart,
  onStop,
  onCopyCss,
}: Props) {
  const active = status === 'active' || status === 'starting';
  const busy = status === 'starting' || status === 'stopping';

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-ink-700 px-7">
        <div className="flex items-center gap-3">
          <h1 className="text-[13px] font-semibold tracking-tight text-fog-100">Inspector</h1>
          <span
            className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
              active
                ? 'border-accent/40 bg-accent/10 text-accent-bright'
                : status === 'error'
                  ? 'border-red-500/30 bg-red-500/10 text-red-300'
                  : 'border-ink-700 bg-ink-850 text-fog-500'
            }`}
          >
            <span
              className={`size-1.5 rounded-full ${
                active ? 'bg-accent' : status === 'error' ? 'bg-red-400' : 'bg-fog-500'
              }`}
            />
            {statusLabel[status]}
          </span>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={active ? onStop : onStart}
          className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50 ${
            active
              ? 'border-ink-600 bg-ink-800 text-fog-200 hover:border-fog-500 hover:text-fog-100'
              : 'border-accent bg-accent text-white hover:bg-accent-bright'
          }`}
        >
          <Icon name={active ? 'square' : 'crosshair'} size={13} />
          {active ? 'Stop inspection' : 'Start inspection'}
        </button>
      </header>

      {error && (
        <div className="mx-7 mt-4 rounded-md border border-red-500/25 bg-red-500/8 px-3 py-2 text-[11px] text-red-200">
          {error}
        </div>
      )}

      {element ? (
        <div className="flex-1 overflow-y-auto">
          <ElementDetails element={element} />
          <div className="sticky bottom-0 border-t border-ink-700 bg-ink-900/95 px-7 py-4 backdrop-blur-sm">
            <button
              type="button"
              onClick={onCopyCss}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-ink-600 bg-ink-800 px-3 py-2 text-[12px] font-medium text-fog-100 transition-colors hover:border-accent hover:bg-ink-750"
            >
              <Icon name={copied ? 'check' : 'copy'} size={14} />
              {copied ? 'CSS copied' : 'Copy CSS'}
            </button>
          </div>
        </div>
      ) : (
        <EmptyState status={status} />
      )}
    </div>
  );
}
