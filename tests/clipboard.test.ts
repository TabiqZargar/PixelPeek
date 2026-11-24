import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeClipboard } from '../src/panel/clipboard';

describe('writeClipboard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the async clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    await expect(writeClipboard('prompt')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('prompt');
  });

  it('falls back to execCommand when the API rejects', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;

    await expect(writeClipboard('prompt')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('reports denial', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
    document.execCommand = vi.fn().mockReturnValue(false);

    await expect(writeClipboard('prompt')).resolves.toBe(false);
  });
});
