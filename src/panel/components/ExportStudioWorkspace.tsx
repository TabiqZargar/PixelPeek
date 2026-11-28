import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { serializeBlueprintAgentPrompt } from '../exports/agent-prompt';
import { serializeDesignTokensCss } from '../exports/design-tokens';
import {
  serializeBlueprintJson,
  serializeComponentInventory,
  serializeImplementationBrief,
  serializeLayoutSpecification,
} from '../exports/serialize';
import { EXPORT_FORMATS, type ExportId, type ExportResult } from '../exports/types';
import type { WebsiteBlueprintStatus } from '../hooks/useWebsiteBlueprint';
import type { PanelMetrics } from '../hooks/usePanelWidth';
import { isWebsiteBlueprint } from '../../shared/messages';
import type { WebsiteBlueprint } from '../../shared/types';
import { writeClipboard } from '../clipboard';
import { downloadText } from '../download';
import { Field, Section } from './Field';
import { Icon } from './Icon';

interface Props {
  blueprint: WebsiteBlueprint | null;
  status: WebsiteBlueprintStatus;
  error: string | null;
  errorCode: string | null;
  metrics: PanelMetrics;
  onOpenWebsiteBlueprint: () => void;
}

interface Feedback {
  kind: 'success' | 'error';
  message: string;
}

type Serializer = (blueprint: unknown) => ExportResult;

const FORMAT_IDS: ExportId[] = [
  'blueprint-json',
  'implementation-brief',
  'design-tokens-css',
  'component-inventory',
  'layout-specification',
  'blueprint-agent-prompt',
];

const COMPACT_LABELS: Readonly<Record<ExportId, string>> = {
  'blueprint-json': 'JSON',
  'implementation-brief': 'Brief',
  'design-tokens-css': 'Tokens',
  'component-inventory': 'Comp',
  'layout-specification': 'Layout',
  'blueprint-agent-prompt': 'Prompt',
};

const SERIALIZERS: Readonly<Record<ExportId, Serializer>> = {
  'blueprint-json': serializeBlueprintJson,
  'implementation-brief': serializeImplementationBrief,
  'design-tokens-css': serializeDesignTokensCss,
  'component-inventory': serializeComponentInventory,
  'layout-specification': serializeLayoutSpecification,
  'blueprint-agent-prompt': serializeBlueprintAgentPrompt,
};

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-md border border-accent-dim/60 bg-accent/8 p-2 text-[11px] leading-relaxed text-fog-300">
      {children}
    </div>
  );
}

function ErrorBanner({ error, errorCode }: { error: string; errorCode: string | null }) {
  const guidance =
    errorCode === 'unsupported-url'
      ? 'Open a regular http(s) page, then generate a blueprint again.'
      : errorCode === 'injection-failed' || errorCode === 'content-unreachable'
        ? 'Open PixelPeek from the toolbar on this tab, then retry.'
        : errorCode === 'stale-page' || errorCode === 'timeout'
          ? 'Stay on the same page and regenerate the blueprint.'
          : 'Regenerate the blueprint on the same page.';
  return (
    <div
      role="alert"
      className="mx-3 mt-3 shrink-0 rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-[11px] leading-relaxed text-red-200"
    >
      <div className="font-semibold">Blueprint capture failed</div>
      <div className="mt-1 break-anywhere">{error}</div>
      <div className="mt-1 text-red-300/80">{guidance}</div>
    </div>
  );
}

