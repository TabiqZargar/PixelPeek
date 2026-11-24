import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentPromptsView } from '../src/panel/components/AgentPromptsView';
import { Inspector } from '../src/panel/components/Inspector';
import { Sidebar } from '../src/panel/components/Sidebar';
import { getPanelMetrics } from '../src/panel/hooks/usePanelWidth';
import type { ElementInfo, ElementSnapshot } from '../src/shared/types';

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

const snapshot: ElementSnapshot = {
  element,
  boxModel: {
    boxSizing: 'border-box',
    computedWidth: '120px',
    computedHeight: '40px',
    measured: { width: 120, height: 40 },
    contentWidth: 120,
    contentHeight: 40,
    estimatedOuter: { width: 120, height: 40 },
    margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
    border: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
    padding: { top: '8px', right: '12px', bottom: '8px', left: '12px' },
    notes: [],
  },
  properties: [],
  typography: {
    fontFamily: { value: 'Inter, sans-serif', matchesParent: false },
    fontSize: { value: '14px', matchesParent: false },
    fontWeight: { value: '600', matchesParent: false },
    fontStyle: { value: 'normal', matchesParent: true },
    lineHeight: { value: '20px', matchesParent: false },
    letterSpacing: { value: 'normal', matchesParent: true },
    wordSpacing: { value: 'normal', matchesParent: true },
    textAlign: { value: 'start', matchesParent: true },
    textTransform: { value: 'none', matchesParent: true },
    textDecoration: { value: 'none solid rgb(255, 255, 255)', matchesParent: false },
    color: { value: '#fff', matchesParent: false },
    whiteSpace: { value: 'normal', matchesParent: true },
  },
  colors: [],
  gradients: [],
  hierarchy: { parent: null, children: [], previousSibling: null, nextSibling: null },
  limitations: [],
  capturedAt: 'fixed',
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
          snapshot={snapshot}
          error={null}
          copied={false}
          copiedKey={null}
          metrics={metrics}
          onStart={() => {}}
          onStop={() => {}}
          onNavigate={() => {}}
          onCopyText={() => {}}
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
        snapshot={null}
        error={null}
        copied={false}
        copiedKey={null}
        metrics={metrics}
        onStart={() => {}}
        onStop={() => {}}
        onNavigate={() => {}}
        onCopyText={() => {}}
        onCopyCss={() => {}}
      />,
    );
    const startButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === 'Start inspection',
    );
    expect(startButton?.textContent).toBe('Start');
  });


  it('renders the Phase 2 inspector tabs and property explorer', () => {
    const metrics = getPanelMetrics(640);
    render(
      <Inspector
        status="idle"
        element={element}
        snapshot={snapshot}
        error={null}
        copied={false}
        copiedKey={null}
        metrics={metrics}
        onStart={() => {}}
        onStop={() => {}}
        onNavigate={() => {}}
        onCopyText={() => {}}
        onCopyCss={() => {}}
      />,
    );
    expect(container.textContent).toContain('Box Model');
    expect(container.textContent).toContain('Hierarchy');
    const cssTab = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'CSS' && button.getAttribute('role') === 'tab',
    )!;
    act(() => cssTab.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.querySelector('input[type="search"]')).not.toBeNull();
    expect(container.textContent).toContain('properties');
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
