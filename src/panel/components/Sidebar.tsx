import { Icon, type IconName } from './Icon';

export type View = 'inspector' | 'settings';

interface Props {
  view: View;
  onViewChange: (view: View) => void;
  inspecting: boolean;
}

interface NavItem {
  label: string;
  icon: IconName;
  disabled?: boolean;
}

const items: NavItem[] = [
  { label: 'Inspector', icon: 'crosshair' },
  { label: 'Design System', icon: 'layers', disabled: true },
  { label: 'Motion', icon: 'motion', disabled: true },
  { label: 'Layout', icon: 'layout', disabled: true },
  { label: 'Saved Blueprints', icon: 'bookmark', disabled: true },
];

export function Sidebar({ view, onViewChange, inspecting }: Props) {
  return (
    <aside className="flex w-[212px] shrink-0 flex-col border-r border-ink-700 bg-ink-900">
      <div className="flex h-14 items-center gap-2.5 border-b border-ink-700 px-4">
        <div className="flex size-7 items-center justify-center rounded-[6px] border border-accent-dim bg-accent/10 text-accent-bright">
          <Icon name="crosshair" size={16} />
        </div>
        <div className="leading-tight">
          <div className="text-[13px] font-semibold tracking-tight text-fog-100">PixelPeek</div>
          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-fog-500">
            Design inspector
          </div>
        </div>
      </div>

      <nav className="flex-1 px-2 pt-4" aria-label="Primary">
        <div className="px-2 pb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-fog-500">
          Workspace
        </div>
        <ul className="space-y-0.5">
          {items.map((item) => {
            const selected = view === 'inspector' && item.label === 'Inspector';
            return (
              <li key={item.label}>
                <button
                  type="button"
                  disabled={item.disabled}
                  aria-current={selected ? 'page' : undefined}
                  onClick={() => onViewChange('inspector')}
                  className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[12px] transition-colors ${
                    selected
                      ? 'bg-accent/12 text-fog-100'
                      : item.disabled
                        ? 'text-fog-500/60'
                        : 'text-fog-300 hover:bg-ink-800 hover:text-fog-100'
                  }`}
                >
                  <Icon name={item.icon} size={15} />
                  <span className="flex-1">{item.label}</span>
                  {item.disabled && (
                    <span className="font-mono text-[9px] uppercase tracking-wide text-fog-500/50">
                      soon
                    </span>
                  )}
                  {!item.disabled && item.label === 'Inspector' && inspecting && (
                    <span className="size-1.5 rounded-full bg-accent shadow-[0_0_8px_#8b6dff]" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 px-2 pb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-fog-500">
          Extension
        </div>
        <button
          type="button"
          aria-current={view === 'settings' ? 'page' : undefined}
          onClick={() => onViewChange('settings')}
          className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[12px] transition-colors ${
            view === 'settings'
              ? 'bg-accent/12 text-fog-100'
              : 'text-fog-300 hover:bg-ink-800 hover:text-fog-100'
          }`}
        >
          <Icon name="settings" size={15} />
          Settings
        </button>
      </nav>

      <div className="border-t border-ink-700 px-4 py-3 font-mono text-[9px] uppercase tracking-[0.12em] text-fog-500">
        Local only · No telemetry
      </div>
    </aside>
  );
}
