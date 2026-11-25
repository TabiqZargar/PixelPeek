import { sanitizeCssValue } from './css';
import { isValidTokenName, normalizeDesignValue } from './design-system';
import {
  DESIGN_SYSTEM_CATEGORIES,
  DESIGN_SYSTEM_LIMITS,
  type DesignDetectedValue,
  type DesignDetectedValues,
  type DesignSystemCategory,
  type DesignSystemSnapshot,
  type DesignTokenCandidate,
} from '../shared/types';

const CATEGORY_FIELDS: Record<DesignSystemCategory, keyof DesignDetectedValues> = {
  color: 'palette',
  typography: 'typography',
  spacing: 'spacing',
  effect: 'effects',
  gradient: 'gradients',
};

const EXPORT_HEADER = '/* PixelPeek inferred token names; verify against the source. */';

function safePropertyName(value: string): boolean {
  return isValidTokenName(value) && value.length <= DESIGN_SYSTEM_LIMITS.maxTokenNameLength;
}

function safeSourceProperty(value: string): boolean {
  return value.length > 0 &&
    value.length <= DESIGN_SYSTEM_LIMITS.maxPropertyNameLength &&
    /^(?:--)?[a-z][a-z0-9-]*$/.test(value);
}

function safeNote(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > DESIGN_SYSTEM_LIMITS.maxValueLength) return null;
  if (/[<>{};]/.test(trimmed)) return null;
  if (/(?:https?:|javascript:|data:)/i.test(trimmed)) return null;
  return trimmed;
}

function exportOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return 'https://invalid.local';
  }
}

function sortedTokens(snapshot: DesignSystemSnapshot): DesignTokenCandidate[] {
  return [...snapshot.tokens]
    .filter((token) => safePropertyName(token.inferredName))
    .sort((left, right) =>
      DESIGN_SYSTEM_CATEGORIES.indexOf(left.category) - DESIGN_SYSTEM_CATEGORIES.indexOf(right.category) ||
      left.inferredName.localeCompare(right.inferredName),
    );
}

function primaryValue(token: DesignTokenCandidate): string | null {
  for (const entry of token.detected.values) {
    const value = sanitizeCssValue(entry.value);
    if (value) return value;
  }
  return null;
}

export function serializeDesignSystemCss(
  snapshot: DesignSystemSnapshot,
  maxChars: number = DESIGN_SYSTEM_LIMITS.maxPayloadChars,
): string {
  const closing = '}';
  const rootOpen = ':root {';
  const limit = Math.max(0, Math.floor(maxChars));
  const minimal = ':root{}';
  if (limit < minimal.length) return '';
  if (limit < [rootOpen, closing].join('\n').length) return minimal;
  const declarations: string[] = [];
  const usedNames = new Set<string>();

  for (const token of sortedTokens(snapshot)) {
    if (usedNames.has(token.inferredName)) continue;
    const value = primaryValue(token);
    if (!value) continue;
    usedNames.add(token.inferredName);
    declarations.push(`  ${token.inferredName}: ${value};`);
  }

  const withHeader = [EXPORT_HEADER, rootOpen, ...declarations, closing];
  const withoutHeader = [rootOpen, ...declarations, closing];
  const base = withHeader.join('\n').length <= limit ? withHeader : withoutHeader;
  if (base.join('\n').length <= limit) return base.join('\n');

  const kept: string[] = [];
  for (const declaration of declarations) {
    const candidate = [...base.slice(0, 2), ...kept, declaration, closing];
    if (candidate.join('\n').length > limit) break;
    kept.push(declaration);
  }
  return [rootOpen, ...kept, closing].join('\n');
}

function sanitizeDetectedEntry(entry: DesignDetectedValue): DesignDetectedValue | null {
  const value = sanitizeCssValue(entry.value);
  const normalized = sanitizeCssValue(entry.normalized);
  if (!value || !normalized) return null;
  return {
    value,
    normalized,
    count: entry.count,
    sourceProperties: entry.sourceProperties.filter(safeSourceProperty),
  };
}

function sanitizeDetectedValues(detected: DesignDetectedValues): DesignDetectedValues {
  const result = {} as DesignDetectedValues;
  for (const category of DESIGN_SYSTEM_CATEGORIES) {
    const field = CATEGORY_FIELDS[category];
    result[field] = detected[field]
      .map(sanitizeDetectedEntry)
      .filter((entry): entry is DesignDetectedValue => entry !== null);
  }
  return result;
}

interface DesignSystemJsonExport {
  format: 'pixelpeek.design-system/v1';
  inferredNames: true;
  origin: string;
  capturedAt: string;
  summary: DesignSystemSnapshot['summary'];
  detected: DesignDetectedValues;
  tokens: Array<{
    name: string;
    inferred: true;
    nameBasis: DesignTokenCandidate['nameBasis'];
    category: DesignSystemCategory;
    support: number;
    values: string[];
    sourceProperties: string[];
    exemplarTags: string[];
  }>;
  unavailable: string[];
  limitations: string[];
}

