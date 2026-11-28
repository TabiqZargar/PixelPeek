import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadText } from '../src/panel/download';

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
const createObjectURL = vi.fn((_blob: Blob) => 'blob:test');
const revokeObjectURL = vi.fn();

let clickedAnchor: HTMLAnchorElement | null;
let clickSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  clickedAnchor = null;
  createObjectURL.mockReset();
  revokeObjectURL.mockReset();
  createObjectURL.mockReturnValue('blob:test');
  URL.createObjectURL = createObjectURL as typeof URL.createObjectURL;
  URL.revokeObjectURL = revokeObjectURL as typeof URL.revokeObjectURL;
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clickedAnchor = this;
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

describe('downloadText', () => {
  it('uses the export filename and MIME type and revokes the object URL', () => {
    expect(downloadText('design-tokens.css', 'text/css', ':root {}')).toBe(true);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect((createObjectURL.mock.calls[0]?.[0] as Blob).type).toBe('text/css');
    expect(clickedAnchor?.download).toBe('design-tokens.css');
    expect(clickedAnchor?.getAttribute('href')).toBe('blob:test');
    expect(clickedAnchor?.rel).toBe('noopener');
    expect(clickedAnchor?.parentElement).toBeNull();
    expect(document.querySelector('a')).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });

  it('reports failure without leaving a temporary element behind', () => {
    createObjectURL.mockImplementationOnce(() => {
      throw new Error('blocked');
    });

    expect(downloadText('blueprint.json', 'application/json', '{}')).toBe(false);
    expect(clickSpy).not.toHaveBeenCalled();
    expect(document.querySelector('a')).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });
});
