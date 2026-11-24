import { useMemo } from 'react';

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

export function SettingsView() {
  const rows = useMemo(manifestInfo, []);

  return (
    <div className="mx-auto w-full max-w-[640px] px-7 py-8">
      <header className="mb-7">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent-bright">
          Extension
        </div>
        <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-fog-100">Settings</h1>
        <p className="mt-1.5 text-[12px] leading-relaxed text-fog-400">
          Runtime details for the installed extension. Inspection data stays in this browser and is
          never transmitted.
        </p>
      </header>

      <section className="overflow-hidden rounded-lg border border-ink-700 bg-ink-850">
        <div className="border-b border-ink-700 px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-fog-500">
          Manifest
        </div>
        <dl>
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="flex items-start justify-between gap-6 border-b border-ink-800 px-4 py-3 last:border-0"
            >
              <dt className="text-[12px] text-fog-400">{label}</dt>
              <dd className="max-w-[60%] break-words text-right font-mono text-[11px] text-fog-200">
                {value || '—'}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
