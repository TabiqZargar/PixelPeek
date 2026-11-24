import type { GradientInfo, GradientStop } from '../shared/types';

function splitTopLevel(value: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === ',' && depth === 0) {
      result.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  result.push(value.slice(start).trim());
  return result.filter(Boolean);
}

function truncate(value: string): string {
  return value.length > 240 ? `${value.slice(0, 237)}...` : value;
}

function parseStop(raw: string): GradientStop | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = /^(.*?)\s+(-?\d+(?:\.\d+)?(?:%|px|em|rem))\s*$/i.exec(trimmed);
  if (match) {
    return { color: truncate(match[1] ?? ''), position: match[2] ?? null };
  }
  return { color: truncate(trimmed), position: null };
}

export function extractGradients(backgroundImage: string | null | undefined): GradientInfo[] {
  if (!backgroundImage || !backgroundImage.trim() || backgroundImage.trim() === 'none') return [];
  const result: GradientInfo[] = [];
  for (const layer of splitTopLevel(backgroundImage)) {
    const match =
      /^(?:(repeating-)?(linear|radial|conic)-gradient)\((.*)\)$/is.exec(layer);
    if (!match) continue;
    const kind = (match[2] ?? 'unknown') as GradientInfo['kind'];
    const inner = match[3] ?? '';
    const parts = splitTopLevel(inner);
    let direction: string | null = null;
    let stopParts = parts;
    const first = parts[0] ?? '';
    if (
      kind === 'linear' &&
      (/\bdeg\b/i.test(first) || /^to\s/i.test(first) || /turn|rad|grad/i.test(first))
    ) {
      direction = truncate(first);
      stopParts = parts.slice(1);
    } else if (kind === 'radial' && /^at\s/i.test(first)) {
      direction = truncate(first);
      stopParts = parts.slice(1);
    } else if (kind === 'conic' && /^from\s/i.test(first)) {
      direction = truncate(first);
      stopParts = parts.slice(1);
    }
    const stops = stopParts
      .map(parseStop)
      .filter((stop): stop is GradientStop => stop !== null && stop.color.length > 0);
    if (!stops.length) continue;
    result.push({
      property: 'background-image',
      raw: truncate(layer),
      kind,
      direction,
      stops,
    });
  }
  return result;
}
