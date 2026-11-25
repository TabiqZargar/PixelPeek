import { useState } from 'react';
import { usePanelMetrics } from './hooks/usePanelMetrics';
import { useInspector } from './hooks/useInspector';
import { AgentPromptsView } from './components/AgentPromptsView';
import { Inspector } from './components/Inspector';
import { MotionWorkspace } from './components/MotionWorkspace';
import { SettingsView } from './components/SettingsView';
import { Sidebar, type View } from './components/Sidebar';

export function App() {
  const [view, setView] = useState<View>('inspector');
  const metrics = usePanelMetrics();
  const {
    status,
    element,
    snapshot,
    error,
    copied,
    copiedKey,
    start,
    stop,
    navigate,
    replay,
    copyText,
    copyCss,
  } = useInspector();

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
          snapshot={snapshot}
          error={error}
          copied={copied}
          copiedKey={copiedKey}
          metrics={metrics}
          onStart={() => void start()}
          onStop={() => void stop()}
          onNavigate={(direction, index) => void navigate(direction, index)}
          onCopyText={(text, key) => void copyText(text, key)}
          onCopyCss={() => void copyCss()}
        />
      )}
      {view === 'motion' && (
        <MotionWorkspace
          snapshot={snapshot}
          metrics={metrics}
          copiedKey={copiedKey}
          error={error}
          onCopyText={(text, key) => void copyText(text, key)}
          onReplay={(action, animationId) => void replay(action, animationId)}
        />
      )}
      {view === 'agent-prompts' && (
        <AgentPromptsView element={element} snapshot={snapshot} metrics={metrics} />
      )}
      {view === 'settings' && <SettingsView metrics={metrics} />}
    </div>
  );
}
