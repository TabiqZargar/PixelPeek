import { useMemo, useState } from 'react';
import { sanitizeCssValue } from '../../content/css';
import {
  serializeDesignSystemCss,
  serializeDesignSystemJson,
  serializeDesignSystemPrompt,
} from '../../content/design-system-export';
import {
  DESIGN_SYSTEM_CATEGORIES,
  DESIGN_SYSTEM_LIMITS,
  type DesignDetectedValue,
  type DesignDetectedValues,
  type DesignSystemCategory,
  type DesignSystemSnapshot,
  type DesignTokenCandidate,
} from '../../shared/types';
import type { DesignSystemStatus } from '../hooks/useDesignSystem';
import type { PanelMetrics } from '../hooks/usePanelWidth';
import { Field, Section } from './Field';
import { Icon } from './Icon';

type DesignTab = 'overview' | 'colors' | 'typography' | 'spacing' | 'effects' | 'tokens' | 'export';

interface Props {
  snapshot: DesignSystemSnapshot | null;
  status: DesignSystemStatus;
  error: string | null;
  errorCode: string | null;
  copiedKey: string | null;
  metrics: PanelMetrics;
  onExtract: () => void;
  onCopyText: (text: string, key?: string) => void;
}

const TABS: Array<{ id: DesignTab; label: string; compact: string }> = [
  { id: 'overview', label: 'Overview', compact: 'Over' },
  { id: 'colors', label: 'Colors', compact: 'Color' },
  { id: 'typography', label: 'Typography', compact: 'Type' },
  { id: 'spacing', label: 'Spacing', compact: 'Space' },
  { id: 'effects', label: 'Effects', compact: 'FX' },
  { id: 'tokens', label: 'Tokens', compact: 'Token' },
  { id: 'export', label: 'Export', compact: 'Export' },
];

const CATEGORY_LABELS: Record<DesignSystemCategory, string> = {
  color: 'Colour',
  typography: 'Typography',
  spacing: 'Spacing',
  effect: 'Effect',
  gradient: 'Gradient',
};

const CATEGORY_FIELDS: Record<DesignSystemCategory, keyof DesignDetectedValues> = {
  color: 'palette',
  typography: 'typography',
  spacing: 'spacing',
  effect: 'effects',
  gradient: 'gradients',
};

const EFFECT_CATEGORIES: DesignSystemCategory[] = ['effect', 'gradient'];

function readable(value: string): string {
  return sanitizeCssValue(value) ?? '[unreadable value]';
}

function swatchBackground(value: string): string {
  return sanitizeCssValue(value) ?? 'transparent';
}

function formatTimestamp(value: string): string {
  return value || 'Not reported';
}

function CopyButton({
  label,
  text,
  copyKey,
  copiedKey,
  onCopyText,
}: {
  label: string;
  text: string;
  copyKey: string;
  copiedKey: string | null;
  onCopyText: (text: string, key: string) => void;
}) {
  const copied = copiedKey === copyKey;
  return (
    <button
      type="button"
      title={copied ? 'Copied' : label}
      aria-label={copied ? 'Copied' : label}
      onClick={() => onCopyText(text, copyKey)}
      className="shrink-0 rounded border border-ink-700 p-1 text-fog-500 transition-colors hover:border-accent-dim hover:text-accent-bright"
    >
      <Icon name={copied ? 'check' : 'copy'} size={11} />
    </button>
  );
}

