import type { ReactNode } from 'react';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-ink-800 px-7 py-5 last:border-0">
      <h2 className="mb-3.5 font-mono text-[10px] uppercase tracking-[0.16em] text-fog-500">
        {title}
      </h2>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

export function Field({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-5">
      <span className="shrink-0 text-[12px] text-fog-400">{label}</span>
      <span
        className={`min-w-0 truncate text-right text-[12px] text-fog-200 ${mono ? 'font-mono' : ''}`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

export function ColorField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between gap-5">
      <span className="shrink-0 text-[12px] text-fog-400">{label}</span>
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="size-3.5 shrink-0 rounded-[3px] border border-ink-600"
          style={{ background: value ?? 'transparent' }}
        />
        <span className="truncate font-mono text-[11px] text-fog-200" title={value ?? '—'}>
          {value ?? '—'}
        </span>
      </div>
    </div>
  );
}
