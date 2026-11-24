import type { BoxModel, Dimensions, Edges } from '../shared/types';

export type StyleReader = (property: string) => string;

export function parseLength(value: string | null | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  const match = /^(-?\d+(?:\.\d+)?)px$/i.exec(trimmed);
  if (!match) return null;
  const parsed = Number.parseFloat(match[1] ?? '');
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function readEdges(read: StyleReader, prefix: 'margin' | 'border' | 'padding'): Edges {
  const side = (name: string): string | null => {
    const property = prefix === 'border' ? `border-${name}-width` : `${prefix}-${name}`;
    const value = read(property).trim();
    return value || null;
  };
  return {
    top: side('top'),
    right: side('right'),
    bottom: side('bottom'),
    left: side('left'),
  };
}

function sumPair(first: string | null, second: string | null): number | null {
  const a = parseLength(first);
  const b = parseLength(second);
  if (a === null || b === null) return null;
  return a + b;
}

export function computeBoxModel(
  read: StyleReader,
  measured: Dimensions,
  display: string | null,
): BoxModel {
  const boxSizing = read('box-sizing').trim() || null;
  const computedWidth = read('width').trim() || null;
  const computedHeight = read('height').trim() || null;
  const margin = readEdges(read, 'margin');
  const border = readEdges(read, 'border');
  const padding = readEdges(read, 'padding');
  const paddingX = sumPair(padding.left, padding.right);
  const paddingY = sumPair(padding.top, padding.bottom);
  const borderX = sumPair(border.left, border.right);
  const borderY = sumPair(border.top, border.bottom);
  const width = parseLength(computedWidth);
  const height = parseLength(computedHeight);
  const horizontalExtra = paddingX !== null && borderX !== null ? paddingX + borderX : null;
  const verticalExtra = paddingY !== null && borderY !== null ? paddingY + borderY : null;
  const estimatedOuter =
    width !== null && height !== null && horizontalExtra !== null && verticalExtra !== null
      ? {
          width: Math.round((width + horizontalExtra) * 100) / 100,
          height: Math.round((height + verticalExtra) * 100) / 100,
        }
      : null;

  const notes: string[] = [];
  if (display?.trim().toLowerCase().startsWith('inline')) {
    notes.push('Inline layout: computed width and height may be auto or approximate.');
  }
  if (width === null || height === null) {
    notes.push('Computed width or height is not a pixel length; only measured dimensions are exact.');
  }
  if (!border.top || parseLength(border.top) === null) {
    notes.push('Border widths include non-pixel values; totals may be incomplete.');
  }
  if (
    estimatedOuter &&
    (Math.abs(estimatedOuter.width - measured.width) > 1 ||
      Math.abs(estimatedOuter.height - measured.height) > 1)
  ) {
    notes.push('Measured size differs from the computed box total; transforms or layout may affect it.');
  }
  notes.push('Measured dimensions come from getBoundingClientRect and include borders and transforms.');
  notes.push('Computed width and height are the used content-box values reported by getComputedStyle.');

  return {
    boxSizing,
    computedWidth,
    computedHeight,
    measured,
    contentWidth: width,
    contentHeight: height,
    estimatedOuter,
    margin,
    border,
    padding,
    notes,
  };
}
