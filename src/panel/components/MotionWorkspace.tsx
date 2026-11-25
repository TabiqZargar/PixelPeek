import { useMemo, useState } from 'react';
import { buildSelector } from '../../content/css';
import {
  easingSvgPath,
  serializeKeyframesCss,
  serializeMotionCss,
  serializeMotionJson,
} from '../../content/motion';
import type {
  ElementSnapshot,
  MotionAnimation,
  MotionReplayAction,
  MotionSource,
  MotionTransition,
  MotionTransitionKind,
} from '../../shared/types';
import type { PanelMetrics } from '../hooks/usePanelWidth';
import { Field, Section } from './Field';
import { Icon } from './Icon';

type MotionTab = 'overview' | 'animations' | 'transitions' | 'keyframes' | 'easing' | 'replay';

interface Props {
  snapshot: ElementSnapshot | null;
  metrics: PanelMetrics;
  copiedKey: string | null;
  error: string | null;
  onCopyText: (text: string, key?: string) => void;
  onReplay: (action: MotionReplayAction, animationId?: string) => void;
}

const TABS: Array<{ id: MotionTab; label: string; compact: string }> = [
  { id: 'overview', label: 'Overview', compact: 'Over' },
  { id: 'animations', label: 'Animations', compact: 'Anim' },
  { id: 'transitions', label: 'Transitions', compact: 'Trans' },
  { id: 'keyframes', label: 'Keyframes', compact: 'Frames' },
  { id: 'easing', label: 'Easing', compact: 'Ease' },
  { id: 'replay', label: 'Replay', compact: 'Play' },
];

const SOURCE_LABELS: Record<MotionSource, string> = {
  'css-animation': 'CSS animation',
  'css-transition': 'CSS transition',
  waapi: 'WAAPI',
};

const KIND_LABELS: Record<MotionTransitionKind, string> = {
  declared: 'Declared',
  running: 'Running',
  observed: 'Observed',
};

function formatMs(value: number | null): string | null {
  return value === null ? null : `${value}ms`;
}

function formatIterations(value: number | null, infinite: boolean): string | null {
  if (infinite) return 'infinite';
  return value === null ? null : String(value);
}

function targetText(target: MotionAnimation['target']): string {
  const id = target.id ? `#${target.id}` : '';
  const classes = target.classes.length ? `.${target.classes.join('.')}` : '';
  return `<${target.tag}>${id}${classes} · depth ${target.depth}`;
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
      title={copied ? 'Copied' : `Copy ${label}`}
      aria-label={copied ? 'Copied' : `Copy ${label}`}
      onClick={() => onCopyText(text, copyKey)}
      className="shrink-0 rounded border border-ink-700 p-1 text-fog-500 transition-colors hover:border-accent-dim hover:text-accent-bright"
    >
      <Icon name={copied ? 'check' : 'copy'} size={11} />
    </button>
  );
}

