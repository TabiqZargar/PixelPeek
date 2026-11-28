import { Icon, type IconName } from './Icon';
import type { PanelMetrics } from '../hooks/usePanelWidth';

export type View = 'inspector' | 'design-system' | 'motion' | 'website-blueprint' | 'agent-prompts' | 'settings';

interface Props {
  view: View;
  onViewChange: (view: View) => void;
  inspecting: boolean;
  metrics: PanelMetrics;
}

interface NavItem {
  label: string;
  icon: IconName;
  view?: View;
  disabled?: boolean;
}

const workspace: NavItem[] = [
  { label: 'Inspector', icon: 'crosshair', view: 'inspector' },
  { label: 'Design System', icon: 'layers', view: 'design-system' },
  { label: 'Motion', icon: 'motion', view: 'motion' },
  { label: 'Website Blueprint', icon: 'layout', view: 'website-blueprint' },
  { label: 'Saved Blueprints', icon: 'bookmark', disabled: true },
];

const recreate: NavItem[] = [
  { label: 'Agent Prompts', icon: 'sparkles', view: 'agent-prompts' },
];

function GroupLabel({ children, compact }: { children: string; compact: boolean }) {
  return (
    <div
      className="truncate px-2 pb-1.5 font-mono text-[8px] uppercase tracking-[0.14em] text-fog-500"
      title={children}
    >
      {compact ? children.slice(0, 6) : children}
    </div>
  );
}

function NavButton({
  item,
  active,
  compact,
  inspecting,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  compact: boolean;
  inspecting: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={item.disabled}
      aria-current={active ? 'page' : undefined}
      title={item.label}
      onClick={onClick}
      className={`flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left text-[11px] transition-colors ${
        active
          ? 'bg-accent/12 text-fog-100'
          : item.disabled
            ? 'text-fog-500/60'
            : 'text-fog-300 hover:bg-ink-800 hover:text-fog-100'
      }`}
    >
      <Icon name={item.icon} size={14} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.disabled && !compact && (
        <span className="shrink-0 font-mono text-[8px] uppercase tracking-wide text-fog-500/50">
          soon
        </span>
      )}
      {!item.disabled && item.view === 'inspector' && inspecting && (
        <span className="size-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_8px_#8b6dff]" />
      )}
    </button>
  );
}

export function Sidebar({ view, onViewChange, inspecting, metrics }: Props) {
  const compact = metrics.layout === 'compact';

  return (
    <aside
      className="flex min-h-0 shrink-0 flex-col border-r border-ink-700 bg-ink-900"
      style={{ width: metrics.sidebarWidth }}
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-ink-700 px-2.5">
        <div className="flex size-6 shrink-0 items-center justify-center rounded-[5px] border border-accent-dim bg-accent/10 text-accent-bright">
          <Icon name="crosshair" size={14} />
        </div>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[12px] font-semibold tracking-tight text-fog-100">
            PixelPeek
          </div>
          {!compact && (
            <div className="truncate font-mono text-[8px] uppercase tracking-[0.12em] text-fog-500">
              Design inspector
            </div>
          )}
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-1.5 pt-3" aria-label="Primary">
        <GroupLabel compact={compact}>Workspace</GroupLabel>
        <ul className="space-y-0.5">
          {workspace.map((item) => (
            <li key={item.label}>
              <NavButton
                item={item}
                active={view === item.view}
                compact={compact}
                inspecting={inspecting}
                onClick={() => item.view && onViewChange(item.view)}
              />
            </li>
          ))}
        </ul>

        <div className="mt-4">
          <GroupLabel compact={compact}>Recreate</GroupLabel>
          <ul className="space-y-0.5">
            {recreate.map((item) => (
              <li key={item.label}>
                <NavButton
                  item={item}
                  active={view === item.view}
                  compact={compact}
                  inspecting={inspecting}
                  onClick={() => item.view && onViewChange(item.view)}
                />
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4">
          <GroupLabel compact={compact}>Extension</GroupLabel>
          <NavButton
            item={{ label: 'Settings', icon: 'settings', view: 'settings' }}
            active={view === 'settings'}
            compact={compact}
            inspecting={inspecting}
            onClick={() => onViewChange('settings')}
          />
        </div>
      </nav>

      <div className="shrink-0 border-t border-ink-700 px-2.5 py-2.5 font-mono text-[8px] uppercase tracking-[0.1em] text-fog-500">
        {compact ? 'Local only' : 'Local only · No telemetry'}
      </div>
    </aside>
  );
}
