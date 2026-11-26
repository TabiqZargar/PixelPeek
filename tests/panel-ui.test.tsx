import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentPromptsView } from '../src/panel/components/AgentPromptsView';
import { DesignSystemWorkspace } from '../src/panel/components/DesignSystemWorkspace';
import { Inspector } from '../src/panel/components/Inspector';
import { MotionWorkspace } from '../src/panel/components/MotionWorkspace';
import { Sidebar } from '../src/panel/components/Sidebar';
import { getPanelMetrics } from '../src/panel/hooks/usePanelWidth';
import type { ElementInfo, ElementSnapshot } from '../src/shared/types';
import { makeDesignSystemSnapshot, makeMotionSnapshot } from './fixtures';

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
  motion: makeMotionSnapshot(),
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

function clickTab(label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent === label && button.getAttribute('role') === 'tab',
  );
  expect(button).toBeDefined();
  act(() => button!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
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
    const designNav = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Design System',
    );
    expect(designNav?.disabled).toBe(false);
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
    render(<AgentPromptsView element={element} snapshot={snapshot} metrics={getPanelMetrics(360)} />);
    const textarea = container.querySelector('textarea')!;
    expect(textarea.value).toContain('## 1. Objective');
    expect(textarea.value).toContain('- Tag: button');
    expect(container.textContent).toContain('Selected reference');
    expect(container.textContent).toContain('Copy prompt');
  });

  it('renders the Phase 3 motion workspace and replay controls', () => {
    render(
      <MotionWorkspace
        snapshot={snapshot}
        metrics={getPanelMetrics(320)}
        copiedKey={null}
        error={null}
        onCopyText={() => {}}
        onReplay={() => {}}
      />,
    );
    expect(container.textContent).toContain('Anim');
    expect(container.textContent).toContain('Trans');
    expect(container.textContent).toContain('Frames');
    expect(container.textContent).toContain('Ease');
    expect(container.textContent).toContain('Play');
    const replayTab = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Play' && button.getAttribute('role') === 'tab',
    )!;
    act(() => replayTab.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.textContent).toContain('Isolated replay');
    expect(container.textContent).toContain('Restart original');
    expect(container.textContent).toContain('Restore original');
  });

  it('renders the design system workspace sections and deterministic exports', () => {
    const onCopyText = vi.fn();
    render(
      <DesignSystemWorkspace
        snapshot={makeDesignSystemSnapshot()}
        status="ready"
        error={null}
        errorCode={null}
        copiedKey={null}
        metrics={getPanelMetrics(640)}
        onExtract={() => {}}
        onCopyText={onCopyText}
      />,
    );
    expect(container.textContent).toContain('Design System');
    expect(container.textContent).toContain('Page origin');
    expect(container.textContent).toContain('Detected values by category');
    expect(container.textContent).toContain('suggestions, not authored CSS variables');

    clickTab('Colors');
    expect(container.textContent).toContain('rgb(139, 109, 255)');
    expect(container.textContent).toContain('--accent-purple');

    clickTab('Tokens');
    expect(container.textContent).toContain('Inferred');
    expect(container.textContent).toContain('button.card');

    clickTab('Export');
    const outputs = Array.from(container.querySelectorAll('textarea'));
    expect(outputs).toHaveLength(3);
    expect(outputs[0]?.value).toContain(':root');
    expect(outputs[1]?.value).toContain('pixelpeek.design-system/v1');
    expect(outputs[2]?.value).toContain('PixelPeek design system summary');
    const copyCss = Array.from(container.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === 'Copy CSS variables',
    )!;
    act(() => copyCss.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onCopyText).toHaveBeenCalledWith(expect.stringContaining(':root'), 'css');
  });

  it('shows empty, loading and error design system states', () => {
    const onExtract = vi.fn();
    render(
      <DesignSystemWorkspace
        snapshot={null}
        status="idle"
        error={null}
        errorCode={null}
        copiedKey={null}
        metrics={getPanelMetrics(320)}
        onExtract={onExtract}
        onCopyText={() => {}}
      />,
    );
    expect(container.textContent).toContain('No design system extracted yet');
    const extractButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === 'Extract Design System',
    )!;
    act(() => extractButton.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onExtract).toHaveBeenCalledTimes(1);

    render(
      <DesignSystemWorkspace
        snapshot={null}
        status="loading"
        error={null}
        errorCode={null}
        copiedKey={null}
        metrics={getPanelMetrics(320)}
        onExtract={() => {}}
        onCopyText={() => {}}
      />,
    );
    expect(container.textContent).toContain('Extracting');

    render(
      <DesignSystemWorkspace
        snapshot={null}
        status="error"
        error="This page cannot be inspected. Try a regular http(s) website."
        errorCode="unsupported-url"
        copiedKey={null}
        metrics={getPanelMetrics(320)}
        onExtract={() => {}}
        onCopyText={() => {}}
      />,
    );
    const alert = container.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain('Unsupported page');
    expect(alert.textContent).toContain('regular http(s) page');

    render(
      <DesignSystemWorkspace
        snapshot={null}
        status="error"
        error="The design system extractor could not start on this page."
        errorCode="injection-failed"
        copiedKey={null}
        metrics={getPanelMetrics(320)}
        onExtract={() => {}}
        onCopyText={() => {}}
      />,
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Permission needed');
  });

  it('keeps long hostile CSS values as text in the compact design system workspace', () => {
    const base = makeDesignSystemSnapshot();
    render(
      <DesignSystemWorkspace
        snapshot={makeDesignSystemSnapshot({
          detected: {
            ...base.detected,
            palette: [
              {
                value: 'url(javascript:alert(1))',
                normalized: 'url(javascript:alert(1))',
                count: 1,
                sourceProperties: ['background-image'],
              },
            ],
          },
        })}
        status="ready"
        error={null}
        errorCode={null}
        copiedKey={null}
        metrics={getPanelMetrics(280)}
        onExtract={() => {}}
        onCopyText={() => {}}
      />,
    );
    clickTab('Color');
    expect(container.textContent).toContain('[unreadable value]');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('main')?.className).toContain('min-w-0');
    expect(container.querySelector('.break-anywhere')).not.toBeNull();
  });
});
