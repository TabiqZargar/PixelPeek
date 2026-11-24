import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentPromptsView } from '../src/panel/components/AgentPromptsView';
import { Inspector } from '../src/panel/components/Inspector';
import { Sidebar } from '../src/panel/components/Sidebar';
import { getPanelMetrics } from '../src/panel/hooks/usePanelWidth';
import type { ElementInfo } from '../src/shared/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const element: ElementInfo = {
  tag: 'button',
  id: 'cta',
  classes: ['primary'],
  dimensions: { width: 120, height: 40 },
  backgroundColor: '#8b6dff',
  color: '#fff',
  fontFamily: 'Inter, sans-serif',
  fontSize: '14px',
  fontWeight: '600',
  padding: '8px 12px',
  margin: null,
  borderRadius: '6px',
  boxShadow: null,
  display: 'flex',
  position: 'relative',
  capturedAt: 'fixed',
  sourceUrl: 'https://example.com/',
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(node: React.ReactNode) {
  act(() => root.render(node));
}

describe('panel UI at narrow widths', () => {
  it.each([280, 320, 380, 480, 640])('renders the shell without fixed wide surfaces at %ipx', (width) => {
    const metrics = getPanelMetrics(width);
    render(
      <>
        <Sidebar view="inspector" onViewChange={() => {}} inspecting={false} metrics={metrics} />
        <Inspector
          status="idle"
          element={element}
          error={null}
          copied={false}
          metrics={metrics}
          onStart={() => {}}
          onStop={() => {}}
          onCopyCss={() => {}}
        />
      </>,
    );

    expect(container.textContent).toContain('PixelPeek');
    expect(container.textContent).toContain('Inspector');
    expect(container.textContent).toContain('Agent Prompts');
    expect(container.querySelectorAll('[style*="width"]').length).toBeGreaterThan(0);
    expect(container.querySelector('main')?.className).toContain('min-w-0');
  });

  it('uses compact control labels in compact mode', () => {
    const metrics = getPanelMetrics(320);
    render(
      <Inspector
        status="idle"
        element={null}
        error={null}
        copied={false}
        metrics={metrics}
        onStart={() => {}}
        onStop={() => {}}
        onCopyCss={() => {}}
      />,
    );
    const startButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === 'Start inspection',
    );
    expect(startButton?.textContent).toBe('Start');
  });

  it('generates a prompt from the selected reference in the workspace', () => {
    render(<AgentPromptsView element={element} metrics={getPanelMetrics(360)} />);
    const textarea = container.querySelector('textarea')!;
    expect(textarea.value).toContain('## 1. Objective');
    expect(textarea.value).toContain('- Tag: button');
    expect(container.textContent).toContain('Selected reference');
    expect(container.textContent).toContain('Copy prompt');
  });
});