function Badge({ label, tone }: { label: string; tone: 'accent' | 'amber' | 'neutral' }) {
  const tones = {
    accent: 'border-accent-dim bg-accent/10 text-accent-bright',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    neutral: 'border-ink-700 bg-ink-900 text-fog-400',
  };
  return (
    <span className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wide ${tones[tone]}`}>
      {label}
    </span>
  );
}

function Notice({ children }: { children: string }) {
  return (
    <div className="min-w-0 rounded-md border border-accent-dim/60 bg-accent/8 p-2 text-[11px] leading-relaxed text-fog-300">
      {children}
    </div>
  );
}

function ErrorBanner({ error, errorCode }: { error: string; errorCode: string | null }) {
  const title =
    errorCode === 'unsupported-url'
      ? 'Unsupported page'
      : errorCode === 'injection-failed' || errorCode === 'content-unreachable'
        ? 'Permission needed'
        : errorCode === 'clipboard'
          ? 'Clipboard unavailable'
          : 'Extraction failed';
  const guidance =
    errorCode === 'unsupported-url'
      ? 'Open a regular http(s) page, then extract again.'
      : errorCode === 'injection-failed' || errorCode === 'content-unreachable'
        ? 'Open PixelPeek from the toolbar on this tab, then retry.'
        : errorCode === 'clipboard'
          ? 'Allow clipboard access or copy the value manually.'
          : 'Retry the extraction on the same page.';
  return (
    <div
      role="alert"
      className="mx-3 mt-3 shrink-0 rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-[11px] leading-relaxed text-red-200"
    >
      <div className="font-semibold">{title}</div>
      <div className="mt-1 break-anywhere">{error}</div>
      <div className="mt-1 text-red-300/80">{guidance}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-md border border-ink-750 bg-ink-850 p-2">
      <div className="truncate font-mono text-[8px] uppercase tracking-wide text-fog-500">{label}</div>
      <div className="mt-1 break-anywhere font-mono text-[14px] text-fog-100">{value}</div>
    </div>
  );
}

function NoteList({ title, notes }: { title: string; notes: string[] }) {
  return (
    <Section title={title} padding={0}>
      {notes.length === 0 ? (
        <div className="text-[11px] text-fog-500">None reported.</div>
      ) : (
        <ul className="space-y-1.5">
          {notes.map((note) => (
            <li key={note} className="flex min-w-0 gap-1.5 text-[11px] leading-relaxed text-fog-300">
              <span className="shrink-0 text-accent-bright">·</span>
              <span className="min-w-0 break-anywhere">{note}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function OverviewPanel({
  snapshot,
  status,
}: {
  snapshot: DesignSystemSnapshot;
  status: DesignSystemStatus;
}) {
  const { summary } = snapshot;
  return (
    <div className="space-y-3">
      <Notice>
        Token names are PixelPeek suggestions, not authored CSS variables. Extracted values are computed styles.
      </Notice>
      <div className="min-w-0 rounded-md border border-ink-750 bg-ink-850 p-2">
        <div className="font-mono text-[8px] uppercase tracking-wide text-fog-500">Page origin</div>
        <div className="mt-1 break-anywhere font-mono text-[11px] text-fog-100">{snapshot.origin}</div>
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          <Field label="Captured" value={formatTimestamp(snapshot.capturedAt)} labelWidth={72} long />
          <Field label="Status" value={status === 'loading' ? 'refreshing' : 'ready'} labelWidth={72} long />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Stat label="Elements scanned" value={summary.elementsScanned} />
        <Stat label="Elements skipped" value={summary.elementsSkipped} />
        <Stat label="Text elements" value={summary.textElementsInspected} />
        <Stat label="Stylesheets read" value={summary.stylesheetsReadable} />
        <Stat label="Stylesheets blocked" value={summary.stylesheetsInaccessible} />
        <Stat label="Token candidates" value={snapshot.tokens.length} />
      </div>
      <Section title="Detected values by category" padding={0}>
        {DESIGN_SYSTEM_CATEGORIES.map((category) => (
          <Field
            key={category}
            label={CATEGORY_LABELS[category]}
            value={String(snapshot.detected[CATEGORY_FIELDS[category]].length)}
            labelWidth={84}
            long
          />
        ))}
      </Section>
      <Section title="Token candidates by category" padding={0}>
        {DESIGN_SYSTEM_CATEGORIES.map((category) => (
          <Field
            key={category}
            label={CATEGORY_LABELS[category]}
            value={String(summary.tokensByCategory[category])}
            labelWidth={84}
            long
          />
        ))}
      </Section>
      <Section title="Inspection bounds" padding={0}>
        <Field
          label="Elements"
          value={`${DESIGN_SYSTEM_LIMITS.maxElements} max`}
          labelWidth={84}
          long
        />
        <Field
          label="Values / category"
          value={`${DESIGN_SYSTEM_LIMITS.maxDetectedValuesPerCategory} max`}
          labelWidth={84}
          long
        />
        <Field
          label="Tokens"
          value={`${DESIGN_SYSTEM_LIMITS.maxTotalTokens} max`}
          labelWidth={84}
          long
        />
      </Section>
      <NoteList title="Unavailable data" notes={snapshot.unavailable} />
      <NoteList title="Limitations and truncation notes" notes={snapshot.limitations} />
    </div>
  );
}

function DetectedValueRow({ entry, swatch }: { entry: DesignDetectedValue; swatch: boolean }) {
  return (
    <div className="min-w-0 rounded-md border border-ink-750 bg-ink-850 p-2">
      <div className="flex min-w-0 items-start gap-2">
        {swatch && (
          <span
            className="mt-0.5 size-3 shrink-0 rounded-[3px] border border-ink-600"
            style={{ background: swatchBackground(entry.value) }}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="break-anywhere font-mono text-[11px] text-fog-100">{readable(entry.value)}</div>
          {entry.normalized !== entry.value && (
            <div className="mt-0.5 break-anywhere font-mono text-[9px] text-fog-500">
              normalized: {readable(entry.normalized)}
            </div>
          )}
          <div className="mt-0.5 break-anywhere font-mono text-[9px] text-fog-500">
            {entry.sourceProperties.length ? entry.sourceProperties.join(' · ') : 'source properties unavailable'}
          </div>
        </div>
        <Badge label={`${entry.count}×`} tone="neutral" />
      </div>
    </div>
  );
}

function TokenCard({ token, swatch }: { token: DesignTokenCandidate; swatch: boolean }) {
  return (
    <div className="min-w-0 rounded-md border border-ink-750 bg-ink-850 p-2">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <Badge label="Inferred" tone="amber" />
        <span className="min-w-0 break-anywhere font-mono text-[11px] text-fog-100">{token.inferredName}</span>
        <Badge label={token.nameBasis} tone="neutral" />
        <Badge label={`${token.detected.support} uses`} tone="accent" />
      </div>
      <div className="mt-2 space-y-1.5">
        {token.detected.values.map((entry, index) => (
          <DetectedValueRow
            key={`${token.id}-value-${index}`}
            entry={entry}
            swatch={swatch && token.category === 'color'}
          />
        ))}
      </div>
      {token.detected.exemplars.length > 0 && (
        <div className="mt-2 border-t border-ink-800 pt-2">
          <div className="font-mono text-[8px] uppercase tracking-wide text-fog-500">Exemplars</div>
          <ul className="mt-1 space-y-1">
            {token.detected.exemplars.map((exemplar, index) => (
              <li key={`${token.id}-exemplar-${index}`} className="break-anywhere font-mono text-[10px] text-fog-300">
                &lt;{exemplar.tag}&gt; {exemplar.roleHint ? `${exemplar.roleHint} · ` : ''}
                {exemplar.selector}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TokenList({
  snapshot,
  categories,
  swatch = false,
}: {
  snapshot: DesignSystemSnapshot;
  categories: DesignSystemCategory[];
  swatch?: boolean;
}) {
  const tokens = snapshot.tokens
    .filter((token) => categories.includes(token.category))
    .sort((left, right) => right.detected.support - left.detected.support || left.inferredName.localeCompare(right.inferredName));
  if (tokens.length === 0) return <div className="text-[11px] text-fog-500">No inferred token candidates detected.</div>;
  return (
    <div className="space-y-2">
      {tokens.map((token) => (
        <TokenCard key={token.id} token={token} swatch={swatch} />
      ))}
    </div>
  );
}

function TokensPanel({ snapshot }: { snapshot: DesignSystemSnapshot }) {
  return (
    <div className="space-y-3">
      <Notice>Inferred names are PixelPeek suggestions, not authored CSS variables or design tokens.</Notice>
      {DESIGN_SYSTEM_CATEGORIES.map((category) => (
        <Section key={category} title={`${CATEGORY_LABELS[category]} · inferred tokens`} padding={0}>
          <TokenList snapshot={snapshot} categories={[category]} swatch={category === 'color'} />
        </Section>
      ))}
    </div>
  );
}

function DetectedPanel({
  snapshot,
  categories,
  swatch = false,
}: {
  snapshot: DesignSystemSnapshot;
  categories: DesignSystemCategory[];
  swatch?: boolean;
}) {
  return (
    <div className="space-y-3">
      <Notice>Every detected value is shown, including one-off values, with its observed support count.</Notice>
      {categories.map((category) => {
        const entries = snapshot.detected[CATEGORY_FIELDS[category]];
        return (
          <Section key={category} title={`${CATEGORY_LABELS[category]} · detected`} padding={0}>
            {entries.length === 0 ? (
              <div className="text-[11px] text-fog-500">No values detected.</div>
            ) : (
              <div className="space-y-1.5">
                {entries.map((entry, index) => (
                  <DetectedValueRow
                    key={`${category}-${index}`}
                    entry={entry}
                    swatch={swatch && category === 'color'}
                  />
                ))}
              </div>
            )}
          </Section>
        );
      })}
      <Section title="Inferred token candidates" padding={0}>
        <TokenList snapshot={snapshot} categories={categories} swatch={swatch} />
      </Section>
    </div>
  );
}

function ExportBlock({
  title,
  detail,
  text,
  copyKey,
  copiedKey,
  onCopyText,
}: {
  title: string;
  detail: string;
  text: string;
  copyKey: string;
  copiedKey: string | null;
  onCopyText: (text: string, key?: string) => void;
}) {
  return (
    <div className="min-w-0 rounded-md border border-ink-750 bg-ink-850 p-2">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-semibold text-fog-100">{title}</div>
          <div className="truncate text-[10px] text-fog-500">{detail}</div>
        </div>
        <CopyButton
          label={`Copy ${title}`}
          text={text}
          copyKey={copyKey}
          copiedKey={copiedKey}
          onCopyText={onCopyText}
        />
      </div>
      <textarea
        aria-label={`${title} output`}
        value={text}
        readOnly
        className="mt-2 min-h-28 min-w-0 w-full resize-y rounded border border-ink-700 bg-ink-950 p-2 font-mono text-[10px] leading-relaxed text-fog-200"
      />
    </div>
  );
}

function ExportPanel({
  snapshot,
  copiedKey,
  onCopyText,
}: {
  snapshot: DesignSystemSnapshot;
  copiedKey: string | null;
  onCopyText: (text: string, key?: string) => void;
}) {
  const css = useMemo(() => serializeDesignSystemCss(snapshot), [snapshot]);
  const json = useMemo(() => serializeDesignSystemJson(snapshot), [snapshot]);
  const prompt = useMemo(() => serializeDesignSystemPrompt(snapshot), [snapshot]);
  return (
    <div className="space-y-3">
      <Notice>Exports are deterministic and use the same sanitized serializers as the extraction engine.</Notice>
      <ExportBlock
        title="CSS variables"
        detail="Inferred names with detected values"
        text={css}
        copyKey="css"
        copiedKey={copiedKey}
        onCopyText={onCopyText}
      />
      <ExportBlock
        title="JSON"
        detail="Bounded structured snapshot"
        text={json}
        copyKey="json"
        copiedKey={copiedKey}
        onCopyText={onCopyText}
      />
      <ExportBlock
        title="Agent-ready prompt"
        detail="Facts, omissions and suggestion labels"
        text={prompt}
        copyKey="prompt"
        copiedKey={copiedKey}
        onCopyText={onCopyText}
      />
    </div>
  );
}

function Placeholder({
  status,
  compact,
  padding,
  onExtract,
}: {
  status: DesignSystemStatus;
  compact: boolean;
  padding: number;
  onExtract: () => void;
}) {
  const loading = status === 'loading';
  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center text-center"
      style={{ paddingInline: padding, paddingBlock: padding * 2 }}
    >
      <div className={`flex shrink-0 items-center justify-center rounded-xl border border-ink-700 bg-ink-850 text-accent-bright ${compact ? 'size-10' : 'size-12'}`}>
        <Icon name="layers" size={compact ? 20 : 24} />
      </div>
      <h2 className={`mt-4 font-semibold tracking-tight text-fog-100 ${compact ? 'text-base' : 'text-lg'}`}>
        {loading ? 'Extracting design system…' : 'No design system extracted yet'}
      </h2>
      <p className={`mt-2 max-w-[280px] leading-relaxed text-fog-400 ${compact ? 'text-[11px]' : 'text-[12px]'}`}>
        {loading
          ? 'Scanning computed styles on the current page. Extraction runs only when you request it.'
          : 'Choose Extract Design System to scan computed styles. No text, form values, or page DOM content is collected.'}
      </p>
      {!loading && (
        <button
          type="button"
          aria-label="Extract Design System"
          onClick={onExtract}
          className="mt-4 shrink-0 rounded-md border border-accent-dim bg-accent/10 px-3 py-1.5 text-[11px] text-accent-bright transition-colors hover:bg-accent/15"
        >
          Extract Design System
        </button>
      )}
    </div>
  );
}

export function DesignSystemWorkspace({
  snapshot,
  status,
  error,
  errorCode,
  copiedKey,
  metrics,
  onExtract,
  onCopyText,
}: Props) {
  const [tab, setTab] = useState<DesignTab>('overview');
  const compact = metrics.layout === 'compact';
  const padding = metrics.contentPadding;

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-ink-950">
      <header
        className="shrink-0 border-b border-ink-700 bg-ink-900"
        style={{ paddingInline: padding, paddingBlock: compact ? 10 : 14 }}
      >
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-fog-500">Workspace</div>
            <h1 className="mt-0.5 text-[14px] font-semibold tracking-tight text-fog-100">Design System</h1>
            <p className="mt-1 text-[11px] leading-relaxed text-fog-400">
              Inspect detected values and inferred token candidates from this page.
            </p>
          </div>
          <button
            type="button"
            aria-label="Extract Design System"
            disabled={status === 'loading'}
            onClick={onExtract}
            className="shrink-0 rounded-md border border-accent-dim bg-accent/10 px-2 py-1.5 font-mono text-[10px] text-accent-bright transition-colors hover:bg-accent/15 disabled:opacity-60"
          >
            {status === 'loading' ? 'Extracting…' : snapshot ? 'Re-extract' : 'Extract'}
          </button>
        </div>
      </header>

      {error && <ErrorBanner error={error} errorCode={errorCode} />}

      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-ink-800 px-2 py-1.5" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`shrink-0 rounded px-2 py-1 font-mono text-[10px] transition-colors ${
              tab === item.id
                ? 'bg-accent/12 text-accent-bright'
                : 'text-fog-500 hover:bg-ink-850 hover:text-fog-200'
            }`}
          >
            {compact ? item.compact : item.label}
          </button>
        ))}
      </div>

      {status === 'loading' && snapshot && (
        <div className="shrink-0 border-b border-ink-800 px-3 py-1.5 font-mono text-[9px] text-fog-400" role="status">
          Refreshing detection…
        </div>
      )}

      {!snapshot ? (
        <Placeholder status={status} compact={compact} padding={padding} onExtract={onExtract} />
      ) : (
        <div
          className="min-h-0 min-w-0 flex-1 overflow-y-auto"
          style={{ paddingInline: padding, paddingBlock: padding + 4 }}
        >
          {tab === 'overview' && <OverviewPanel snapshot={snapshot} status={status} />}
          {tab === 'colors' && <DetectedPanel snapshot={snapshot} categories={['color']} swatch />}
          {tab === 'typography' && <DetectedPanel snapshot={snapshot} categories={['typography']} />}
          {tab === 'spacing' && <DetectedPanel snapshot={snapshot} categories={['spacing']} />}
          {tab === 'effects' && <DetectedPanel snapshot={snapshot} categories={EFFECT_CATEGORIES} />}
          {tab === 'tokens' && <TokensPanel snapshot={snapshot} />}
          {tab === 'export' && (
            <ExportPanel snapshot={snapshot} copiedKey={copiedKey} onCopyText={onCopyText} />
          )}
        </div>
      )}
    </main>
  );
}
