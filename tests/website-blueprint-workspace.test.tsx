import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebsiteBlueprintWorkspace } from '../src/panel/components/WebsiteBlueprintWorkspace';
import { getPanelMetrics } from '../src/panel/hooks/usePanelWidth';
import { makeWebsiteBlueprint } from './fixtures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const callbacks = {
  onExtract: vi.fn(),
  onCopyJson: vi.fn(),
  onDownloadJson: vi.fn(),
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  callbacks.onExtract.mockReset();
  callbacks.onCopyJson.mockReset();
  callbacks.onDownloadJson.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(
  blueprint: ReturnType<typeof makeWebsiteBlueprint> | null,
  width = 320,
  overrides: Partial<Parameters<typeof WebsiteBlueprintWorkspace>[0]> = {},
) {
  act(() =>
    root.render(
      <WebsiteBlueprintWorkspace
        blueprint={blueprint}
        status={blueprint ? 'ready' : 'idle'}
        error={null}
        errorCode={null}
        copiedKey={null}
        exportFeedback={null}
        metrics={getPanelMetrics(width)}
        {...callbacks}
        {...overrides}
      />,
    ),
  );
}

function clickTab(label: string) {
  const tab = Array.from(container.querySelectorAll('[role="tab"]')).find(
    (item) => item.textContent === label,
  );
  expect(tab).toBeDefined();
  act(() => tab!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

function clickButton(label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (item) => item.getAttribute('aria-label') === label,
  );
  expect(button).toBeDefined();
  act(() => button!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

describe('WebsiteBlueprintWorkspace', () => {
  it('offers an explicit generate action when no blueprint exists', () => {
    render(null);
    expect(container.textContent).toContain('No blueprint captured yet');
    clickButton('Generate Website Blueprint');
    expect(callbacks.onExtract).toHaveBeenCalledTimes(1);
  });

  it('shows every blueprint section with detected data', () => {
    render(makeWebsiteBlueprint(), 640);
    expect(container.textContent).toContain('Website Blueprint');
    clickTab('Structure');
    expect(container.textContent).toContain('banner');
    clickTab('Components');
    expect(container.textContent).toContain('button');

    clickTab('Design System');
    expect(container.textContent).toContain('Token candidates');
    clickTab('Motion');
    expect(container.textContent).toContain('Motion is a point-in-time observation');
    clickTab('Responsive');
    expect(container.textContent).toContain('Only the captured viewport was observed');
    clickTab('Visual References');
    expect(container.textContent).toContain('display flex');
    clickTab('Evidence');
    expect(container.textContent).toContain('detected');
    clickTab('Export');
    expect(container.textContent).toContain('Blueprint JSON');
  });

  it('exposes copy and download actions for the validated blueprint', () => {
    render(makeWebsiteBlueprint(), 640);
    clickTab('Export');
    clickButton('Copy Blueprint JSON');
    clickButton('Download Blueprint JSON');
    expect(callbacks.onCopyJson).toHaveBeenCalledTimes(1);
    expect(callbacks.onDownloadJson).toHaveBeenCalledTimes(1);
    expect(container.querySelector('textarea')?.value).toContain('"requestId": "bp-1"');
  });

  it.each([280, 320, 380, 480, 640])('uses a bounded narrow layout at %ipx', (width) => {
    render(makeWebsiteBlueprint(), width);
    expect(container.querySelector('main')?.className).toContain('min-w-0');
    const tabs = container.querySelector('[role="tablist"]');
    expect(tabs?.className).toContain('overflow-x-auto');
    expect(container.querySelector('[role="tablist"]')?.children.length).toBe(10);
  });

  it('surfaces extraction errors with page-specific guidance', () => {
    render(null, 320, {
      status: 'error',
      error: 'This page cannot be inspected.',
      errorCode: 'unsupported-url',
    });
    expect(container.textContent).toContain('Unsupported page');
    expect(container.textContent).toContain('regular http(s) page');
  });
});
