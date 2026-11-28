import { useMemo, useState, type ReactNode } from 'react';
import { sanitizeCssValue } from '../../content/css';
import type {
  BlueprintEvidenceItem,
  BlueprintGeometry,
  DesignDetectedValue,
  DesignSystemCategory,
  WebsiteBlueprint,
} from '../../shared/types';
import type { ExportFeedback, WebsiteBlueprintStatus } from '../hooks/useWebsiteBlueprint';
import type { PanelMetrics } from '../hooks/usePanelWidth';
import { Field, Section } from './Field';
import { Icon } from './Icon';

type BlueprintTab =
  | 'overview'
  | 'structure'
  | 'components'
  | 'layout'
  | 'design'
  | 'motion'
  | 'responsive'
  | 'visual'
  | 'evidence'
  | 'export';

interface Props {
  blueprint: WebsiteBlueprint | null;
  status: WebsiteBlueprintStatus;
  error: string | null;
  errorCode: string | null;
  copiedKey: string | null;
  exportFeedback: ExportFeedback | null;
  metrics: PanelMetrics;
  onExtract: () => void;
  onCopyJson: () => void;
  onDownloadJson: () => void;
}

const TABS: Array<{ id: BlueprintTab; label: string; compact: string }> = [
  { id: 'overview', label: 'Overview', compact: 'Over' },
  { id: 'structure', label: 'Structure', compact: 'Tree' },
  { id: 'components', label: 'Components', compact: 'Comp' },
  { id: 'layout', label: 'Layout', compact: 'Lay' },
  { id: 'design', label: 'Design System', compact: 'DS' },
  { id: 'motion', label: 'Motion', compact: 'Move' },
  { id: 'responsive', label: 'Responsive', compact: 'Resp' },
  { id: 'visual', label: 'Visual References', compact: 'Visual' },
  { id: 'evidence', label: 'Evidence', compact: 'Note' },
  { id: 'export', label: 'Export', compact: 'JSON' },
];

const DESIGN_LABELS: Record<DesignSystemCategory, string> = {
  color: 'Colour',
  typography: 'Typography',
  spacing: 'Spacing',
  effect: 'Effect',
  gradient: 'Gradient',
};