function buildJsonExport(snapshot: DesignSystemSnapshot): DesignSystemJsonExport {
  const tokens = sortedTokens(snapshot).flatMap((token) => {
    const values = token.detected.values.flatMap((entry) => {
      const value = sanitizeCssValue(entry.value);
      return value ? [value] : [];
    });
    if (values.length === 0) return [];
    const sourceProperties = Array.from(new Set(
      token.detected.values.flatMap((entry) => entry.sourceProperties.filter(safeSourceProperty)),
    )).slice(0, DESIGN_SYSTEM_LIMITS.maxPropertiesPerElement);
    const exemplarTags = Array.from(new Set(
      token.detected.exemplars.map((entry) => entry.tag).filter((tag) => /^[a-z][a-z0-9-]*$/.test(tag)),
    )).slice(0, DESIGN_SYSTEM_LIMITS.maxExemplarsPerToken);
    return [{
      name: token.inferredName,
      inferred: true as const,
      nameBasis: token.nameBasis,
      category: token.category,
      support: token.detected.support,
      values,
      sourceProperties,
      exemplarTags,
    }];
  });

  return {
    format: 'pixelpeek.design-system/v1',
    inferredNames: true,
    origin: exportOrigin(snapshot.origin),
    capturedAt: snapshot.capturedAt,
    summary: snapshot.summary,
    detected: sanitizeDetectedValues(snapshot.detected),
    tokens,
    unavailable: snapshot.unavailable.flatMap((note) => {
      const safe = safeNote(note);
      return safe ? [safe] : [];
    }),
    limitations: snapshot.limitations.flatMap((note) => {
      const safe = safeNote(note);
      return safe ? [safe] : [];
    }),
  };
}

export function serializeDesignSystemJson(
  snapshot: DesignSystemSnapshot,
  maxChars: number = DESIGN_SYSTEM_LIMITS.maxPayloadChars,
): string {
  const limit = Math.max(0, Math.floor(maxChars));
  if (limit < 2) return '';
  const exported = buildJsonExport(snapshot);
  let text = JSON.stringify(exported, null, 2);

  while (text.length > limit && exported.tokens.length > 0) {
    exported.tokens.pop();
    text = JSON.stringify(exported, null, 2);
  }

  const reverseCategories = [...DESIGN_SYSTEM_CATEGORIES].reverse();
  for (const category of reverseCategories) {
    const field = CATEGORY_FIELDS[category];
    while (text.length > limit && exported.detected[field].length > 0) {
      exported.detected[field].pop();
      text = JSON.stringify(exported, null, 2);
    }
    if (text.length <= limit) break;
  }

  while (text.length > limit && exported.limitations.length > 0) {
    exported.limitations.pop();
    text = JSON.stringify(exported, null, 2);
  }
  while (text.length > limit && exported.unavailable.length > 0) {
    exported.unavailable.pop();
    text = JSON.stringify(exported, null, 2);
  }

  if (text.length <= limit) return text;
  const fallback = JSON.stringify({ format: exported.format, inferredNames: true });
  return fallback.length <= limit ? fallback : '{}';
}

function readableValue(raw: string): string {
  return sanitizeCssValue(raw) ?? normalizeDesignValue(raw, 'effect')?.value ?? '[unreadable]';
}

export function serializeDesignSystemPrompt(
  snapshot: DesignSystemSnapshot,
  maxChars: number = DESIGN_SYSTEM_LIMITS.maxPayloadChars,
): string {
  const lines: string[] = [
    'PixelPeek design system summary',
    'Token names below are PixelPeek suggestions, not authored names.',
    `Origin: ${exportOrigin(snapshot.origin)}`,
    `Elements scanned: ${snapshot.summary.elementsScanned}; skipped: ${snapshot.summary.elementsSkipped}`,
    `Typography elements inspected: ${snapshot.summary.textElementsInspected}`,
    `Stylesheets readable: ${snapshot.summary.stylesheetsReadable}; inaccessible: ${snapshot.summary.stylesheetsInaccessible}`,
    '',
    'Detected values:',
  ];

  for (const category of DESIGN_SYSTEM_CATEGORIES) {
    const field = CATEGORY_FIELDS[category];
    lines.push(`${category}:`);
    const entries = snapshot.detected[field].slice(0, DESIGN_SYSTEM_LIMITS.maxDetectedValuesPerCategory);
    if (entries.length === 0) lines.push('  none');
    for (const entry of entries) {
      lines.push(`  ${readableValue(entry.value)} (${entry.count} uses)`);
    }
  }

  lines.push('', 'Reusable token candidates (minimum support 2):');
  const tokens = sortedTokens(snapshot);
  if (tokens.length === 0) lines.push('  none');
  for (const token of tokens) {
    const value = primaryValue(token);
    if (!value) continue;
    lines.push(`  ${token.inferredName}: ${value} (${token.detected.support} uses, ${token.nameBasis})`);
  }

  const limit = Math.max(0, Math.floor(maxChars));
  const full = lines.join('\n');
  if (full.length <= limit) return full;

  const kept: string[] = [];
  for (const line of lines) {
    const candidate = [...kept, line].join('\n');
    if (candidate.length > limit) {
      if (kept.length === 0) return line.slice(0, limit);
      break;
    }
    kept.push(line);
  }
  const suffix = '\n... truncated ...';
  const truncated = `${kept.join('\n')}${suffix}`;
  return truncated.length <= limit ? truncated : kept.join('\n');
}
