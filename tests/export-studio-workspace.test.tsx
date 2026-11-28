import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExportStudioWorkspace } from '../src/panel/components/ExportStudioWorkspace';
import { getPanelMetrics } from '../src/panel/hooks/usePanelWidth';
import { writeClipboard } from '../src/panel/clipboard';
import { downloadText } from '../src/panel/download';
import type { WebsiteBlueprint } from '../src/shared/types';
import { makeDesignSystemSnapshot, makeWebsiteBlueprint } from './fixtures';

vi.mock('../src/panel/clipboard', () => ({ writeClipboard: vi.fn() }));
vi.mock('../src/panel/download', () => ({ downloadText: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const blueprint = makeWebsiteBlueprint();

const formats = [
  ['Blueprint JSON', 'blueprint.json', '"requestId": "bp-1"'],
  ['Implementation Brief', 'implementation-brief.md', '# Implementation Brief'],
  ['Design Tokens CSS', 'design-tokens.css', ':root'],
  ['Component Inventory', 'component-inventory.md', '# Component Inventory'],
  ['Layout Specification', 'layout-specification.md', '# Layout Specification'],
  ['Blueprint Agent Prompt', 'blueprint-agent-prompt.md', '# Blueprint Implementation Prompt'],
] as const;

let container: HTMLDivElement;
let root: Root;
const onOpenWebsiteBlueprint = vi.fn();

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  onOpenWebsiteBlueprint.mockReset();
  vi.mocked(writeClipboard).mockReset();
  vi.mocked(downloadText).mockReset();
  vi.mocked(writeClipboard).mockResolvedValue(true);
  vi.mocked(downloadText).mockReturnValue(true);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(width = 320, overrides: Partial<Parameters<typeof ExportStudioWorkspace>[0]> = {}) {
  act(() =>
    root.render(
      <ExportStudioWorkspace
        blueprint={blueprint}
        status="ready"
        error={null}
        errorCode={null}
        metrics={getPanelMetrics(width)}
        onOpenWebsiteBlueprint={onOpenWebsiteBlueprint}
        {...overrides}
      />,
    ),
  );
}

function clickFormat(title: string) {
  const tab = Array.from(container.querySelectorAll('[role="tab"]')).find(
    (item) => item.getAttribute('aria-label') === title,
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

function preview(): string {
  return container.querySelector('textarea')?.value ?? '';
}

describe('ExportStudioWorkspace', () => {
  it('exposes all six formats and switches the preview to the selected output', () => {
    render();
    expect(container.querySelectorAll('[role="tab"]').length).toBe(6);

    for (const [title, filename, marker] of formats) {
      clickFormat(title);
      expect(container.textContent).toContain(filename);
      expect(preview()).toContain(marker);
    }
  });

  it('copies the selected output through the shared clipboard helper', async () => {
    render();
    clickFormat('Implementation Brief');
    await act(async () => clickButton('Copy Implementation Brief'));

    expect(writeClipboard).toHaveBeenCalledWith(expect.stringContaining('# Implementation Brief'));
    expect(container.textContent).toContain('Implementation Brief copied.');
  });

  it('does not claim clipboard success when the helper fails', async () => {
    vi.mocked(writeClipboard).mockResolvedValueOnce(false);
    render();
    clickFormat('Design Tokens CSS');
    await act(async () => clickButton('Copy Design Tokens CSS'));

    expect(container.textContent).toContain('Clipboard access was denied.');
    expect(container.textContent).not.toContain('Design Tokens CSS copied.');
  });

  it('downloads the selected output with its export metadata', () => {
    render();
    clickFormat('Design Tokens CSS');
    clickButton('Download Design Tokens CSS');

    expect(downloadText).toHaveBeenCalledWith(
      'design-tokens.css',
      'text/css',
      expect.stringContaining(':root'),
    );
    expect(container.textContent).toContain('Design Tokens CSS downloaded.');
  });

  it('does not claim download success when the helper fails', () => {
    vi.mocked(downloadText).mockReturnValueOnce(false);
    render();
    clickButton('Download Blueprint JSON');
    expect(container.textContent).toContain('Download could not be started.');
    expect(container.textContent).not.toContain('Blueprint JSON downloaded.');
  });

  it('clears stale copy feedback when the format changes', async () => {
    render();
    await act(async () => clickButton('Copy Blueprint JSON'));
    expect(container.textContent).toContain('Blueprint JSON copied.');

    clickFormat('Component Inventory');
    expect(container.textContent).not.toContain('Blueprint JSON copied.');
    expect(container.textContent).not.toContain('Component Inventory copied.');
  });

  it('shows validated provenance, scope limits, missing observations and export warnings', () => {
    const partial = makeWebsiteBlueprint({
      metadata: {
        ...blueprint.metadata,
        status: 'partial',
        truncation: {
          truncated: true,
          reasons: ['node limit was reached'],
          limitsReached: ['maxNodes'],
        },
      },
      evidence: {
        ...blueprint.evidence,
        unavailable: ['Page text was not sampled'],
      },
      designSystem: {
        ...makeDesignSystemSnapshot(),
        unavailable: ['Token sampling was unavailable'],
      },
    });
    render(640, { blueprint: partial });
    clickFormat('Implementation Brief');

    expect(container.textContent).toContain('https://example.com');
    expect(container.textContent).not.toContain('/checkout');
    expect(container.textContent).not.toContain('token=secret');
    expect(container.textContent).toContain('2026-01-01T00:00:00.000Z');
    expect(container.textContent).toContain('Schema');
    expect(container.textContent).toContain('Only the captured viewport was observed');
    expect(container.textContent).toContain('Token names are inferred suggestions');
    expect(container.textContent).toContain('screenshots');
    expect(container.textContent).toContain('not a complete or pixel-perfect website specification');
    expect(container.textContent).toContain('Unavailable · Blueprint: Page text was not sampled');
    expect(container.textContent).toContain('Unavailable · Design system: Token sampling was unavailable');
    expect(container.textContent).toContain('Blueprint status: partial.');
    expect(container.textContent).toContain('Blueprint was truncated');
  });

  it('offers navigation and no export actions when no blueprint exists', () => {
    render(320, { blueprint: null });
    expect(container.textContent).toContain('No validated blueprint yet');
    expect(container.querySelector('textarea')).toBeNull();
    clickButton('Open Website Blueprint');
    expect(onOpenWebsiteBlueprint).toHaveBeenCalledTimes(1);
    expect(writeClipboard).not.toHaveBeenCalled();
    expect(downloadText).not.toHaveBeenCalled();
  });

  it('treats an invalid blueprint as unavailable', () => {
    const invalid = {
      ...blueprint,
      metadata: { ...blueprint.metadata, origin: 'https://example.com/' },
    } as unknown as WebsiteBlueprint;
    render(320, { blueprint: invalid });
    expect(container.textContent).toContain('No validated blueprint yet');
    expect(container.querySelector('textarea')).toBeNull();
    expect(writeClipboard).not.toHaveBeenCalled();
    expect(downloadText).not.toHaveBeenCalled();
  });

  it.each([280, 320, 380, 480, 640])('uses a bounded narrow layout at %ipx', (width) => {
    render(width);
    expect(container.querySelector('main')?.className).toContain('min-w-0');
    expect(container.querySelector('[role="tablist"]')?.className).toContain('overflow-x-auto');
    expect(preview().length).toBeGreaterThan(0);
    expect(container.querySelector('textarea')?.className).toContain('min-w-0');
    expect(container.querySelector('textarea')?.className).toContain('break-anywhere');
  });
});
