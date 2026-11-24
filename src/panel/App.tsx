import { useState } from 'react';
import { Inspector } from './components/Inspector';
import { Sidebar, type View } from './components/Sidebar';
import { SettingsView } from './components/SettingsView';
import { useInspector } from './hooks/useInspector';

export function App() {
  const [view, setView] = useState<View>('inspector');
  const { status, element, error, copied, start, stop, copyCss } = useInspector();

  return (
    <div className="flex h-full w-full overflow-hidden bg-ink-950">
      <Sidebar view={view} onViewChange={setView} inspecting={status === 'active'} />
      {view === 'inspector' ? (
        <Inspector
          status={status}
          element={element}
          error={error}
          copied={copied}
          onStart={() => void start()}
          onStop={() => void stop()}
          onCopyCss={() => void copyCss()}
        />
      ) : (
        <div className="flex-1 overflow-y-auto">
          <SettingsView />
        </div>
      )}
    </div>
  );
}