function Badge({ label, tone }: { label: string; tone: 'accent' | 'green' | 'amber' | 'neutral' }) {
  const tones: Record<typeof tone, string> = {
    accent: 'border-accent-dim bg-accent/10 text-accent-bright',
    green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    neutral: 'border-ink-700 bg-ink-900 text-fog-400',
  };
  return (
    <span className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wide ${tones[tone]}`}>
      {label}
    </span>
  );
}

function OverviewPanel({
  snapshot,
  copiedKey,
  onCopyText,
}: {
  snapshot: ElementSnapshot;
  copiedKey: string | null;
  onCopyText: (text: string, key?: string) => void;
}) {
  const { motion } = snapshot;
  const css = serializeMotionCss(motion, buildSelector(snapshot.element));
  const json = serializeMotionJson(motion);
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="min-w-0 rounded-md border border-ink-750 bg-ink-850 p-2">
          <div className="font-mono text-[8px] uppercase tracking-wide text-fog-500">CSS animations</div>
          <div className="mt-1 font-mono text-[15px] text-fog-100">{motion.summary.cssAnimationCount}</div>
        </div>
        <div className="min-w-0 rounded-md border border-ink-750 bg-ink-850 p-2">
          <div className="font-mono text-[8px] uppercase tracking-wide text-fog-500">CSS transitions</div>
          <div className="mt-1 font-mono text-[15px] text-fog-100">{motion.summary.transitionCount}</div>
        </div>
        <div className="min-w-0 rounded-md border border-ink-750 bg-ink-850 p-2">
          <div className="font-mono text-[8px] uppercase tracking-wide text-fog-500">WAAPI animations</div>
          <div className="mt-1 font-mono text-[15px] text-fog-100">{motion.summary.waapiCount}</div>
        </div>
        <div className="min-w-0 rounded-md border border-ink-750 bg-ink-850 p-2">
          <div className="font-mono text-[8px] uppercase tracking-wide text-fog-500">Running</div>
          <div className="mt-1 font-mono text-[15px] text-fog-100">{motion.summary.runningCount}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onCopyText(css, 'motion-css')}
          className="flex-1 rounded-md border border-ink-700 bg-ink-850 px-2 py-1.5 text-[10px] text-fog-300 hover:border-accent-dim"
        >
          {copiedKey === 'motion-css' ? 'Copied CSS' : 'Copy motion CSS'}
        </button>
        <button
          type="button"
          onClick={() => onCopyText(json, 'motion-json')}
          className="flex-1 rounded-md border border-ink-700 bg-ink-850 px-2 py-1.5 text-[10px] text-fog-300 hover:border-accent-dim"
        >
          {copiedKey === 'motion-json' ? 'Copied JSON' : 'Copy motion JSON'}
        </button>
      </div>
      <Section title="Declared values" padding={0}>
        <Field label="Animation" value={motion.declaredAnimation} labelWidth={72} long />
        <Field label="Transition" value={motion.declaredTransition} labelWidth={72} long />
        <Field label="Keyframe sets" value={String(motion.summary.keyframeSetCount)} labelWidth={72} numeric />
        <Field label="Reduced motion" value={motion.summary.reducedMotion ? 'preferred' : 'not preferred'} labelWidth={72} />
        <Field label="Stylesheets" value={`${motion.stylesheetAccess.readable} readable · ${motion.stylesheetAccess.inaccessible} inaccessible`} labelWidth={72} long />
      </Section>
      <Section title="Animated properties" padding={0}>
        <div className="break-anywhere font-mono text-[10px] leading-relaxed text-fog-200">
          {motion.summary.animatedProperties.length ? motion.summary.animatedProperties.join(' · ') : 'None detected'}
        </div>
      </Section>
      <Section title="Limits" padding={0}>
        <ul className="space-y-1 font-mono text-[9px] leading-relaxed text-fog-500">
          {motion.limitations.map((limitation) => (
            <li key={limitation}>• {limitation}</li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function AnimationsPanel({
  snapshot,
  copiedKey,
  onCopyText,
  onReplay,
}: {
  snapshot: ElementSnapshot;
  copiedKey: string | null;
  onCopyText: (text: string, key?: string) => void;
  onReplay: (action: MotionReplayAction, animationId?: string) => void;
}) {
  const [source, setSource] = useState<'all' | MotionSource>('all');
  const animations = snapshot.motion.animations.filter((animation) => source === 'all' || animation.source === source);
  return (
    <div className="space-y-3">
      <div className="flex min-w-0 items-center gap-2">
        <select
          aria-label="Filter animations by source"
          value={source}
          onChange={(event) => setSource(event.target.value as 'all' | MotionSource)}
          className="min-w-0 flex-1 rounded-md border border-ink-700 bg-ink-850 px-2 py-1.5 font-mono text-[11px] text-fog-100 outline-none focus:border-accent-dim"
        >
          <option value="all">All sources</option>
          <option value="css-animation">CSS animations</option>
          <option value="css-transition">CSS transitions</option>
          <option value="waapi">WAAPI</option>
        </select>
        <button
          type="button"
          onClick={() => onCopyText(serializeMotionJson(snapshot.motion), 'motion-animations-json')}
          className="shrink-0 rounded-md border border-ink-700 px-2 py-1.5 text-[10px] text-fog-300 hover:border-accent-dim"
        >
          {copiedKey === 'motion-animations-json' ? 'Copied' : 'Copy all'}
        </button>
      </div>
      {!animations.length ? (
        <div className="rounded-md border border-ink-750 bg-ink-850 px-3 py-4 text-center text-[11px] text-fog-500">
          No animations detected for this filter.
        </div>
      ) : (
        animations.map((animation) => (
          <section key={animation.id} className="rounded-md border border-ink-750 bg-ink-850">
            <div className="flex min-w-0 items-center justify-between gap-2 border-b border-ink-800 px-2 py-1.5">
              <span className="min-w-0 truncate font-mono text-[10px] text-accent-bright">
                {animation.name ?? 'unnamed animation'}
              </span>
              <Badge label={SOURCE_LABELS[animation.source]} tone={animation.source === 'waapi' ? 'amber' : 'accent'} />
            </div>
            <div className="space-y-1 px-2 py-2">
              <Field label="Target" value={targetText(animation.target)} labelWidth={64} long />
              <Field label="Duration" value={formatMs(animation.timing.duration)} labelWidth={64} numeric />
              <Field label="Delay" value={formatMs(animation.timing.delay)} labelWidth={64} numeric />
              <Field label="Iterations" value={formatIterations(animation.timing.iterations, animation.timing.infinite)} labelWidth={64} numeric />
              <Field label="Easing" value={animation.timing.easing} labelWidth={64} long />
              <Field label="State" value={animation.timing.playState} labelWidth={64} />
              <Field label="Current time" value={formatMs(animation.timing.currentTime)} labelWidth={64} numeric />
              <Field label="Rate" value={animation.timing.playbackRate === null ? null : String(animation.timing.playbackRate)} labelWidth={64} numeric />
              <Field label="Frames" value={String(animation.keyframes.length)} labelWidth={64} numeric />
            </div>
            <div className="flex min-w-0 items-center gap-2 border-t border-ink-800 px-2 py-1.5">
              <button
                type="button"
                disabled={!animation.replayable}
                onClick={() => onReplay('isolated-start', animation.id)}
                className="flex-1 rounded border border-ink-700 px-2 py-1 text-[10px] text-fog-300 hover:border-accent-dim disabled:opacity-40"
              >
                {snapshot.motion.replay.isolatedActiveId === animation.id ? 'Replay again' : 'Isolated replay'}
              </button>
              <CopyButton
                label="animation JSON"
                text={JSON.stringify(animation, null, 2)}
                copyKey={`motion:${animation.id}`}
                copiedKey={copiedKey}
                onCopyText={onCopyText}
              />
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function TransitionsPanel({
  snapshot,
  copiedKey,
  onCopyText,
}: {
  snapshot: ElementSnapshot;
  copiedKey: string | null;
  onCopyText: (text: string, key?: string) => void;
}) {
  const [kind, setKind] = useState<'all' | MotionTransitionKind>('all');
  const transitions = snapshot.motion.transitions.filter((transition) => kind === 'all' || transition.kind === kind);
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-ink-750 bg-ink-850 px-2 py-2 text-[10px] leading-relaxed text-fog-400">
        Declared transitions come from computed CSS. Running transitions come from live animation objects.
        Observed transitions come from browser transition events captured while inspecting.
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <select
          aria-label="Filter transitions by state"
          value={kind}
          onChange={(event) => setKind(event.target.value as 'all' | MotionTransitionKind)}
          className="min-w-0 flex-1 rounded-md border border-ink-700 bg-ink-850 px-2 py-1.5 font-mono text-[11px] text-fog-100 outline-none focus:border-accent-dim"
        >
          <option value="all">All states</option>
          <option value="declared">Declared</option>
          <option value="running">Running</option>
          <option value="observed">Observed</option>
        </select>
        <button
          type="button"
          onClick={() => onCopyText(JSON.stringify(transitions, null, 2), 'motion-transitions')}
          disabled={!transitions.length}
          className="shrink-0 rounded-md border border-ink-700 px-2 py-1.5 text-[10px] text-fog-300 hover:border-accent-dim disabled:opacity-40"
        >
          {copiedKey === 'motion-transitions' ? 'Copied' : 'Copy visible'}
        </button>
      </div>
      {!transitions.length ? (
        <div className="rounded-md border border-ink-750 bg-ink-850 px-3 py-4 text-center text-[11px] text-fog-500">
          No transitions detected for this filter.
        </div>
      ) : (
        transitions.map((transition: MotionTransition) => (
          <section key={transition.id} className="rounded-md border border-ink-750 bg-ink-850">
            <div className="flex min-w-0 items-center justify-between gap-2 border-b border-ink-800 px-2 py-1.5">
              <span className="min-w-0 truncate font-mono text-[10px] text-fog-100">{transition.property}</span>
              <Badge
                label={KIND_LABELS[transition.kind]}
                tone={transition.kind === 'declared' ? 'accent' : transition.kind === 'running' ? 'green' : 'amber'}
              />
            </div>
            <div className="space-y-1 px-2 py-2">
              <Field label="Target" value={targetText(transition.target)} labelWidth={64} long />
              <Field label="Duration" value={formatMs(transition.duration)} labelWidth={64} numeric />
              <Field label="Delay" value={formatMs(transition.delay)} labelWidth={64} numeric />
              <Field label="Easing" value={transition.easing} labelWidth={64} long />
              <Field label="Elapsed" value={formatMs(transition.elapsedTime)} labelWidth={64} numeric />
              <Field
                label="Values"
                value={transition.before || transition.after ? `${transition.before ?? '—'} → ${transition.after ?? '—'}` : null}
                labelWidth={64}
                long
              />
              <Field label="Raw" value={transition.raw} labelWidth={64} long />
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function KeyframesPanel({
  snapshot,
  copiedKey,
  onCopyText,
}: {
  snapshot: ElementSnapshot;
  copiedKey: string | null;
  onCopyText: (text: string, key?: string) => void;
}) {
  const sets = snapshot.motion.keyframes;
  const computed = snapshot.motion.animations.filter((animation) => animation.keyframes.length);
  return (
    <div className="space-y-3">
      {!sets.length && !computed.length ? (
        <div className="rounded-md border border-ink-750 bg-ink-850 px-3 py-4 text-center text-[11px] text-fog-500">
          No keyframes detected or authored keyframes were inaccessible.
        </div>
      ) : null}
      {sets.map((set) => {
        const css = serializeKeyframesCss(set);
        return (
          <section key={set.name} className="rounded-md border border-ink-750 bg-ink-850">
            <div className="flex min-w-0 items-center justify-between gap-2 border-b border-ink-800 px-2 py-1.5">
              <span className="min-w-0 truncate font-mono text-[10px] text-accent-bright">{set.name}</span>
              <div className="flex shrink-0 items-center gap-1.5">
                <Badge label={set.referenced ? 'Referenced' : 'Unreferenced'} tone={set.referenced ? 'green' : 'neutral'} />
                <CopyButton
                  label={`${set.name} keyframes`}
                  text={css ?? ''}
                  copyKey={`motion-keyframes:${set.name}`}
                  copiedKey={copiedKey}
                  onCopyText={onCopyText}
                />
              </div>
            </div>
            <div className="space-y-1.5 px-2 py-2">
              {set.keyframes.map((frame, index) => (
                <div key={`${set.name}-${index}`} className="min-w-0">
                  <div className="font-mono text-[9px] uppercase tracking-wide text-fog-500">
                    {Math.round(frame.offset * 100)}%
                  </div>
                  <div className="break-anywhere font-mono text-[10px] leading-relaxed text-fog-200">
                    {frame.properties.map((property) => `${property.name}: ${property.value}`).join(' · ') || 'No properties'}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
      {computed.map((animation) => (
        <section key={`computed-${animation.id}`} className="rounded-md border border-ink-750 bg-ink-850">
          <div className="border-b border-ink-800 px-2 py-1.5 font-mono text-[10px] text-fog-200">
            Computed frames · {animation.name ?? animation.id}
          </div>
          <div className="space-y-1.5 px-2 py-2">
            {animation.keyframes.map((frame, index) => (
              <div key={`${animation.id}-${index}`} className="min-w-0">
                <div className="font-mono text-[9px] uppercase tracking-wide text-fog-500">
                  {Math.round(frame.offset * 100)}%
                </div>
                <div className="break-anywhere font-mono text-[10px] leading-relaxed text-fog-200">
                  {frame.properties.map((property) => `${property.name}: ${property.value}`).join(' · ') || 'No properties'}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function EasingPanel({ snapshot }: { snapshot: ElementSnapshot }) {
  const easings = snapshot.motion.easings;
  if (!easings.length) {
    return (
      <div className="rounded-md border border-ink-750 bg-ink-850 px-3 py-4 text-center text-[11px] text-fog-500">
        No easing functions detected.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {easings.map((easing) => {
        const path = easingSvgPath(easing.points);
        return (
          <section key={easing.value} className="flex min-w-0 items-center gap-3 rounded-md border border-ink-750 bg-ink-850 p-2">
            <div className="min-w-0 flex-1">
              <div className="break-anywhere font-mono text-[10px] text-fog-100">{easing.value}</div>
              <div className="mt-0.5 font-mono text-[9px] uppercase tracking-wide text-fog-500">{easing.kind}</div>
            </div>
            {easing.visualizable && path ? (
              <svg
                viewBox="0 0 1 1"
                className="size-12 shrink-0 rounded border border-ink-700 bg-ink-900"
                role="img"
                aria-label={`Easing curve for ${easing.value}`}
              >
                <path d="M 0 1 L 1 0" stroke="#3a3a45" strokeWidth="0.02" strokeDasharray="0.05 0.05" fill="none" />
                <path d={path} stroke="#a98bff" strokeWidth="0.06" fill="none" strokeLinecap="round" />
              </svg>
            ) : (
              <Badge label="No curve" tone="neutral" />
            )}
          </section>
        );
      })}
    </div>
  );
}

function ReplayPanel({
  snapshot,
  onReplay,
}: {
  snapshot: ElementSnapshot;
  onReplay: (action: MotionReplayAction, animationId?: string) => void;
}) {
  const { motion } = snapshot;
  const replayables = motion.animations.filter((animation) => animation.replayable);
  const [selected, setSelected] = useState<string>('');
  const activeId = replayables.some((animation) => animation.id === selected)
    ? selected
    : (replayables[0]?.id ?? '');
  return (
    <div className="space-y-3">
      <Section title="Target animation" padding={0}>
        <select
          aria-label="Animation to replay"
          value={activeId}
          onChange={(event) => setSelected(event.target.value)}
          className="w-full rounded-md border border-ink-700 bg-ink-850 px-2 py-1.5 font-mono text-[11px] text-fog-100 outline-none focus:border-accent-dim"
        >
          {!replayables.length && <option value="">No replayable animations</option>}
          {replayables.map((animation) => (
            <option key={animation.id} value={animation.id}>
              {animation.id} · {animation.name ?? SOURCE_LABELS[animation.source]}
            </option>
          ))}
        </select>
      </Section>
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={!activeId}
          onClick={() => onReplay('isolated-start', activeId || undefined)}
          className="rounded-md bg-accent px-2 py-2 text-[10px] font-medium text-ink-950 transition-colors hover:bg-accent-bright disabled:opacity-40"
        >
          Isolated replay
        </button>
        <button
          type="button"
          disabled={!motion.replay.isolatedActiveId}
          onClick={() => onReplay('isolated-stop')}
          className="rounded-md border border-ink-700 bg-ink-850 px-2 py-2 text-[10px] text-fog-200 hover:border-accent-dim disabled:opacity-40"
        >
          Stop isolated replay
        </button>
        <button
          type="button"
          disabled={!activeId}
          onClick={() => onReplay('live-restart', activeId || undefined)}
          className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-2 text-[10px] text-amber-200 hover:border-amber-400 disabled:opacity-40"
        >
          Restart original
        </button>
        <button
          type="button"
          disabled={!motion.replay.liveRestorableIds.length}
          onClick={() => onReplay('live-restore')}
          className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-2 text-[10px] text-emerald-200 hover:border-emerald-400 disabled:opacity-40"
        >
          Restore original
        </button>
      </div>
      <Section title="Current state" padding={0}>
        <Field label="Isolated" value={motion.replay.isolatedActiveId} labelWidth={68} long />
        <Field label="Restorable" value={motion.replay.liveRestorableIds.join(' · ') || null} labelWidth={68} long />
        <Field label="Reduced motion" value={motion.summary.reducedMotion ? 'preferred' : 'not preferred'} labelWidth={68} />
        <Field
          label="Interaction"
          value={`hover ${motion.interaction.hover ? 'yes' : 'no'} · focus ${motion.interaction.focus ? 'yes' : 'no'} · active ${motion.interaction.active ? 'yes' : 'no'}`}
          labelWidth={68}
          long
        />
      </Section>
      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-2 text-[10px] leading-relaxed text-amber-200">
        Isolated replay uses a temporary clone and leaves the page animation untouched. Restart original temporarily
        changes the page animation; restore returns its saved position, rate and play state.
      </div>
    </div>
  );
}

export function MotionWorkspace({ snapshot, metrics, copiedKey, error, onCopyText, onReplay }: Props) {
  const [tab, setTab] = useState<MotionTab>('overview');
  const compact = metrics.layout === 'compact';
  const padding = metrics.contentPadding;
  const hasMotion = Boolean(snapshot?.motion);

  const tabs = useMemo(() => TABS, []);

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-ink-950">
      <header
        className="shrink-0 border-b border-ink-700 bg-ink-900"
        style={{ paddingInline: padding, paddingBlock: compact ? 10 : 14 }}
      >
        <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-fog-500">Workspace</div>
        <h1 className="mt-0.5 text-[14px] font-semibold tracking-tight text-fog-100">Motion</h1>
        <p className="mt-1 text-[11px] leading-relaxed text-fog-400">
          Inspect animations, transitions, keyframes and easing from the selected element.
        </p>
      </header>

      {error && (
        <div
          className="shrink-0 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-red-200"
          style={{ marginInline: padding, marginTop: padding }}
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-ink-800 px-2 py-1.5" role="tablist">
        {tabs.map((item) => (
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

      {!hasMotion || !snapshot ? (
        <div
          className="flex min-h-0 flex-1 flex-col items-center justify-center text-center"
          style={{ paddingInline: padding, paddingBlock: padding * 2 }}
        >
          <div className={`flex shrink-0 items-center justify-center rounded-xl border border-ink-700 bg-ink-850 text-accent-bright ${compact ? 'size-10' : 'size-12'}`}>
            <Icon name="motion" size={compact ? 20 : 24} />
          </div>
          <h2 className={`mt-4 font-semibold tracking-tight text-fog-100 ${compact ? 'text-base' : 'text-lg'}`}>
            Select an element first
          </h2>
          <p className={`mt-2 max-w-[260px] leading-relaxed text-fog-400 ${compact ? 'text-[11px]' : 'text-[12px]'}`}>
            Inspect a page and click an element to capture its animation and transition data.
          </p>
        </div>
      ) : (
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto" style={{ paddingInline: padding, paddingBlock: padding + 4 }}>
          {tab === 'overview' && (
            <OverviewPanel snapshot={snapshot} copiedKey={copiedKey} onCopyText={onCopyText} />
          )}
          {tab === 'animations' && (
            <AnimationsPanel
              snapshot={snapshot}
              copiedKey={copiedKey}
              onCopyText={onCopyText}
              onReplay={onReplay}
            />
          )}
          {tab === 'transitions' && (
            <TransitionsPanel snapshot={snapshot} copiedKey={copiedKey} onCopyText={onCopyText} />
          )}
          {tab === 'keyframes' && (
            <KeyframesPanel snapshot={snapshot} copiedKey={copiedKey} onCopyText={onCopyText} />
          )}
          {tab === 'easing' && <EasingPanel snapshot={snapshot} />}
          {tab === 'replay' && <ReplayPanel snapshot={snapshot} onReplay={onReplay} />}
        </div>
      )}
    </main>
  );
}