function availabilityNotes(blueprint: WebsiteBlueprint): string[] {
  const unavailableGroups = [
    ['Blueprint', blueprint.evidence.unavailable],
    ['Structure', blueprint.structure.unavailable],
    ['Components', blueprint.components.flatMap((item) => item.unavailable)],
    ['Layout', blueprint.layout.flatMap((item) => item.unavailable)],
    ['Design system', blueprint.designSystem.unavailable],
    ['Motion', blueprint.motion.unavailable],
    ['Responsive', blueprint.responsive.unavailable],
    ['Visual references', blueprint.visualReferences.flatMap((item) => item.unavailable)],
  ] as const;
  const limitationGroups = [
    ['Blueprint', blueprint.evidence.limitations],
    ['Structure', blueprint.structure.limitations],
    ['Components', blueprint.components.flatMap((item) => item.limitations)],
    ['Layout', blueprint.layout.flatMap((item) => item.limitations)],
    ['Design system', blueprint.designSystem.limitations],
    ['Motion', blueprint.motion.limitations],
    ['Responsive', blueprint.responsive.limitations],
    ['Visual references', blueprint.visualReferences.flatMap((item) => item.limitations)],
  ] as const;
  return [
    ...unavailableGroups.flatMap(([label, notes]) => notes.map((note) => `Unavailable · ${label}: ${note}`)),
    ...limitationGroups.flatMap(([label, notes]) => notes.map((note) => `Limitation · ${label}: ${note}`)),
  ];
}

