import { useState } from 'react';
import { usePanelMetrics } from './hooks/usePanelMetrics';
import { useInspector } from './hooks/useInspector';
import { AgentPromptsView } from './components/AgentPromptsView';
import { Inspector } from './components/Inspector';
import { SettingsView } from './components/SettingsView';
import { Sidebar, type View } from './components/Sidebar';

export function App() {
  const [view, setView] = useState<View>('inspector');
  const metrics = usePanelMetrics();
  const { status, element, error, copied, start, stop, copyCss } = useInspector();

  return (
    <div className="flex h-full w-full overflow-hidden bg-ink-950">
      <Sidebar
        view={view}
        onViewChange={setView}
        inspecting={status === 'active'}
        metrics={metrics}
      />
      {view === 'inspector' && (
        <Inspector
          status={status}
          element={element}
          error={error}
          copied={copied}
          metrics={metrics}
          onStart={() => void start()}
          onStop={() => void stop()}
          onCopyCss={() => void copyCss()}
        />
      )}
      {view === 'agent-prompts' && <AgentPromptsView element={element} metrics={metrics} />}
      {view === 'settings' && <SettingsView metrics={metrics} />}
    </div>
  );
}
