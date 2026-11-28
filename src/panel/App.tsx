import { useCallback, useState } from 'react';
import { usePanelMetrics } from './hooks/usePanelMetrics';
import { useInspector } from './hooks/useInspector';
import { AgentPromptsView } from './components/AgentPromptsView';
import { DesignSystemWorkspace } from './components/DesignSystemWorkspace';
import { ExportStudioWorkspace } from './components/ExportStudioWorkspace';
import { Inspector } from './components/Inspector';
import { MotionWorkspace } from './components/MotionWorkspace';
import { SettingsView } from './components/SettingsView';
import { Sidebar, type View } from './components/Sidebar';
import { WebsiteBlueprintWorkspace } from './components/WebsiteBlueprintWorkspace';
import { useDesignSystem } from './hooks/useDesignSystem';
import { useWebsiteBlueprint } from './hooks/useWebsiteBlueprint';

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
    replayValid,
    start,
    stop,
    navigate,
    replay,
    copyText,
    copyCss,
  } = useInspector();
  const design = useDesignSystem();
  const website = useWebsiteBlueprint();
  const clearWebsiteExportState = website.clearExportState;

  const changeView = useCallback((next: View) => {
    if (view === 'inspector' && next !== 'inspector' && status === 'active') void stop();
    if (view === 'website-blueprint' && next !== 'website-blueprint') clearWebsiteExportState();
    if (view === 'export-studio' && next !== 'export-studio') clearWebsiteExportState();
    setView(next);
  }, [clearWebsiteExportState, status, stop, view]);

  return (
    <div className="flex h-full w-full overflow-hidden bg-ink-950">
      <Sidebar
        view={view}
        onViewChange={changeView}
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
      {view === 'design-system' && (
        <DesignSystemWorkspace
          snapshot={design.snapshot}
          status={design.status}
          error={design.error}
          errorCode={design.errorCode}
          copiedKey={design.copiedKey}
          metrics={metrics}
          onExtract={() => void design.extract()}
          onCopyText={(text, key) => void design.copyText(text, key)}
        />
      )}
      {view === 'motion' && (
        <MotionWorkspace
          snapshot={snapshot}
          metrics={metrics}
          copiedKey={copiedKey}
          error={error}
          replayValid={replayValid}
          onCopyText={(text, key) => void copyText(text, key)}
          onReplay={(action, animationId) => void replay(action, animationId)}
        />
      )}
      {view === 'website-blueprint' && (
        <WebsiteBlueprintWorkspace
          blueprint={website.blueprint}
          status={website.status}
          error={website.error}
          errorCode={website.errorCode}
          copiedKey={website.copiedKey}
          exportFeedback={website.exportFeedback}
          metrics={metrics}
          onExtract={() => void website.extract()}
          onCopyJson={() => void website.copyJson()}
          onDownloadJson={() => void website.downloadJson()}
        />
      )}
      {view === 'export-studio' && (
        <ExportStudioWorkspace
          blueprint={website.blueprint}
          status={website.status}
          error={website.error}
          errorCode={website.errorCode}
          metrics={metrics}
          onOpenWebsiteBlueprint={() => setView('website-blueprint')}
        />
      )}
      {view === 'agent-prompts' && (
        <AgentPromptsView element={element} snapshot={snapshot} metrics={metrics} />
      )}
      {view === 'settings' && <SettingsView metrics={metrics} />}
    </div>
  );
}
