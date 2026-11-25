import { useEffect, useMemo, useState } from 'react';
import type { ElementInfo, ElementSnapshot } from '../../shared/types';
import { writeClipboard } from '../clipboard';
import type { PanelMetrics } from '../hooks/usePanelWidth';
import { Icon } from './Icon';
import { buildPromptModel, outputModes, renderPrompt, type OutputMode } from '../prompts';

interface Props {
  element: ElementInfo | null;
  snapshot: ElementSnapshot | null;
  metrics: PanelMetrics;
}

export function AgentPromptsView({ element, snapshot, metrics }: Props) {
  const [mode, setMode] = useState<OutputMode>('react-css');
  const [prompt, setPrompt] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const padding = metrics.contentPadding;
  const compact = metrics.layout === 'compact';

  const generated = useMemo(
    () => (element ? renderPrompt(buildPromptModel(element, snapshot?.motion ?? null), mode) : ''),
    [element, snapshot, mode],
  );

  useEffect(() => {
    setPrompt(generated);
    setCopied(false);
    setError(null);
  }, [generated]);

  const reference = element
    ? [
        ['Tag', element.tag],
        ['ID', element.id],
        ['Classes', element.classes.join(' · ') || null],
        ['Size', `${element.dimensions.width}px × ${element.dimensions.height}px`],
        ['Source', element.sourceUrl],
      ].filter((entry): entry is [string, string] => Boolean(entry[1]))
    : [];

  async function copy() {
    if (!prompt.trim()) return;
    const ok = await writeClipboard(prompt);
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 1800);
    else setError('Clipboard access was denied. Select the prompt text and copy it manually.');
  }

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-ink-950">
      <header
        className="shrink-0 border-b border-ink-700 bg-ink-900"
        style={{ paddingInline: padding, paddingBlock: padding }}
      >
        <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-fog-500">Recreate</div>
        <h1 className="mt-0.5 text-[14px] font-semibold tracking-tight text-fog-100">
          Agent Prompts
        </h1>
        <p className="mt-1 text-[11px] leading-relaxed text-fog-400">
          Turn the selected element into a reusable prompt for your coding agent.
        </p>
      </header>

      {!element ? (
        <div
          className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto text-center"
          style={{ paddingInline: padding, paddingBlock: padding * 2 }}
        >
          <div
            className={`flex shrink-0 items-center justify-center rounded-xl border border-ink-700 bg-ink-850 text-accent-bright ${compact ? 'size-10' : 'size-12'}`}
          >
            <Icon name="sparkles" size={compact ? 20 : 24} />
          </div>
          <h2 className={`mt-4 font-semibold text-fog-100 ${compact ? 'text-base' : 'text-lg'}`}>
            Select an element first
          </h2>
          <p
            className={`mt-2 max-w-[260px] leading-relaxed text-fog-400 ${compact ? 'text-[11px]' : 'text-[12px]'}`}
          >
            Inspect a page, click an element, then return here to generate a prompt from the captured
            values.
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto" style={{ paddingInline: padding, paddingBlock: padding }}>
          <section className="rounded-lg border border-ink-700 bg-ink-850">
            <div className="border-b border-ink-700 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-fog-500">
              Selected reference
            </div>
            <dl className="px-3 py-2">
              {reference.map(([label, value]) => (
                <div
                  key={label}
                  className="grid items-start gap-x-2 py-1"
                  style={{ gridTemplateColumns: `${compact ? 52 : 62}px minmax(0, 1fr)` }}
                >
                  <dt className="text-[10px] text-fog-500">{label}</dt>
                  <dd className="min-w-0 break-anywhere text-right font-mono text-[10px] text-fog-200">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <div className="mt-4">
            <label
              htmlFor="prompt-framework"
              className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.14em] text-fog-500"
            >
              Output format
            </label>
            <select
              id="prompt-framework"
              value={mode}
              onChange={(event) => setMode(event.target.value as OutputMode)}
              className="w-full rounded-md border border-ink-600 bg-ink-850 px-2 py-2 text-[11px] text-fog-100 outline-none focus:border-accent"
            >
              {outputModes.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-fog-500">
                Prompt
              </span>
              <button
                type="button"
                onClick={() => {
                  setPrompt(generated);
                  setCopied(false);
                  setError(null);
                }}
                className="text-[10px] text-fog-400 hover:text-accent-bright"
              >
                Reset text
              </button>
            </div>
            <textarea
              value={prompt}
              onChange={(event) => {
                setPrompt(event.target.value);
                setCopied(false);
              }}
              spellCheck={false}
              aria-label="Generated prompt, editable"
              className="h-64 w-full resize-y rounded-md border border-ink-600 bg-ink-900 p-2.5 font-mono text-[10px] leading-[1.6] text-fog-200 outline-none focus:border-accent"
            />
            <p className="mt-1.5 text-[10px] leading-relaxed text-fog-500">
              Detected values come from the selected element. Suggestions are labelled as inferred.
              Edit freely before copying.
            </p>
          </div>

          {error && (
            <p className="mt-3 text-[11px] leading-relaxed text-red-300" role="alert">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={() => void copy()}
            disabled={!prompt.trim()}
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-[11px] font-medium text-ink-950 transition-colors hover:bg-accent-bright disabled:opacity-40"
          >
            <Icon name={copied ? 'check' : 'copy'} size={14} />
            {copied ? 'Copied prompt' : 'Copy prompt'}
          </button>
        </div>
      )}
    </main>
  );
}