function NoteList({ title, notes }: { title: string; notes: readonly string[] }) {
  return (
    <div className="min-w-0 rounded-md border border-ink-750 bg-ink-850 p-2">
      <div className="font-mono text-[9px] uppercase tracking-wide text-fog-400">{title}</div>
      {notes.length === 0 ? (
        <div className="mt-1 text-[10px] text-fog-500">None reported in the validated blueprint.</div>
      ) : (
        <ul className="mt-1 space-y-1">
          {notes.map((note, index) => (
            <li key={`${note}-${index}`} className="min-w-0 break-anywhere font-mono text-[10px] text-fog-300">
              {note}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProvenancePanel({ blueprint, padding, labelWidth }: { blueprint: WebsiteBlueprint; padding: number; labelWidth: number }) {
  const { metadata } = blueprint;
  const truncation = metadata.truncation.truncated
    ? `Truncated · reasons: ${metadata.truncation.reasons.join(', ') || 'none reported'} · limits: ${metadata.truncation.limitsReached.join(', ') || 'none reported'}`
    : 'Not truncated';
  return (
    <Section title="Provenance" padding={padding}>
      <Field label="Origin" value={metadata.origin} labelWidth={labelWidth} long />
      <Field label="Captured" value={metadata.capturedAt} labelWidth={labelWidth} long numeric />
      <Field label="Schema" value={metadata.schemaVersion} labelWidth={labelWidth} numeric />
      <Field label="Status" value={metadata.status} labelWidth={labelWidth} />
      <Field label="Viewport" value={`${metadata.viewport.width} × ${metadata.viewport.height} @ ${metadata.viewport.devicePixelRatio}x`} labelWidth={labelWidth} long numeric />
      <Field label="Refs" value={String(blueprint.refs.length)} labelWidth={labelWidth} numeric />
      <Field label="Truncation" value={truncation} labelWidth={labelWidth} long />
    </Section>
  );
}

function ScopePanel({
  blueprint,
  warnings,
  padding,
}: {
  blueprint: WebsiteBlueprint;
  warnings: readonly string[];
  padding: number;
}) {
  return (
    <Section title="Scope and warnings" padding={padding}>
      <Notice>Only the captured viewport was observed; responsive behaviour outside it remains unknown.</Notice>
      <Notice>Token names are inferred suggestions with detected values. Verify them against the source before use.</Notice>
      <Notice>
        The blueprint excludes page text, form values, screenshots and arbitrary source content. These outputs are
        partial observations, not a complete or pixel-perfect website specification.
      </Notice>
      <NoteList title="Missing observations and limitations" notes={availabilityNotes(blueprint)} />
      <NoteList title="Export warnings" notes={warnings} />
    </Section>
  );
}

function Placeholder({
  status,
  compact,
  padding,
  onOpenWebsiteBlueprint,
}: {
  status: WebsiteBlueprintStatus;
  compact: boolean;
  padding: number;
  onOpenWebsiteBlueprint: () => void;
}) {
  const loading = status === 'loading';
  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center text-center"
      style={{ paddingInline: padding, paddingBlock: padding * 2 }}
    >
      <div className={`flex shrink-0 items-center justify-center rounded-xl border border-ink-700 bg-ink-850 text-accent-bright ${compact ? 'size-10' : 'size-12'}`}>
        <Icon name="copy" size={compact ? 20 : 24} />
      </div>
      <h2 className={`mt-4 font-semibold tracking-tight text-fog-100 ${compact ? 'text-base' : 'text-lg'}`}>
        {loading ? 'Capturing website blueprint…' : 'No validated blueprint yet'}
      </h2>
      <p className={`mt-2 max-w-[320px] leading-relaxed text-fog-400 ${compact ? 'text-[11px]' : 'text-[12px]'}`}>
        {loading
          ? 'Export Studio will become available when the captured blueprint has been validated.'
          : 'Generate a Website Blueprint first. Exports use only the validated capture from the current page.'}
      </p>
      {!loading && (
        <button
          type="button"
          aria-label="Open Website Blueprint"
          onClick={onOpenWebsiteBlueprint}
          className="mt-4 shrink-0 rounded-md border border-accent-dim bg-accent/10 px-3 py-1.5 text-[11px] text-accent-bright transition-colors hover:bg-accent/15"
        >
          Open Website Blueprint
        </button>
      )}
    </div>
  );
}

export function ExportStudioWorkspace({
  blueprint,
  status,
  error,
  errorCode,
  metrics,
  onOpenWebsiteBlueprint,
}: Props) {
  const [selectedId, setSelectedId] = useState<ExportId>('blueprint-json');
  const [copiedId, setCopiedId] = useState<ExportId | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const compact = metrics.layout === 'compact';
  const padding = metrics.contentPadding;
  const labelWidth = compact ? 92 : 112;

  const captureReady = status === 'ready';
  const validBlueprint = useMemo(
    () => (captureReady && blueprint && isWebsiteBlueprint(blueprint) ? blueprint : null),
    [blueprint, captureReady],
  );

  const exportState = useMemo<{ result: ExportResult | null; error: string | null }>(() => {
    if (!validBlueprint) return { result: null, error: null };
    try {
      return { result: SERIALIZERS[selectedId](validBlueprint), error: null };
    } catch (cause) {
      return { result: null, error: cause instanceof Error ? cause.message : String(cause) };
    }
  }, [selectedId, validBlueprint]);

  const format = EXPORT_FORMATS[selectedId];
  const result = exportState.result;
  const sourceRef = useRef({ selectedId, blueprint: validBlueprint, result });
  sourceRef.current = { selectedId, blueprint: validBlueprint, result };
  const copyGenerationRef = useRef(0);

  useEffect(() => {
    copyGenerationRef.current += 1;
    setCopiedId(null);
    setFeedback(null);
  }, [selectedId, validBlueprint]);

  useEffect(() => () => {
    copyGenerationRef.current += 1;
  }, []);

  const copy = async () => {
    const current = result;
    if (!current) {
      setFeedback({ kind: 'error', message: 'There is no validated export to copy.' });
      return;
    }
    const generation = ++copyGenerationRef.current;
    const source = { selectedId, blueprint: validBlueprint, result: current };
    const ok = await writeClipboard(current.content);
    const latest = sourceRef.current;
    if (
      generation !== copyGenerationRef.current ||
      latest.selectedId !== source.selectedId ||
      latest.blueprint !== source.blueprint ||
      latest.result !== source.result
    ) {
      return;
    }
    setCopiedId(ok ? current.id : null);
    setFeedback({
      kind: ok ? 'success' : 'error',
      message: ok ? `${format.title} copied.` : 'Clipboard access was denied.',
    });
    if (ok) {
      window.setTimeout(() => {
        if (generation !== copyGenerationRef.current || sourceRef.current.result !== current) return;
        setCopiedId((id) => (id === current.id ? null : id));
      }, 1600);
    }
  };

  const download = () => {
    const current = result;
    if (!current) {
      setFeedback({ kind: 'error', message: 'There is no validated export to download.' });
      return;
    }
    const ok = downloadText(current.filename, current.mimeType, current.content);
    setFeedback({
      kind: ok ? 'success' : 'error',
      message: ok ? `${format.title} downloaded.` : 'Download could not be started.',
    });
  };

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-ink-950">
      <header
        className="shrink-0 border-b border-ink-700 bg-ink-900"
        style={{ paddingInline: padding, paddingBlock: compact ? 10 : 14 }}
      >
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-fog-500">Workspace</div>
            <h1 className="mt-0.5 text-[14px] font-semibold tracking-tight text-fog-100">Export Studio</h1>
            <p className="mt-1 text-[11px] leading-relaxed text-fog-400">
              Generate deterministic outputs from the validated Website Blueprint.
            </p>
          </div>
          {status === 'loading' && (
            <span role="status" className="shrink-0 font-mono text-[9px] uppercase tracking-wide text-accent-bright">
              Capturing…
            </span>
          )}
        </div>
      </header>

      {error && <ErrorBanner error={error} errorCode={errorCode} />}

      <div
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-ink-800 px-2 py-1.5"
        role="tablist"
        aria-label="Export format"
      >
        {FORMAT_IDS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-label={EXPORT_FORMATS[id].title}
            aria-selected={selectedId === id}
            title={EXPORT_FORMATS[id].title}
            onClick={() => setSelectedId(id)}
            className={`shrink-0 rounded px-2 py-1 font-mono text-[10px] transition-colors ${
              selectedId === id
                ? 'bg-accent/12 text-accent-bright'
                : 'text-fog-500 hover:bg-ink-850 hover:text-fog-200'
            }`}
          >
            {compact ? COMPACT_LABELS[id] : EXPORT_FORMATS[id].title}
          </button>
        ))}
      </div>

      {!validBlueprint ? (
        <Placeholder
          status={status}
          compact={compact}
          padding={padding}
          onOpenWebsiteBlueprint={onOpenWebsiteBlueprint}
        />
      ) : (
        <div
          className="min-h-0 min-w-0 flex-1 overflow-y-auto"
          style={{ paddingInline: padding, paddingBlock: padding + 4 }}
        >
          <div className="space-y-3">
            <div className="min-w-0 rounded-md border border-ink-750 bg-ink-850 p-2">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-semibold text-fog-100">{format.title}</div>
                  <div className="break-anywhere text-[10px] text-fog-500">
                    {format.label} · {result?.charCount.toLocaleString() ?? '0'} characters · {result?.filename ?? format.filename}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    aria-label={`Copy ${format.title}`}
                    disabled={!result}
                    onClick={() => void copy()}
                    className="shrink-0 rounded border border-ink-700 p-1 text-fog-500 transition-colors hover:border-accent-dim hover:text-accent-bright disabled:opacity-50"
                  >
                    <Icon name={copiedId === result?.id ? 'check' : 'copy'} size={11} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Download ${format.title}`}
                    disabled={!result}
                    onClick={download}
                    className="shrink-0 rounded border border-ink-700 px-1.5 py-1 font-mono text-[9px] text-fog-400 transition-colors hover:border-accent-dim hover:text-accent-bright disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </div>

              {feedback && (
                <div
                  role="status"
                  className={`mt-2 min-w-0 break-anywhere rounded border px-2 py-1.5 text-[10px] leading-relaxed ${
                    feedback.kind === 'success'
                      ? 'border-accent-dim/60 bg-accent/8 text-accent-bright'
                      : 'border-red-500/30 bg-red-500/10 text-red-200'
                  }`}
                >
                  {feedback.message}
                </div>
              )}

              {exportState.error && (
                <div role="alert" className="mt-2 min-w-0 break-anywhere text-[10px] text-red-200">
                  Export could not be generated: {exportState.error}
                </div>
              )}

              <textarea
                aria-label={`${format.title} output`}
                value={result?.content ?? ''}
                readOnly
                wrap="soft"
                spellCheck={false}
                className="mt-2 min-h-40 min-w-0 w-full resize-y break-anywhere rounded border border-ink-700 bg-ink-950 p-2 font-mono text-[10px] leading-relaxed text-fog-200"
              />
            </div>

            <ProvenancePanel blueprint={validBlueprint} padding={padding} labelWidth={labelWidth} />
            <ScopePanel blueprint={validBlueprint} warnings={result?.warnings ?? []} padding={padding} />
          </div>
        </div>
      )}
    </main>
  );
}
