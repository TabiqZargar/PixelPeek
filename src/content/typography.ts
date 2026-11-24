import type { TypographyInfo, TypographyValue } from '../shared/types';
import type { StyleReader } from './box-model';

const TYPOGRAPHY_PROPERTIES = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'text-align',
  'text-transform',
  'text-decoration',
  'color',
  'white-space',
] as const;

type TypographyKey = keyof TypographyInfo;

function keyFor(property: (typeof TYPOGRAPHY_PROPERTIES)[number]): TypographyKey {
  const parts = property.split('-');
  return parts
    .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('') as TypographyKey;
}

function normalize(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > 240 ? `${trimmed.slice(0, 237)}...` : trimmed;
}

export function extractTypography(
  read: StyleReader,
  readParent: StyleReader | null,
): TypographyInfo {
  const result = {} as TypographyInfo;
  for (const property of TYPOGRAPHY_PROPERTIES) {
    const value = normalize(read(property));
    const parentValue = readParent ? normalize(readParent(property)) : null;
    const entry: TypographyValue = {
      value,
      matchesParent: Boolean(value && parentValue && value === parentValue),
    };
    result[keyFor(property)] = entry;
  }
  return result;
}

export function typographyCss(typography: TypographyInfo): string {
  const properties: Array<[string, TypographyValue]> = [
    ['font-family', typography.fontFamily],
    ['font-size', typography.fontSize],
    ['font-weight', typography.fontWeight],
    ['font-style', typography.fontStyle],
    ['line-height', typography.lineHeight],
    ['letter-spacing', typography.letterSpacing],
    ['word-spacing', typography.wordSpacing],
    ['text-align', typography.textAlign],
    ['text-transform', typography.textTransform],
    ['text-decoration', typography.textDecoration],
    ['color', typography.color],
    ['white-space', typography.whiteSpace],
  ];
  return properties
    .filter(([, entry]) => Boolean(entry.value))
    .map(([name, entry]) => `${name}: ${entry.value};`)
    .join('\n');
}
