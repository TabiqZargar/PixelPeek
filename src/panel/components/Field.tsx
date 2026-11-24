import type { ReactNode } from 'react';

interface SectionProps {
  title: string;
  padding: number;
  children: ReactNode;
}

export function Section({ title, padding, children }: SectionProps) {
  return (
    <section
      className="border-b border-ink-800 last:border-0"
      style={{ paddingInline: padding, paddingBlock: padding + 2 }}
    >
      <h2 className="mb-3 font-mono text-[9px] uppercase tracking-[0.14em] text-fog-500">
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

interface FieldProps {
  label: string;
  value: string | null;
  labelWidth: number;
  long?: boolean;
  numeric?: boolean;
}

function Row({
  label,
  labelWidth,
  children,
}: {
  label: string;
  labelWidth: number;
  children: ReactNode;
}) {
  return (
    <div
      className="grid items-start gap-x-2"
      style={{ gridTemplateColumns: `${labelWidth}px minmax(0, 1fr)` }}
    >
      <span className="truncate pt-px text-[11px] leading-[1.5] text-fog-400" title={label}>
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Field({ label, value, labelWidth, long = false, numeric = false }: FieldProps) {
  const text = value?.trim() || '—';
  return (
    <Row label={label} labelWidth={labelWidth}>
      <span
        className={`block min-w-0 break-anywhere text-[11px] leading-[1.5] text-fog-200 ${
          long ? 'text-left' : 'text-right tabular-nums'
        } ${numeric ? 'font-mono' : ''}`}
        title={text}
      >
        {text}
      </span>
    </Row>
  );
}

export function ColorField({
  label,
  value,
  labelWidth,
}: {
  label: string;
  value: string | null;
  labelWidth: number;
}) {
  const text = value?.trim() || '—';
  return (
    <Row label={label} labelWidth={labelWidth}>
      <div className="flex min-w-0 items-center justify-end gap-1.5">
        <span
          className="size-3 shrink-0 rounded-[3px] border border-ink-600"
          style={{ background: value ?? 'transparent' }}
        />
        <span className="min-w-0 truncate font-mono text-[10px] leading-[1.5] text-fog-200" title={text}>
          {text}
        </span>
      </div>
    </Row>
  );
}
