import { useMemo } from 'react';
import type { PanelMetrics } from '../hooks/usePanelWidth';

function manifestInfo(): Array<[string, string]> {
  try {
    const manifest = chrome.runtime.getManifest();
    return [
      ['Name', manifest.name],
      ['Version', manifest.version],
      ['Manifest', `V${manifest.manifest_version}`],
      ['Permissions', (manifest.permissions ?? []).join(', ')],
    ];
  } catch {
    return [['Runtime', 'Unavailable outside an extension context']];
  }
}

export function SettingsView({ metrics }: { metrics: PanelMetrics }) {
  const rows = useMemo(manifestInfo, []);
  const padding = metrics.contentPadding;
  const labelWidth = metrics.layout === 'compact' ? 64 : metrics.layout === 'regular' ? 78 : 90;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" style={{ paddingInline: padding, paddingBlock: padding + 4 }}>
      <header className="mb-5">
        <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-accent-bright">
          Extension
        </div>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-fog-100">Settings</h1>
        <p className="mt-1.5 break-anywhere text-[11px] leading-relaxed text-fog-400">
          Runtime details for the installed extension. Inspection data stays in this browser and is
          never transmitted.
        </p>
      </header>

      <section className="overflow-hidden rounded-lg border border-ink-700 bg-ink-850">
        <div className="border-b border-ink-700 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-fog-500">
          Manifest
        </div>
        <dl>
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="grid items-start gap-x-2 border-b border-ink-800 px-3 py-2.5 last:border-0"
              style={{ gridTemplateColumns: `${labelWidth}px minmax(0, 1fr)` }}
            >
              <dt className="truncate text-[11px] text-fog-400" title={label}>
                {label}
              </dt>
              <dd className="min-w-0 break-anywhere text-right font-mono text-[10px] leading-[1.5] text-fog-200">
                {value || '—'}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
