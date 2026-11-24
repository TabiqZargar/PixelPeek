import { useMemo, useState } from 'react';
import { CSS_CATEGORIES, type CssProperty, type ElementSnapshot, type HierarchyNode, type InspectorStatus, type TypographyValue } from '../../shared/types';
import { sanitizeCssValue, suggestSelectors } from '../../content/css';
import type { PanelMetrics } from '../hooks/usePanelWidth';
import { Icon } from './Icon';
import { ColorField, Field, Section } from './Field';

export type InspectorTab = 'overview' | 'box' | 'css' | 'typography' | 'colors' | 'hierarchy';

interface Props {
  status: InspectorStatus;
  snapshot: ElementSnapshot | null;
  metrics: PanelMetrics;
  copiedKey: string | null;
  onNavigate: (direction: 'parent' | 'child' | 'previous-sibling' | 'next-sibling', index?: number) => void;
  onCopyText: (text: string, key?: string) => void;
}

const TABS: Array<{ id: InspectorTab; label: string; compact: string }> = [
  { id: 'overview', label: 'Overview', compact: 'Over' },
  { id: 'box', label: 'Box Model', compact: 'Box' },
  { id: 'css', label: 'CSS', compact: 'CSS' },
  { id: 'typography', label: 'Typography', compact: 'Type' },
  { id: 'colors', label: 'Colors', compact: 'Color' },
  { id: 'hierarchy', label: 'Hierarchy', compact: 'Tree' },
];

function CopyButton({
  label,
  text,
  copyKey,
  copiedKey,
  onCopy,
}: {
  label: string;
  text: string;
  copyKey: string;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
}) {
  const copied = copiedKey === copyKey;
  return (
    <button
      type="button"
      title={copied ? 'Copied' : `Copy ${label}`}
      aria-label={copied ? 'Copied' : `Copy ${label}`}
      onClick={() => onCopy(text, copyKey)}
      className="shrink-0 rounded border border-ink-700 p-1 text-fog-500 transition-colors hover:border-accent-dim hover:text-accent-bright"
    >
      <Icon name={copied ? 'check' : 'copy'} size={11} />
    </button>
  );
}

function NodeLine({ node }: { node: HierarchyNode }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-fog-200">
      <span className="shrink-0 text-fog-500">{'·'.repeat(Math.min(node.depth, 6))}</span>
      <span className="shrink-0 text-accent-bright">&lt;{node.tag}&gt;</span>
      {node.id && <span className="truncate text-fog-300">#{node.id}</span>}
      {node.classes.slice(0, 2).map((name) => (
        <span key={name} className="truncate text-fog-500">
          .{name}
        </span>
      ))}
    </div>
  );
}

function BoxDiagram({ snapshot }: { snapshot: ElementSnapshot }) {
  const { measured, estimatedOuter } = snapshot.boxModel;
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-ink-750 bg-ink-900 p-3 font-mono text-[10px]">
        <div className="mb-2 text-fog-500">margin</div>
        <div className="rounded-md border border-ink-600 bg-ink-850 p-3">
          <div className="mb-2 text-fog-500">border</div>
          <div className="rounded-md border border-accent-dim bg-accent/5 p-3">
            <div className="mb-2 text-accent-bright">padding</div>
            <div className="rounded border border-ink-600 bg-ink-900 px-2 py-4 text-center text-fog-100">
              content
              <div className="mt-1 text-fog-400">
                {Math.round(measured.width)} × {Math.round(measured.height)}px
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {(['margin', 'border', 'padding'] as const).map((key) => (
          <div key={key} className="min-w-0 rounded-md border border-ink-750 bg-ink-850 p-2">
            <div className="font-mono text-[8px] uppercase tracking-wide text-fog-500">{key}</div>
            <div className="mt-1 break-anywhere font-mono text-[10px] leading-relaxed text-fog-200">
              T {snapshot.boxModel[key].top ?? '—'} · R {snapshot.boxModel[key].right ?? '—'} · B{' '}
              {snapshot.boxModel[key].bottom ?? '—'} · L {snapshot.boxModel[key].left ?? '—'}
            </div>
          </div>
        ))}
      </div>
      <Section title="Computed size" padding={0}>
        <Field label="Box sizing" value={snapshot.boxModel.boxSizing} labelWidth={76} />
        <Field label="Width" value={snapshot.boxModel.computedWidth} labelWidth={76} numeric />
        <Field label="Height" value={snapshot.boxModel.computedHeight} labelWidth={76} numeric />
        <Field label="Content" value={formatPair(snapshot.boxModel.contentWidth, snapshot.boxModel.contentHeight)} labelWidth={76} numeric />
        <Field label="Outer est." value={estimatedOuter ? `${estimatedOuter.width} × ${estimatedOuter.height}px` : null} labelWidth={76} numeric />
      </Section>
      <ul className="space-y-1 font-mono text-[9px] leading-relaxed text-fog-500">
        {snapshot.boxModel.notes.map((note) => (
          <li key={note}>• {note}</li>
        ))}
      </ul>
    </div>
  );
}

