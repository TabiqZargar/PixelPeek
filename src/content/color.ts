import type { ParsedColor } from '../shared/types';

interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function toHex(rgb: Rgb): string {
  const base = `#${[rgb.r, rgb.g, rgb.b]
    .map((value) => clampByte(value).toString(16).padStart(2, '0'))
    .join('')}`;
  if (rgb.a >= 1) return base;
  return `${base}${Math.round(rgb.a * 255).toString(16).padStart(2, '0')}`;
}

function toRgbString(rgb: Rgb): string {
  return rgb.a >= 1
    ? `rgb(${clampByte(rgb.r)}, ${clampByte(rgb.g)}, ${clampByte(rgb.b)})`
    : `rgba(${clampByte(rgb.r)}, ${clampByte(rgb.g)}, ${clampByte(rgb.b)}, ${round(rgb.a)})`;
}

function hueToChannel(p: number, q: number, t: number): number {
  let hue = t;
  if (hue < 0) hue += 1;
  if (hue > 1) hue -= 1;
  if (hue < 1 / 6) return p + (q - p) * 6 * hue;
  if (hue < 1 / 2) return q;
  if (hue < 2 / 3) return p + (q - p) * (2 / 3 - hue) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number, a: number): Rgb {
  if (s === 0) {
    const value = l * 255;
    return { r: value, g: value, b: value, a };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hueToChannel(p, q, h + 1 / 3) * 255,
    g: hueToChannel(p, q, h) * 255,
    b: hueToChannel(p, q, h - 1 / 3) * 255,
    a,
  };
}

function rgbToHsl(rgb: Rgb): string {
  const r = clampByte(rgb.r) / 255;
  const g = clampByte(rgb.g) / 255;
  const b = clampByte(rgb.b) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  let hue = 0;
  let saturation = 0;
  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  const parts = `${Math.round(hue)}, ${Math.round(saturation * 100)}%, ${Math.round(lightness * 100)}%`;
  return rgb.a >= 1 ? `hsl(${parts})` : `hsla(${parts}, ${round(rgb.a)})`;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function numberFromToken(token: string, percentageBase = 1): number | null {
  const trimmed = token.trim();
  if (trimmed.endsWith('%')) {
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? (parsed / 100) * percentageBase : null;
  }
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseHex(raw: string): Rgb | null {
  const match = /^#([\da-f]{3,8})$/i.exec(raw);
  if (!match) return null;
  const digits = match[1] ?? '';
  if (![3, 4, 6, 8].includes(digits.length)) return null;
  const expand = (value: string): number =>
    value.length === 1 ? Number.parseInt(value + value, 16) : Number.parseInt(value, 16);
  if (digits.length === 3 || digits.length === 4) {
    return {
      r: expand(digits[0] ?? '0'),
      g: expand(digits[1] ?? '0'),
      b: expand(digits[2] ?? '0'),
      a: digits.length === 4 ? expand(digits[3] ?? 'f') / 255 : 1,
    };
  }
  return {
    r: expand(digits.slice(0, 2)),
    g: expand(digits.slice(2, 4)),
    b: expand(digits.slice(4, 6)),
    a: digits.length === 8 ? expand(digits.slice(6, 8)) / 255 : 1,
  };
}

function splitArgs(content: string): string[] {
  const normalized = content.replace(/\s*\/\s*/g, ' / ').trim();
  return normalized.includes(',')
    ? normalized.split(',').map((part) => part.trim())
    : normalized.split(/\s+/).filter(Boolean);
}

function parseRgb(raw: string): Rgb | null {
  const match = /^rgba?\(([^)]+)\)$/i.exec(raw);
  if (!match) return null;
  const args = splitArgs(match[1] ?? '');
  if (args.length < 3) return null;
  const r = numberFromToken(args[0] ?? '', 255);
  const g = numberFromToken(args[1] ?? '', 255);
  const b = numberFromToken(args[2] ?? '', 255);
  if (r === null || g === null || b === null) return null;
  const alphaMatch = /\/\s*([^)]+)/.exec(match[1] ?? '');
  const alphaPart = alphaMatch ? alphaMatch[1] : args[3];
  const a = alphaPart === undefined ? 1 : numberFromToken(alphaPart);
  return { r, g, b, a: a === null ? 1 : Math.max(0, Math.min(1, a)) };
}

function parseHsl(raw: string): Rgb | null {
  const match = /^hsla?\(([^)]+)\)$/i.exec(raw);
  if (!match) return null;
  const args = splitArgs(match[1] ?? '');
  if (args.length < 3) return null;
  const hue = numberFromToken(args[0] ?? '');
  const saturation = numberFromToken(args[1] ?? '');
  const lightness = numberFromToken(args[2] ?? '');
  if (hue === null || saturation === null || lightness === null) return null;
  const alphaMatch = /\/\s*([^)]+)/.exec(match[1] ?? '');
  const alphaPart = alphaMatch ? alphaMatch[1] : args[3];
  const alpha = alphaPart === undefined ? 1 : numberFromToken(alphaPart);
  return hslToRgb(
    (((hue % 360) + 360) % 360) / 360,
    Math.max(0, Math.min(1, saturation)),
    Math.max(0, Math.min(1, lightness)),
    alpha === null ? 1 : Math.max(0, Math.min(1, alpha)),
  );
}

export function parseColor(raw: string): ParsedColor | null {
  const original = raw.trim();
  if (!original) return null;
  if (/^transparent$/i.test(original)) {
    const rgb: Rgb = { r: 0, g: 0, b: 0, a: 0 };
    return {
      original,
      hex: toHex(rgb),
      rgb: toRgbString(rgb),
      hsl: rgbToHsl(rgb),
      alpha: 0,
      supported: true,
    };
  }
  if (/^(oklch|oklab|lab|lch|color|color-mix)\(/i.test(original)) {
    return { original, hex: null, rgb: null, hsl: null, alpha: 1, supported: false };
  }
  const rgb = parseHex(original) ?? parseRgb(original) ?? parseHsl(original);
  if (!rgb) return null;
  return {
    original,
    hex: toHex(rgb),
    rgb: toRgbString(rgb),
    hsl: rgbToHsl(rgb),
    alpha: round(rgb.a),
    supported: true,
  };
}

export function findColorTokens(value: string): string[] {
  const matches =
    value.match(
      /#[\da-f]{3,8}\b|(?:rgba?|hsla?|oklch|oklab|lab|lch|color-mix|color)\([^)]*\)/gi,
    ) ?? [];
  return Array.from(new Set(matches.map((token) => token.trim()))).slice(0, 12);
}

export type ColorFormat = 'hex' | 'rgb' | 'hsl';

export function formatColor(parsed: ParsedColor, format: ColorFormat): string | null {
  if (!parsed.supported) return null;
  if (format === 'hex') return parsed.hex;
  if (format === 'rgb') return parsed.rgb;
  return parsed.hsl;
}
