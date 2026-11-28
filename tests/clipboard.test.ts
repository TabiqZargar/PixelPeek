import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeClipboard } from '../src/panel/clipboard';

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value,
  });
}

describe('writeClipboard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setClipboard(undefined);
    document.body.innerHTML = '';
  });

  it('uses the async clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });

    await expect(writeClipboard('prompt')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('prompt');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('falls back to execCommand when the API rejects', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;

    await expect(writeClipboard('prompt')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('falls back to execCommand when the API is unavailable', async () => {
    setClipboard(undefined);
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;

    await expect(writeClipboard('prompt')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('reports denial and removes the temporary textarea', async () => {
    setClipboard(undefined);
    document.execCommand = vi.fn().mockReturnValue(false);

    await expect(writeClipboard('prompt')).resolves.toBe(false);
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('resolves false and removes the temporary textarea when execCommand throws', async () => {
    setClipboard(undefined);
    document.execCommand = vi.fn(() => {
      throw new Error('copy blocked');
    });

    await expect(writeClipboard('prompt')).resolves.toBe(false);
    expect(document.querySelector('textarea')).toBeNull();
  });
});