function formatPair(width: number | null, height: number | null): string | null {
  if (width === null || height === null) return null;
  return `${width} × ${height}px`;
}

function CssExplorer({
  snapshot,
  copiedKey,
  onCopyText,
}: {
  snapshot: ElementSnapshot;
  copiedKey: string | null;
  onCopyText: (text: string, key?: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return snapshot.properties;
    return snapshot.properties.filter((property) =>
      `${property.name} ${property.value} ${property.category}`.toLowerCase().includes(needle),
    );
  }, [query, snapshot.properties]);

  const toggle = (category: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const copyVisible = () => {
    const css = filtered.map((property) => `  ${property.name}: ${property.value};`).join('\n');
    if (css) void onCopyText(css, 'css-visible');
  };

  return (
    <div className="space-y-3">
      <div className="flex min-w-0 items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter properties"
          aria-label="Filter CSS properties"
          className="min-w-0 flex-1 rounded-md border border-ink-700 bg-ink-850 px-2 py-1.5 font-mono text-[11px] text-fog-100 outline-none placeholder:text-fog-500 focus:border-accent-dim"
        />
        <button
          type="button"
          onClick={copyVisible}
          disabled={!filtered.length}
          className="shrink-0 rounded-md border border-ink-700 px-2 py-1.5 text-[10px] text-fog-300 hover:border-accent-dim disabled:opacity-40"
        >
          {copiedKey === 'css-visible' ? 'Copied' : 'Copy visible'}
        </button>
      </div>
      <div className="font-mono text-[9px] text-fog-500">
        {filtered.length} of {snapshot.properties.length} properties
      </div>
      {CSS_CATEGORIES.map((category) => {
        const properties = filtered.filter((property) => property.category === category);
        if (!properties.length) return null;
        const isOpen = !collapsed.has(category);
        return (
          <section key={category} className="overflow-hidden rounded-md border border-ink-750">
            <button
              type="button"
              onClick={() => toggle(category)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between bg-ink-850 px-2 py-1.5 text-left font-mono text-[9px] uppercase tracking-wide text-fog-400 hover:text-fog-100"
            >
              {category}
              <span className="text-fog-500">{properties.length}</span>
            </button>
            {isOpen && (
              <div className="divide-y divide-ink-800">
                {properties.map((property: CssProperty) => (
                  <div key={property.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 px-2 py-1.5">
                    <div className="min-w-0">
                      <div className="font-mono text-[10px] text-accent-bright">{property.name}</div>
                      <div className="break-anywhere font-mono text-[10px] leading-relaxed text-fog-200" title={property.value}>
                        {property.value}
                      </div>
                    </div>
                    <CopyButton
                      label={`${property.name} declaration`}
                      text={`${property.name}: ${property.value};`}
                      copyKey={`css:${property.name}`}
                      copiedKey={copiedKey}
                      onCopy={(text, key) => void onCopyText(text, key)}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

const TYPE_LABELS: Array<[string, keyof ElementSnapshot['typography']]> = [
  ['Font family', 'fontFamily'],
  ['Font size', 'fontSize'],
  ['Font weight', 'fontWeight'],
  ['Font style', 'fontStyle'],
  ['Line height', 'lineHeight'],
  ['Letter spacing', 'letterSpacing'],
  ['Word spacing', 'wordSpacing'],
  ['Text align', 'textAlign'],
  ['Text transform', 'textTransform'],
  ['Text decoration', 'textDecoration'],
  ['Color', 'color'],
  ['White space', 'whiteSpace'],
];

function TypographyPanel({
  snapshot,
  copiedKey,
  onCopyText,
}: {
  snapshot: ElementSnapshot;
  copiedKey: string | null;
  onCopyText: (text: string, key?: string) => void;
}) {
  const entries = TYPE_LABELS.filter(([, key]) => snapshot.typography[key].value);
  const allCss = entries
    .map(([label, key]) => {
      const property = label.toLowerCase().replace(' ', '-');
      return `${property}: ${snapshot.typography[key].value};`;
    })
    .join('\n');
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => void onCopyText(allCss, 'typography')}
        className="w-full rounded-md border border-ink-700 bg-ink-850 px-2 py-1.5 text-[10px] text-fog-300 hover:border-accent-dim"
      >
        {copiedKey === 'typography' ? 'Copied typography' : 'Copy all typography'}
      </button>
      <div className="divide-y divide-ink-800 overflow-hidden rounded-md border border-ink-750">
        {entries.map(([label, key]) => {
          const value: TypographyValue = snapshot.typography[key];
          return (
            <div key={key} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 px-2 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[9px] uppercase tracking-wide text-fog-500">{label}</span>
                  {value.matchesParent && (
                    <span className="rounded border border-ink-700 px-1 font-mono text-[8px] text-fog-500">
                      inherited
                    </span>
                  )}
                </div>
                <div className="mt-0.5 break-anywhere font-mono text-[11px] text-fog-100" title={value.value ?? ''}>
                  {value.value}
                </div>
              </div>
              <CopyButton
                label={label}
                text={value.value ?? ''}
                copyKey={`type:${key}`}
                copiedKey={copiedKey}
                onCopy={(text, copyKey) => void onCopyText(text, copyKey)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ColorsPanel({
  snapshot,
  copiedKey,
  onCopyText,
}: {
  snapshot: ElementSnapshot;
  copiedKey: string | null;
  onCopyText: (text: string, key?: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="divide-y divide-ink-800 overflow-hidden rounded-md border border-ink-750">
        {snapshot.colors.map((entry, index) => (
          <div key={`${entry.property}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 px-2 py-2">
            <div className="min-w-0">
              <div className="font-mono text-[9px] uppercase tracking-wide text-fog-500">{entry.property}</div>
              <div className="mt-0.5 break-anywhere font-mono text-[10px] text-fog-200">{entry.raw}</div>
              {entry.parsed?.supported && (
                <div className="mt-1 flex flex-wrap gap-1 font-mono text-[9px] text-fog-400">
                  {entry.parsed.hex && <span>{entry.parsed.hex}</span>}
                  {entry.parsed.rgb && <span>{entry.parsed.rgb}</span>}
                  {entry.parsed.hsl && <span>{entry.parsed.hsl}</span>}
                  {entry.parsed.alpha < 1 && <span>α {entry.parsed.alpha}</span>}
                </div>
              )}
              {entry.parsed && !entry.parsed.supported && (
                <div className="mt-1 font-mono text-[9px] text-amber-300">
                  Modern colour function — shown verbatim
                </div>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {entry.parsed?.hex && (
                <span className="size-4 rounded border border-ink-600" style={{ background: entry.parsed.hex }} />
              )}
              <CopyButton
                label="color"
                text={entry.raw}
                copyKey={`color:${entry.property}:${index}`}
                copiedKey={copiedKey}
                onCopy={(text, key) => void onCopyText(text, key)}
              />
            </div>
          </div>
        ))}
        {!snapshot.colors.length && <div className="px-2 py-3 text-[11px] text-fog-500">No colours detected.</div>}
      </div>
      {snapshot.gradients.map((gradient, index) => (
        <div key={`gradient-${index}`} className="overflow-hidden rounded-md border border-ink-750">
          <div
            className="h-12 w-full border-b border-ink-750"
            style={{ background: sanitizeCssValue(gradient.raw) ?? 'transparent' }}
          />
          <div className="space-y-2 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[9px] uppercase tracking-wide text-fog-500">
                {gradient.kind} gradient
              </span>
              <CopyButton
                label="gradient"
                text={gradient.raw}
                copyKey={`gradient:${index}`}
                copiedKey={copiedKey}
                onCopy={(text, key) => void onCopyText(text, key)}
              />
            </div>
            <div className="break-anywhere font-mono text-[10px] text-fog-200">{gradient.raw}</div>
            {gradient.direction && (
              <div className="font-mono text-[9px] text-fog-500">Direction: {gradient.direction}</div>
            )}
            <div className="flex flex-wrap gap-1">
              {gradient.stops.map((stop, stopIndex) => (
                <span key={`${stop.color}-${stopIndex}`} className="rounded border border-ink-700 px-1.5 py-0.5 font-mono text-[9px] text-fog-400">
                  {stop.color}
                  {stop.position ? ` ${stop.position}` : ''}
                </span>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function HierarchyPanel({
  snapshot,
  onNavigate,
}: {
  snapshot: ElementSnapshot;
  onNavigate: Props['onNavigate'];
}) {
  const { hierarchy } = snapshot;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onNavigate('parent')} disabled={!hierarchy.parent} className="rounded-md border border-ink-700 bg-ink-850 px-2 py-1.5 text-[10px] text-fog-300 hover:border-accent-dim disabled:opacity-40">
          ↑ Parent
        </button>
        <button type="button" onClick={() => onNavigate('previous-sibling')} disabled={!hierarchy.previousSibling} className="rounded-md border border-ink-700 bg-ink-850 px-2 py-1.5 text-[10px] text-fog-300 hover:border-accent-dim disabled:opacity-40">
          ← Previous
        </button>
        <button type="button" onClick={() => onNavigate('next-sibling')} disabled={!hierarchy.nextSibling} className="rounded-md border border-ink-700 bg-ink-850 px-2 py-1.5 text-[10px] text-fog-300 hover:border-accent-dim disabled:opacity-40">
          Next →
        </button>
        <button type="button" onClick={() => onNavigate('child')} disabled={!hierarchy.children.length} className="rounded-md border border-ink-700 bg-ink-850 px-2 py-1.5 text-[10px] text-fog-300 hover:border-accent-dim disabled:opacity-40">
          ↓ First child
        </button>
      </div>
      <Section title="Ancestors & siblings" padding={0}>
        <div className="space-y-1.5">
          {hierarchy.parent && <NodeLine node={hierarchy.parent} />}
          {hierarchy.previousSibling && <NodeLine node={hierarchy.previousSibling} />}
          {hierarchy.nextSibling && <NodeLine node={hierarchy.nextSibling} />}
        </div>
      </Section>
      <Section title={`Children (${hierarchy.children.length})`} padding={0}>
        <div className="space-y-1">
          {hierarchy.children.map((node, index) => (
            <button
              key={`${node.tag}-${index}`}
              type="button"
              onClick={() => onNavigate('child', index)}
              className="flex w-full min-w-0 items-center justify-between gap-2 rounded px-1 py-1 text-left hover:bg-ink-850"
            >
              <NodeLine node={node} />
              <Icon name="cursor" size={11} className="shrink-0 text-fog-500" />
            </button>
          ))}
          {!hierarchy.children.length && <div className="text-[11px] text-fog-500">No element children.</div>}
        </div>
      </Section>
    </div>
  );
}

function OverviewPanel({
  snapshot,
  copiedKey,
  onCopyText,
  padding,
}: {
  snapshot: ElementSnapshot;
  copiedKey: string | null;
  onCopyText: (text: string, key?: string) => void;
  padding: number;
}) {
  const { element } = snapshot;
  const selectors = suggestSelectors(snapshot);
  return (
    <div>
      <div className="flex min-w-0 items-center gap-2 border-b border-ink-800" style={{ paddingInline: padding, paddingBlock: padding + 2 }}>
        <span className="shrink-0 rounded border border-accent-dim bg-accent/10 px-1.5 py-0.5 font-mono text-[11px] text-accent-bright">
          {element.tag}
        </span>
        {element.id && (
          <span className="min-w-0 truncate font-mono text-[11px] text-fog-200" title={`#${element.id}`}>
            #{element.id}
          </span>
        )}
      </div>
      <Section title="Suggested selectors" padding={padding}>
        <div className="flex flex-wrap gap-1.5">
          {selectors.map((selector) => (
            <button
              key={selector}
              type="button"
              onClick={() => void onCopyText(selector, `selector:${selector}`)}
              className="max-w-full truncate rounded border border-ink-700 bg-ink-850 px-1.5 py-1 font-mono text-[10px] text-fog-200 hover:border-accent-dim"
              title={selector}
            >
              {copiedKey === `selector:${selector}` ? 'Copied' : selector}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Element" padding={padding}>
        <Field label="Classes" value={element.classes.join(' · ') || null} labelWidth={72} long />
        <Field label="Source" value={element.sourceUrl} labelWidth={72} long />
      </Section>
      <Section title="Geometry" padding={padding}>
        <Field label="Width" value={`${element.dimensions.width}px`} labelWidth={72} numeric />
        <Field label="Height" value={`${element.dimensions.height}px`} labelWidth={72} numeric />
        <Field label="Display" value={element.display} labelWidth={72} />
        <Field label="Position" value={element.position} labelWidth={72} />
      </Section>
      <Section title="Surface" padding={padding}>
        <ColorField label="Background" value={element.backgroundColor} labelWidth={72} />
        <ColorField label="Text" value={element.color} labelWidth={72} />
        <Field label="Radius" value={element.borderRadius} labelWidth={72} long />
        <Field label="Shadow" value={element.boxShadow} labelWidth={72} long />
      </Section>
      <div className="px-5 pb-4 font-mono text-[9px] leading-relaxed text-fog-500" style={{ paddingInline: padding }}>
        Captured {new Date(snapshot.capturedAt).toLocaleTimeString()} · computed values only
      </div>
    </div>
  );
}

function Placeholder({ compact, padding }: { compact: boolean; padding: number }) {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col items-center justify-center text-center"
      style={{ paddingInline: padding, paddingBlock: padding * 2 }}
    >
      <div className={`flex shrink-0 items-center justify-center rounded-xl border border-ink-700 bg-ink-850 text-accent-bright ${compact ? 'size-10' : 'size-12'}`}>
        <Icon name="cursor" size={compact ? 20 : 24} />
      </div>
      <h2 className={`mt-4 font-semibold tracking-tight text-fog-100 ${compact ? 'text-base' : 'text-lg'}`}>
        Inspect any element
      </h2>
      <p className={`mt-2 max-w-[260px] leading-relaxed text-fog-400 ${compact ? 'text-[11px]' : 'text-[12px]'}`}>
        Start inspection, then click an element to capture its computed design values.
      </p>
      {!compact && (
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-fog-500">
          Escape cancels
        </p>
      )}
    </div>
  );
}

export function InspectorDetails({
  status,
  snapshot,
  metrics,
  copiedKey,
  onNavigate,
  onCopyText,
}: Props) {
  const [tab, setTab] = useState<InspectorTab>('overview');
  const compact = metrics.layout === 'compact';
  const padding = metrics.contentPadding;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
      {snapshot ? (
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto" style={{ paddingInline: padding, paddingBlock: padding + 4 }}>
          {tab === 'overview' && <OverviewPanel snapshot={snapshot} copiedKey={copiedKey} onCopyText={onCopyText} padding={0} />}
          {tab === 'box' && <BoxDiagram snapshot={snapshot} />}
          {tab === 'css' && <CssExplorer snapshot={snapshot} copiedKey={copiedKey} onCopyText={onCopyText} />}
          {tab === 'typography' && <TypographyPanel snapshot={snapshot} copiedKey={copiedKey} onCopyText={onCopyText} />}
          {tab === 'colors' && <ColorsPanel snapshot={snapshot} copiedKey={copiedKey} onCopyText={onCopyText} />}
          {tab === 'hierarchy' && <HierarchyPanel snapshot={snapshot} onNavigate={onNavigate} />}
        </div>
      ) : (
        <Placeholder compact={compact} padding={padding} />
      )}
      {status === 'active' && (
        <div className="shrink-0 border-t border-ink-800 px-3 py-1.5 font-mono text-[9px] text-fog-500">
          Pick an element on the page to capture a new snapshot
        </div>
      )}
    </div>
  );
}