function text(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function css(value: string | null | undefined): string {
  if (!value) return '—';
  return sanitizeCssValue(value) ?? value;
}

function count(values: unknown[] | undefined): string {
  return String(values?.length ?? 0);
}

function geometry(value: BlueprintGeometry): string {
  return `${Math.round(value.width)}×${Math.round(value.height)} @ ${Math.round(value.x)}, ${Math.round(value.y)}`;
}

function formatEvidenceItem(item: BlueprintEvidenceItem): string {
  const note = item.note ? ` — ${item.note}` : '';
  return `${item.source} · ${item.status}${note}`;
}

function refLabel(blueprint: WebsiteBlueprint, ref: string | null): string {
  if (!ref) return '—';
  const match = blueprint.refs.find((item) => item.ref === ref);
  return match ? `${match.ref} · ${match.category}` : ref;
}

function CopyButton({
  label,
  copied,
  onClick,
}: {
  label: string;
  copied: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={copied ? 'Copied' : label}
      aria-label={copied ? 'Copied' : label}
      onClick={onClick}
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

function Notice({ children }: { children: ReactNode }) {
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
          : errorCode === 'stale-page' || errorCode === 'timeout'
            ? 'Capture interrupted'
            : 'Capture failed';
  const guidance =
    errorCode === 'unsupported-url'
      ? 'Open a regular http(s) page, then generate a blueprint again.'
      : errorCode === 'injection-failed' || errorCode === 'content-unreachable'
        ? 'Open PixelPeek from the toolbar on this tab, then retry.'
        : errorCode === 'clipboard'
          ? 'Allow clipboard access or copy the value manually.'
          : errorCode === 'stale-page' || errorCode === 'timeout'
            ? 'Stay on the same page and retry the capture.'
            : 'Retry the capture on the same page.';
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

function Feedback({ feedback }: { feedback: ExportFeedback | null }) {
  if (!feedback) return null;
  return (
    <div
      role="status"
      className={`mx-3 mt-2 shrink-0 rounded-md border px-2 py-1.5 text-[10px] leading-relaxed ${
        feedback.kind === 'success'
          ? 'border-accent-dim/60 bg-accent/8 text-accent-bright'
          : 'border-red-500/30 bg-red-500/10 text-red-200'
      }`}
    >
      {feedback.message}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-md border border-ink-750 bg-ink-850 p-2">
      <div className="truncate font-mono text-[8px] uppercase tracking-wide text-fog-500">{label}</div>
      <div className="mt-1 break-anywhere font-mono text-[13px] text-fog-100">{text(value)}</div>
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

function EvidenceList({ items, title = 'Evidence' }: { items: BlueprintEvidenceItem[]; title?: string }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 font-mono text-[8px] uppercase tracking-wide text-fog-500">{title}</div>
      {items.length === 0 ? (
        <div className="text-[11px] text-fog-500">No evidence reported.</div>
      ) : (
        <ul className="space-y-1">
          {items.map((item, index) => (
            <li key={`${item.source}-${index}`} className="min-w-0 break-anywhere font-mono text-[10px] text-fog-400">
              {formatEvidenceItem(item)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Collapsible({
  title,
  subtitle,
  badge,
  children,
}: {
  title: string;
  subtitle: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <details className="min-w-0 rounded-md border border-ink-750 bg-ink-850">
      <summary className="flex min-w-0 cursor-pointer list-none items-start justify-between gap-2 p-2">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-semibold text-fog-100">{title}</div>
          <div className="mt-0.5 truncate font-mono text-[9px] text-fog-500">{subtitle}</div>
        </div>
        {badge && <Badge label={badge} tone="neutral" />}
      </summary>
      <div className="space-y-3 border-t border-ink-800 p-2">{children}</div>
    </details>
  );
}

function OverviewPanel({ blueprint, padding, labelWidth }: { blueprint: WebsiteBlueprint; padding: number; labelWidth: number }) {
  const { metadata } = blueprint;
  return (
    <div className="space-y-3">
      <Notice>
        Blueprints are captured on demand from the current page. Detected values stay separate from inferred guidance.
      </Notice>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Status" value={metadata.status} />
        <Stat label="Origin" value={metadata.origin} />
        <Stat label="Viewport" value={`${metadata.viewport.width}×${metadata.viewport.height}`} />
        <Stat label="Document" value={`${metadata.document.documentWidth}×${metadata.document.documentHeight}`} />
        <Stat label="Structure" value={count(blueprint.structure.nodes)} />
        <Stat label="Components" value={count(blueprint.components)} />
        <Stat label="Layout" value={count(blueprint.layout)} />
        <Stat label="Tokens" value={count(blueprint.designSystem.tokens)} />
      </div>
      <Section title="Capture" padding={padding}>
        <Field label="Request" value={metadata.requestId} labelWidth={labelWidth} long numeric />
        <Field label="Captured" value={metadata.capturedAt} labelWidth={labelWidth} long numeric />
        <Field label="Language" value={metadata.document.language} labelWidth={labelWidth} />
        <Field label="Colour scheme" value={metadata.document.colorScheme} labelWidth={labelWidth} />
        <Field label="Scroll size" value={`${metadata.document.scrollWidth}×${metadata.document.scrollHeight}`} labelWidth={labelWidth} numeric />
        <Field label="Pixel ratio" value={text(metadata.viewport.devicePixelRatio)} labelWidth={labelWidth} numeric />
      </Section>
      <Section title="Truncation" padding={padding}>
        <Field label="Truncated" value={metadata.truncation.truncated ? 'Yes' : 'No'} labelWidth={labelWidth} />
        <Field label="Reasons" value={metadata.truncation.reasons.join(', ')} labelWidth={labelWidth} long />
        <Field label="Limits reached" value={metadata.truncation.limitsReached.join(', ')} labelWidth={labelWidth} long />
      </Section>
      <Section title="Counts" padding={padding}>
        <Field label="Refs" value={count(blueprint.refs)} labelWidth={labelWidth} numeric />
        <Field label="Sections" value={count(blueprint.structure.sectionRefs)} labelWidth={labelWidth} numeric />
        <Field label="Motion" value={`${blueprint.motion.summary.animationCount} animations`} labelWidth={labelWidth} />
        <Field label="Breakpoints" value={count(blueprint.responsive.observedBreakpoints)} labelWidth={labelWidth} numeric />
        <Field label="Visual refs" value={count(blueprint.visualReferences)} labelWidth={labelWidth} numeric />
        <Field label="Evidence" value={count(blueprint.evidence.items)} labelWidth={labelWidth} numeric />
      </Section>
    </div>
  );
}

function StructurePanel({ blueprint }: { blueprint: WebsiteBlueprint }) {
  return (
    <div className="space-y-3">
      <Notice>Root regions appear first; every node keeps its detected geometry and evidence.</Notice>
      {blueprint.structure.nodes.length === 0 ? (
        <div className="text-[11px] text-fog-500">No page regions were detected.</div>
      ) : (
        [...blueprint.structure.nodes]
          .sort((left, right) => Number(left.parentRef !== null) - Number(right.parentRef !== null))
          .map((node) => (
            <Collapsible
              key={node.ref}
              title={`${node.category} · ${refLabel(blueprint, node.ref)}`}
              subtitle={`${node.kind}${node.role ? ` · ${node.role}` : ''} · ${geometry(node.geometry)}`}
              badge={node.evidence.some((item) => item.status === 'inferred') ? 'inferred' : undefined}
            >
              <Field label="Parent" value={refLabel(blueprint, node.parentRef)} labelWidth={92} long />
              <Field label="Children" value={node.childRefs.map((ref) => refLabel(blueprint, ref)).join(', ')} labelWidth={92} long />
              <EvidenceList items={node.evidence} />
              {node.unavailable.length > 0 && <Field label="Unavailable" value={node.unavailable.join(', ')} labelWidth={92} long />}
              {node.limitations.length > 0 && <Field label="Limits" value={node.limitations.join(', ')} labelWidth={92} long />}
            </Collapsible>
          ))
      )}
      {blueprint.structure.unavailable.length > 0 && (
        <NoteList title="Unavailable" notes={blueprint.structure.unavailable} />
      )}
      {blueprint.structure.limitations.length > 0 && (
        <NoteList title="Limitations" notes={blueprint.structure.limitations} />
      )}
    </div>
  );
}

function ComponentsPanel({ blueprint }: { blueprint: WebsiteBlueprint }) {
  return (
    <div className="space-y-3">
      <Notice>Components group repeated interface patterns; selector hints are hints, not guaranteed locators.</Notice>
      {blueprint.components.length === 0 ? (
        <div className="text-[11px] text-fog-500">No components were detected.</div>
      ) : (
        blueprint.components.map((component) => (
          <Collapsible
            key={component.ref}
            title={`${component.category} · ${refLabel(blueprint, component.ref)}`}
            subtitle={`${component.occurrenceCount} occurrence${component.occurrenceCount === 1 ? '' : 's'} · ${component.sectionRefs.map((ref) => refLabel(blueprint, ref)).join(', ')}`}
            badge={String(component.occurrenceCount)}
          >
            <EvidenceList items={component.evidence} />
            <div className="space-y-2">
              {component.examples.map((example, index) => (
                <div key={`${example.ref}-${index}`} className="min-w-0 rounded border border-ink-800 bg-ink-900 p-2">
                  <div className="break-anywhere font-mono text-[10px] text-fog-200">
                    {css(example.selectorHint)} · {geometry(example.geometry)}
                  </div>
                  <div className="mt-1">
                    <EvidenceList items={example.evidence} title="Example evidence" />
                  </div>
                </div>
              ))}
            </div>
            {component.unavailable.length > 0 && <Field label="Unavailable" value={component.unavailable.join(', ')} labelWidth={92} long />}
            {component.limitations.length > 0 && <Field label="Limits" value={component.limitations.join(', ')} labelWidth={92} long />}
          </Collapsible>
        ))
      )}
    </div>
  );
}

function LayoutPanel({ blueprint }: { blueprint: WebsiteBlueprint }) {
  return (
    <div className="space-y-3">
      <Notice>Layout observations describe computed geometry and alignment without reconstructing page code.</Notice>
      {blueprint.layout.length === 0 ? (
        <div className="text-[11px] text-fog-500">No layout observations were captured.</div>
      ) : (
        blueprint.layout.map((item) => (
          <Collapsible
            key={item.ref}
            title={`${item.display} · ${refLabel(blueprint, item.targetRef)}`}
            subtitle={`${refLabel(blueprint, item.ref)} · ${item.dimensions.width ?? '?' } × ${item.dimensions.height ?? '?'}`}
            badge={item.display}
          >
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Min width" value={css(item.dimensions.minWidth)} />
              <Stat label="Max width" value={css(item.dimensions.maxWidth)} />
              <Stat label="Row gap" value={css(item.gaps.rowGap)} />
              <Stat label="Column gap" value={css(item.gaps.columnGap)} />
            </div>
            <Field label="Align items" value={css(item.alignment.alignItems)} labelWidth={92} />
            <Field label="Justify" value={css(item.alignment.justifyContent)} labelWidth={92} />
            <Field label="Position" value={css(item.positioning.position)} labelWidth={92} />
            <Field label="Z-index" value={css(item.positioning.zIndex)} labelWidth={92} />
            {item.flex && (
              <Field
                label="Flex"
                value={`${css(item.flex.direction)} · ${css(item.flex.wrap)} · ${css(item.flex.alignItems)} · ${css(item.flex.justifyContent)}`}
                labelWidth={92}
                long
              />
            )}
            {item.grid && (
              <Field
                label="Grid"
                value={`cols ${css(item.grid.templateColumns)} · rows ${css(item.grid.templateRows)} · gap ${css(item.grid.rowGap)}/${css(item.grid.columnGap)}`}
                labelWidth={92}
                long
              />
            )}
            <EvidenceList items={item.evidence} />
            {item.unavailable.length > 0 && <Field label="Unavailable" value={item.unavailable.join(', ')} labelWidth={92} long />}
            {item.limitations.length > 0 && <Field label="Limits" value={item.limitations.join(', ')} labelWidth={92} long />}
          </Collapsible>
        ))
      )}
    </div>
  );
}

function DetectedValues({ title, values, swatch = false }: { title: string; values: DesignDetectedValue[]; swatch?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
        <span className="truncate font-mono text-[9px] uppercase tracking-wide text-fog-500">{title}</span>
        <Badge label={String(values.length)} tone="neutral" />
      </div>
      {values.length === 0 ? (
        <div className="text-[11px] text-fog-500">None detected.</div>
      ) : (
        <ul className="space-y-1">
          {values.slice(0, 8).map((value, index) => (
            <li key={`${value.normalized}-${index}`} className="flex min-w-0 items-center gap-2 text-[10px]">
              {swatch && (
                <span
                  className="size-3 shrink-0 rounded-[3px] border border-ink-600"
                  style={{ background: css(value.value) }}
                />
              )}
              <span className="min-w-0 flex-1 break-anywhere font-mono text-fog-200" title={value.value}>
                {css(value.value)}
              </span>
              <span className="shrink-0 font-mono text-fog-500">×{value.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DesignPanel({ blueprint, padding, labelWidth }: { blueprint: WebsiteBlueprint; padding: number; labelWidth: number }) {
  const design = blueprint.designSystem;
  return (
    <div className="space-y-3">
      <Notice>Token names are inferred; detected values are reported separately with support counts.</Notice>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Elements" value={design.summary.elementsScanned} />
        <Stat label="Skipped" value={design.summary.elementsSkipped} />
        <Stat label="Stylesheets" value={design.summary.stylesheetsReadable} />
        <Stat label="Inaccessible" value={design.summary.stylesheetsInaccessible} />
      </div>
      <Section title="Detected values" padding={padding}>
        <DetectedValues title={DESIGN_LABELS.color} values={design.detected.palette} swatch />
        <DetectedValues title={DESIGN_LABELS.typography} values={design.detected.typography} />
        <DetectedValues title={DESIGN_LABELS.spacing} values={design.detected.spacing} />
        <DetectedValues title={DESIGN_LABELS.effect} values={design.detected.effects} />
        <DetectedValues title={DESIGN_LABELS.gradient} values={design.detected.gradients} />
      </Section>
      <Section title="Token candidates" padding={padding}>
        {design.tokens.length === 0 ? (
          <div className="text-[11px] text-fog-500">No token candidates met the support threshold.</div>
        ) : (
          design.tokens.slice(0, 12).map((token) => (
            <div key={token.id} className="min-w-0 rounded border border-ink-800 bg-ink-900 p-2">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 break-anywhere font-mono text-[10px] text-fog-100">{token.inferredName}</span>
                <Badge label={`${token.category} · ${token.detected.support}`} tone="neutral" />
              </div>
              <div className="mt-1 break-anywhere font-mono text-[9px] text-fog-500">
                {token.detected.values.slice(0, 3).map((value) => css(value.value)).join(' · ')}
              </div>
            </div>
          ))
        )}
      </Section>
      <Field label="Origin" value={design.origin} labelWidth={labelWidth} long />
      {design.unavailable.length > 0 && <NoteList title="Unavailable" notes={design.unavailable} />}
      {design.limitations.length > 0 && <NoteList title="Limitations" notes={design.limitations} />}
    </div>
  );
}

function MotionPanel({ blueprint }: { blueprint: WebsiteBlueprint }) {
  const motion = blueprint.motion;
  return (
    <div className="space-y-3">
      <Notice>Motion is a point-in-time observation; time-dependent behaviour may not be present.</Notice>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Animations" value={motion.summary.animationCount} />
        <Stat label="Transitions" value={motion.summary.transitionCount} />
        <Stat label="Keyframes" value={motion.summary.keyframeSetCount} />
        <Stat label="Reduced motion" value={motion.reducedMotion ? 'Yes' : 'No'} />
      </div>
      {motion.observations.length === 0 ? (
        <div className="text-[11px] text-fog-500">No active motion was observed.</div>
      ) : (
        motion.observations.map((item) => (
          <Collapsible
            key={item.ref}
            title={`${item.category} · ${refLabel(blueprint, item.targetRef)}`}
            subtitle={`${item.source}${item.name ? ` · ${item.name}` : ''} · ${text(item.timing.duration)}ms`}
          >
            <Field label="Timing" value={`${text(item.timing.duration)}ms · ${css(item.timing.easing)} · ${text(item.timing.iterations)}`} labelWidth={92} long />
            <Field label="Properties" value={item.properties.map((property) => `${property.name}: ${css(property.value)}`).join(', ')} labelWidth={92} long />
            <EvidenceList items={item.evidence} />
            {item.unavailable.length > 0 && <Field label="Unavailable" value={item.unavailable.join(', ')} labelWidth={92} long />}
            {item.limitations.length > 0 && <Field label="Limits" value={item.limitations.join(', ')} labelWidth={92} long />}
          </Collapsible>
        ))
      )}
      {motion.easings.length > 0 && (
        <div className="min-w-0 rounded-md border border-ink-750 bg-ink-850 p-2">
          <div className="mb-1 font-mono text-[8px] uppercase tracking-wide text-fog-500">Easings</div>
          <div className="break-anywhere font-mono text-[10px] text-fog-300">
            {motion.easings.map((easing) => css(easing.value)).join(' · ')}
          </div>
        </div>
      )}
      {motion.unavailable.length > 0 && <NoteList title="Unavailable" notes={motion.unavailable} />}
      {motion.limitations.length > 0 && <NoteList title="Limitations" notes={motion.limitations} />}
    </div>
  );
}

function ResponsivePanel({ blueprint, padding, labelWidth }: { blueprint: WebsiteBlueprint; padding: number; labelWidth: number }) {
  const responsive = blueprint.responsive;
  return (
    <div className="space-y-3">
      <Notice>Only the captured viewport was observed; other breakpoints are reported as unobserved.</Notice>
      <Section title="Viewport" padding={padding}>
        <Field label="Observed" value={`${responsive.observedViewport.width}×${responsive.observedViewport.height}`} labelWidth={labelWidth} numeric />
        <Field label="Pixel ratio" value={text(responsive.observedViewport.devicePixelRatio)} labelWidth={labelWidth} numeric />
        <Field label="Breakpoints" value={responsive.observedBreakpoints.join(', ')} labelWidth={labelWidth} long />
        <Field label="Unobserved" value={responsive.unobservedBreakpoints.join(', ')} labelWidth={labelWidth} long />
        <Field label="States" value={responsive.unobservedViewportStates.join(', ')} labelWidth={labelWidth} long />
      </Section>
      <EvidenceList items={responsive.evidence} />
      {responsive.unavailable.length > 0 && <NoteList title="Unavailable" notes={responsive.unavailable} />}
      {responsive.limitations.length > 0 && <NoteList title="Limitations" notes={responsive.limitations} />}
    </div>
  );
}

function VisualPanel({ blueprint }: { blueprint: WebsiteBlueprint }) {
  return (
    <div className="space-y-3">
      <Notice>Visual references point back to detected page regions without storing screenshots.</Notice>
      {blueprint.visualReferences.length === 0 ? (
        <div className="text-[11px] text-fog-500">No visual references were captured.</div>
      ) : (
        blueprint.visualReferences.map((item) => (
          <Collapsible
            key={item.ref}
            title={`${refLabel(blueprint, item.ref)} → ${refLabel(blueprint, item.targetRef)}`}
            subtitle={geometry(item.geometry)}
          >
            <Field label="Descriptors" value={item.descriptors.join(', ')} labelWidth={92} long />
            <EvidenceList items={item.evidence} />
            {item.unavailable.length > 0 && <Field label="Unavailable" value={item.unavailable.join(', ')} labelWidth={92} long />}
            {item.limitations.length > 0 && <Field label="Limits" value={item.limitations.join(', ')} labelWidth={92} long />}
          </Collapsible>
        ))
      )}
    </div>
  );
}

function EvidencePanel({ blueprint, padding }: { blueprint: WebsiteBlueprint; padding: number }) {
  const groups = useMemo(() => {
    const entries: Array<{ label: string; unavailable: string[]; limitations: string[] }> = [
      { label: 'Page', unavailable: blueprint.evidence.unavailable, limitations: blueprint.evidence.limitations },
      { label: 'Structure', unavailable: blueprint.structure.unavailable, limitations: blueprint.structure.limitations },
      { label: 'Design system', unavailable: blueprint.designSystem.unavailable, limitations: blueprint.designSystem.limitations },
      { label: 'Motion', unavailable: blueprint.motion.unavailable, limitations: blueprint.motion.limitations },
      { label: 'Responsive', unavailable: blueprint.responsive.unavailable, limitations: blueprint.responsive.limitations },
    ];
    blueprint.components.forEach((component, index) => entries.push({
      label: `Component ${index + 1}`,
      unavailable: component.unavailable,
      limitations: component.limitations,
    }));
    blueprint.layout.forEach((item, index) => entries.push({
      label: `Layout ${index + 1}`,
      unavailable: item.unavailable,
      limitations: item.limitations,
    }));
    return entries.filter((entry) => entry.unavailable.length > 0 || entry.limitations.length > 0);
  }, [blueprint]);

  return (
    <div className="space-y-3">
      <Notice>Evidence marks detected, inferred and unknown values separately; omissions are never filled in.</Notice>
      <Section title="Evidence items" padding={padding}>
        {blueprint.evidence.items.length === 0 ? (
          <div className="text-[11px] text-fog-500">No evidence items reported.</div>
        ) : (
          blueprint.evidence.items.map((item, index) => (
            <div key={`${item.source}-${index}`} className="min-w-0 break-anywhere font-mono text-[10px] text-fog-300">
              {formatEvidenceItem(item)}
            </div>
          ))
        )}
      </Section>
      {groups.map((group) => (
        <div key={group.label} className="min-w-0 rounded-md border border-ink-750 bg-ink-850 p-2">
          <div className="mb-1 font-mono text-[9px] uppercase tracking-wide text-fog-400">{group.label}</div>
          {group.unavailable.length > 0 && <Field label="Unavailable" value={group.unavailable.join(', ')} labelWidth={92} long />}
          {group.limitations.length > 0 && <Field label="Limits" value={group.limitations.join(', ')} labelWidth={92} long />}
        </div>
      ))}
    </div>
  );
}

function ExportPanel({
  blueprint,
  copiedKey,
  onCopyJson,
  onDownloadJson,
}: {
  blueprint: WebsiteBlueprint;
  copiedKey: string | null;
  onCopyJson: () => void;
  onDownloadJson: () => void;
}) {
  const json = useMemo(() => JSON.stringify(blueprint, null, 2), [blueprint]);
  return (
    <div className="space-y-3">
      <Notice>Exports use only the validated blueprint returned by this capture.</Notice>
      <div className="min-w-0 rounded-md border border-ink-750 bg-ink-850 p-2">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[11px] font-semibold text-fog-100">Blueprint JSON</div>
            <div className="truncate text-[10px] text-fog-500">{json.length.toLocaleString()} characters</div>
          </div>
          <div className="flex shrink-0 gap-1">
            <CopyButton label="Copy Blueprint JSON" copied={copiedKey === 'blueprint-json'} onClick={onCopyJson} />
            <button
              type="button"
              aria-label="Download Blueprint JSON"
              onClick={onDownloadJson}
              className="shrink-0 rounded border border-ink-700 px-1.5 py-1 font-mono text-[9px] text-fog-400 transition-colors hover:border-accent-dim hover:text-accent-bright"
            >
              Save
            </button>
          </div>
        </div>
        <textarea
          aria-label="Blueprint JSON output"
          value={json}
          readOnly
          className="mt-2 min-h-28 min-w-0 w-full resize-y rounded border border-ink-700 bg-ink-950 p-2 font-mono text-[10px] leading-relaxed text-fog-200"
        />
      </div>
    </div>
  );
}

function Placeholder({
  status,
  compact,
  padding,
  onExtract,
}: {
  status: WebsiteBlueprintStatus;
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
        <Icon name="layout" size={compact ? 20 : 24} />
      </div>
      <h2 className={`mt-4 font-semibold tracking-tight text-fog-100 ${compact ? 'text-base' : 'text-lg'}`}>
        {loading ? 'Capturing website blueprint…' : 'No blueprint captured yet'}
      </h2>
      <p className={`mt-2 max-w-[300px] leading-relaxed text-fog-400 ${compact ? 'text-[11px]' : 'text-[12px]'}`}>
        {loading
          ? 'Reading page structure, layout, design values, motion and evidence from the current page.'
          : 'Choose Generate Blueprint to analyse the current page. Nothing is captured until you ask.'}
      </p>
      {!loading && (
        <button
          type="button"
          aria-label="Generate Website Blueprint"
          onClick={onExtract}
          className="mt-4 shrink-0 rounded-md border border-accent-dim bg-accent/10 px-3 py-1.5 text-[11px] text-accent-bright transition-colors hover:bg-accent/15"
        >
          Generate Blueprint
        </button>
      )}
    </div>
  );
}

export function WebsiteBlueprintWorkspace({
  blueprint,
  status,
  error,
  errorCode,
  copiedKey,
  exportFeedback,
  metrics,
  onExtract,
  onCopyJson,
  onDownloadJson,
}: Props) {
  const [tab, setTab] = useState<BlueprintTab>('overview');
  const compact = metrics.layout === 'compact';
  const padding = metrics.contentPadding;
  const labelWidth = compact ? 92 : 112;

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-ink-950">
      <header
        className="shrink-0 border-b border-ink-700 bg-ink-900"
        style={{ paddingInline: padding, paddingBlock: compact ? 10 : 14 }}
      >
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-fog-500">Workspace</div>
            <h1 className="mt-0.5 text-[14px] font-semibold tracking-tight text-fog-100">Website Blueprint</h1>
            <p className="mt-1 text-[11px] leading-relaxed text-fog-400">
              Review the detected structure and design values of the current page.
            </p>
          </div>
          <button
            type="button"
            aria-label="Generate Website Blueprint"
            disabled={status === 'loading'}
            onClick={onExtract}
            className="shrink-0 rounded-md border border-accent-dim bg-accent/10 px-2 py-1.5 font-mono text-[10px] text-accent-bright transition-colors hover:bg-accent/15 disabled:opacity-60"
          >
            {status === 'loading' ? 'Generating…' : blueprint ? 'Regenerate' : 'Generate'}
          </button>
        </div>
      </header>

      {error && <ErrorBanner error={error} errorCode={errorCode} />}
      {!error && <Feedback feedback={exportFeedback} />}

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

      {status === 'loading' && blueprint && (
        <div className="shrink-0 border-b border-ink-800 px-3 py-1.5 font-mono text-[9px] leading-relaxed text-fog-400" role="status">
          Capturing a fresh blueprint from the current page…
        </div>
      )}

      {!blueprint ? (
        <Placeholder status={status} compact={compact} padding={padding} onExtract={onExtract} />
      ) : (
        <div
          className="min-h-0 min-w-0 flex-1 overflow-y-auto"
          style={{ paddingInline: padding, paddingBlock: padding + 4 }}
        >
          {tab === 'overview' && (
            <OverviewPanel blueprint={blueprint} padding={padding} labelWidth={labelWidth} />
          )}
          {tab === 'structure' && <StructurePanel blueprint={blueprint} />}
          {tab === 'components' && <ComponentsPanel blueprint={blueprint} />}
          {tab === 'layout' && <LayoutPanel blueprint={blueprint} />}
          {tab === 'design' && (
            <DesignPanel blueprint={blueprint} padding={padding} labelWidth={labelWidth} />
          )}
          {tab === 'motion' && <MotionPanel blueprint={blueprint} />}
          {tab === 'responsive' && (
            <ResponsivePanel blueprint={blueprint} padding={padding} labelWidth={labelWidth} />
          )}
          {tab === 'visual' && <VisualPanel blueprint={blueprint} />}
          {tab === 'evidence' && <EvidencePanel blueprint={blueprint} padding={padding} />}
          {tab === 'export' && (
            <ExportPanel
              blueprint={blueprint}
              copiedKey={copiedKey}
              onCopyJson={onCopyJson}
              onDownloadJson={onDownloadJson}
            />
          )}
        </div>
      )}
    </main>
  );
}
