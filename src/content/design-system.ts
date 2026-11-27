import { parseColor } from './color';
import { sanitizeCssValue } from './css';
import {
  DESIGN_SYSTEM_CATEGORIES,
  DESIGN_SYSTEM_LIMITS,
  type DesignDetectedValue,
  type DesignDetectedValues,
  type DesignExemplar,
  type DesignSystemCategory,
  type DesignSystemSnapshot,
  type DesignTokenCandidate,
} from '../shared/types';

export type DesignSystemLimits = {
  [Key in keyof typeof DESIGN_SYSTEM_LIMITS]: number;
};

export const BLUEPRINT_LAYOUT_PROPERTIES = [
  'display',
  'visibility',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'z-index',
  'min-width',
  'max-width',
  'align-items',
  'align-self',
  'justify-content',
  'justify-self',
  'text-align',
  'row-gap',
  'column-gap',
  'gap',
  'flex-direction',
  'flex-wrap',
  'grid-template-columns',
  'grid-template-rows',
  'grid-row-gap',
  'grid-column-gap',
] as const;

export const DESIGN_SYSTEM_PROPERTIES = [
  'color',
  'background-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'padding-top',
  'padding-bottom',
  'margin-top',
  'margin-bottom',
  'row-gap',
  'column-gap',
  'gap',
  'width',
  'height',
  'border-radius',
  'box-shadow',
  'border',
  'border-width',
  'border-style',
  'border-top-width',
  'border-top-style',
  'outline',
  'outline-width',
  'outline-style',
  'opacity',
  'background-image',
] as const;

const DESIGN_SAMPLE_PROPERTIES = [...DESIGN_SYSTEM_PROPERTIES, ...BLUEPRINT_LAYOUT_PROPERTIES] as const;

const CATEGORY_FIELDS: Record<DesignSystemCategory, keyof DesignDetectedValues> = {
  color: 'palette',
  typography: 'typography',
  spacing: 'spacing',
  effect: 'effects',
  gradient: 'gradients',
};

const COLOR_PROPERTIES = new Set([
  'color',
  'background-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
]);

const TYPOGRAPHY_PROPERTIES = new Set([
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
]);

const SPACING_PROPERTIES = new Set([
  'padding-top',
  'padding-bottom',
  'margin-top',
  'margin-bottom',
  'row-gap',
  'column-gap',
  'gap',
  'width',
  'height',
]);

const EFFECT_PROPERTIES = new Set([
  'border-radius',
  'box-shadow',
  'border',
  'border-width',
  'border-style',
  'border-top-width',
  'border-top-style',
  'outline',
  'outline-width',
  'outline-style',
  'opacity',
]);

const TEXT_RENDERING_TAGS = new Set([
  'a',
  'b',
  'blockquote',
  'button',
  'caption',
  'code',
  'dd',
  'div',
  'dt',
  'em',
  'figcaption',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'i',
  'label',
  'li',
  'p',
  'pre',
  'q',
  'small',
  'span',
  'strong',
  'summary',
  'td',
  'th',
  'time',
]);

const SENSITIVE_FORM_TAGS = new Set(['input', 'textarea', 'select']);

const IGNORED_VALUES = new Set(['auto', 'none', 'normal']);

export interface DesignElementMeta {
  tag: string;
  roleHint: string | null;
  selector: string;
  hidden: boolean;
  iframe: boolean;
  shadowRoot: boolean;
  formControl: boolean;
  textRendering: boolean;
}

export interface DesignElementGeometry {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

export interface DesignSampleDeps {
  children: (node: unknown) => readonly unknown[];
  meta: (node: unknown) => DesignElementMeta;
  geometry: (node: unknown) => DesignElementGeometry;
  computedStyle: (
    node: unknown,
    properties: readonly string[],
  ) => Readonly<Record<string, string>>;
}

export interface SampledDesignElement {
  node: unknown;
  parentNode: unknown;
  tag: string;
  roleHint: string | null;
  selector: string;
  textRendering: boolean;
  depth: number;
  geometry: DesignElementGeometry;
  style: Record<string, string>;
}

export interface DesignSamplingResult {
  elements: SampledDesignElement[];
  skipped: number;
  notes: string[];
}

export interface DesignStylesheetRule {
  selector?: string | null;
  declarations: ReadonlyArray<readonly [string, string]>;
}

export interface DesignStylesheetRecord {
  accessible: boolean;
  rules: ReadonlyArray<DesignStylesheetRule>;
}

export interface DesignSystemDeps {
  sample: DesignSampleDeps;
  readStylesheets: () => ReadonlyArray<DesignStylesheetRecord>;
  now: () => string;
  origin: () => string;
  limits?: Partial<DesignSystemLimits>;
}

export type DesignSystemSnapshotDeps = Omit<DesignSystemDeps, 'sample'>;

type DetectedMaps = Record<DesignSystemCategory, Map<string, DesignDetectedValue>>;
type SeenValues = Record<DesignSystemCategory, Set<string>>;
type CustomNameMaps = Record<DesignSystemCategory, Map<string, string>>;

function resolveLimits(overrides?: Partial<DesignSystemLimits>): DesignSystemLimits {
  return { ...DESIGN_SYSTEM_LIMITS, ...overrides };
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : null;
}

function safeTag(value: unknown): string {
  const tag = boundedText(value, DESIGN_SYSTEM_LIMITS.maxTagLength)?.toLowerCase() ?? '';
  return /^[a-z][a-z0-9-]*$/.test(tag) ? tag : '';
}

export function isValidTokenName(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= DESIGN_SYSTEM_LIMITS.maxTokenNameLength &&
    /^--[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function sanitizeRoleHint(value: unknown, limits: DesignSystemLimits): string | null {
  const hint = boundedText(value, limits.maxTagLength)?.toLowerCase() ?? null;
  return hint && /^[a-z][a-z0-9 -]*$/.test(hint) ? hint : null;
}

function sanitizeSelector(value: unknown, tag: string, limits: DesignSystemLimits): string {
  const fallback = tag || '*';
  const raw = boundedText(value, limits.maxSelectorLength);
  if (!raw) return fallback;
  if (/[<>{};\[\]\\]/.test(raw)) return fallback;
  if (/(?:url|expression)\s*\(/i.test(raw)) return fallback;
  if (/(?:data:|javascript:)/i.test(raw)) return fallback;
  if (raw.includes('#')) return fallback;
  if ((raw.match(/\./g) ?? []).length > 2) return fallback;
  return raw;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function isGradientValue(value: string): boolean {
  return /^(?:linear|radial|conic)-gradient\(/i.test(value);
}

function classifyProperty(property: string): DesignSystemCategory | null {
  if (COLOR_PROPERTIES.has(property)) return 'color';
  if (TYPOGRAPHY_PROPERTIES.has(property)) return 'typography';
  if (SPACING_PROPERTIES.has(property)) return 'spacing';
  if (EFFECT_PROPERTIES.has(property)) return 'effect';
  if (property === 'background-image') return 'gradient';
  return null;
}

export function normalizeDesignValue(
  raw: string,
  category: DesignSystemCategory,
  limits: DesignSystemLimits = resolveLimits(),
): { value: string; normalized: string } | null {
  const value = sanitizeCssValue(raw);
  if (!value || value.length > limits.maxValueLength) return null;
  let normalized = normalizeWhitespace(value);
  if (IGNORED_VALUES.has(normalized)) return null;
  if (category === 'color') {
    const parsed = parseColor(value);
    if (parsed?.hex) normalized = parsed.hex.toLowerCase();
    else if (parsed?.rgb) normalized = normalizeWhitespace(parsed.rgb);
  }
  if (category === 'gradient' && !isGradientValue(value)) return null;
  return { value, normalized };
}

function readStyleValues(
  raw: Readonly<Record<string, string>>,
  properties: readonly string[],
  limits: DesignSystemLimits,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const property of properties) {
    const value = sanitizeCssValue(raw[property] ?? null);
    if (value && value.length <= limits.maxValueLength) result[property] = value;
  }
  return result;
}

export function sampleDesignSystemElements(
  root: unknown,
  deps: DesignSampleDeps,
  overrides: Partial<DesignSystemLimits> = {},
): DesignSamplingResult {
  const limits = resolveLimits(overrides);
  const elements: SampledDesignElement[] = [];
  const notes: string[] = [];
  const queue: Array<{ node: unknown; parent: unknown; depth: number }> = root === null || root === undefined
    ? []
    : [{ node: root, parent: null, depth: 0 }];
  let skipped = 0;
  let elementLimitReported = false;
  let depthLimitReported = false;
  let childLimitReported = false;

  for (let index = 0; index < queue.length; index += 1) {
    const { node, parent, depth } = queue[index]!;
    if (elements.length >= limits.maxElements) {
      if (!elementLimitReported) {
        notes.push(`Element limit reached (${limits.maxElements} elements).`);
        elementLimitReported = true;
      }
      break;
    }

    const meta = deps.meta(node);
    const tag = safeTag(meta.tag);
    const roleHint = sanitizeRoleHint(meta.roleHint, limits);
    const selector = sanitizeSelector(meta.selector, tag, limits);
    const sensitive = meta.iframe || meta.shadowRoot || meta.formControl || SENSITIVE_FORM_TAGS.has(tag);
    if (sensitive) {
      skipped += 1;
      if (meta.iframe && !notes.includes('Iframes are excluded in v1.')) {
        notes.push('Iframes are excluded in v1.');
      }
      if (meta.shadowRoot && !notes.includes('Shadow roots are excluded in v1.')) {
        notes.push('Shadow roots are excluded in v1.');
      }
      if ((meta.formControl || SENSITIVE_FORM_TAGS.has(tag)) &&
        !notes.includes('Form controls are excluded by design-system extraction.')) {
        notes.push('Form controls are excluded by design-system extraction.');
      }
      continue;
    }

    const geometry = deps.geometry(node);
    const width = Number.isFinite(geometry.width) ? geometry.width : 0;
    const height = Number.isFinite(geometry.height) ? geometry.height : 0;
    if (meta.hidden || width <= 0 || height <= 0) {
      skipped += 1;
      continue;
    }

    const style = readStyleValues(
      deps.computedStyle(node, DESIGN_SAMPLE_PROPERTIES),
      DESIGN_SAMPLE_PROPERTIES,
      limits,
    );
    if (style.display === 'none' || style.visibility === 'hidden' ||
      style.visibility === 'collapse' || style.opacity === '0') {
      skipped += 1;
      continue;
    }

    elements.push({
      node,
      parentNode: parent,
      tag,
      roleHint,
      selector,
      textRendering: meta.textRendering || TEXT_RENDERING_TAGS.has(tag),
      depth,
      geometry: {
        x: Number.isFinite(geometry.x) ? geometry.x : 0,
        y: Number.isFinite(geometry.y) ? geometry.y : 0,
        width,
        height,
      },
      style,
    });

    const children = deps.children(node) ?? [];
    if (depth >= limits.maxDepth) {
      if (children.length > 0 && !depthLimitReported) {
        notes.push(`Depth limit reached (${limits.maxDepth} levels).`);
        depthLimitReported = true;
      }
      continue;
    }
    if (children.length > limits.maxChildrenPerNode && !childLimitReported) {
      notes.push(`Child limit reached (${limits.maxChildrenPerNode} children per element).`);
      childLimitReported = true;
    }
    for (const child of children.slice(0, limits.maxChildrenPerNode)) {
      queue.push({ node: child, parent: node, depth: depth + 1 });
    }
  }

  return {
    elements,
    skipped: Math.min(skipped, limits.maxElements),
    notes,
  };
}

function createDetectedMaps(): DetectedMaps {
  return {
    color: new Map(),
    typography: new Map(),
    spacing: new Map(),
    effect: new Map(),
    gradient: new Map(),
  };
}

function createSeenValues(): SeenValues {
  return {
    color: new Set(),
    typography: new Set(),
    spacing: new Set(),
    effect: new Set(),
    gradient: new Set(),
  };
}

function createCustomNameMaps(): CustomNameMaps {
  return {
    color: new Map(),
    typography: new Map(),
    spacing: new Map(),
    effect: new Map(),
    gradient: new Map(),
  };
}

function addExemplar(
  map: Map<string, DesignExemplar[]>,
  category: DesignSystemCategory,
  normalized: string,
  element: SampledDesignElement,
  limits: DesignSystemLimits,
): void {
  const key = `${category}:${normalized}`;
  const exemplars = map.get(key) ?? [];
  const candidate: DesignExemplar = {
    tag: element.tag || 'div',
    roleHint: element.roleHint,
    selector: element.selector,
  };
  const duplicate = exemplars.some((entry) =>
    entry.tag === candidate.tag && entry.roleHint === candidate.roleHint &&
    entry.selector === candidate.selector,
  );
  if (!duplicate && exemplars.length < limits.maxExemplarsPerToken) exemplars.push(candidate);
  map.set(key, exemplars);
}

function addDetectedValue(
  detected: DetectedMaps,
  seen: SeenValues,
  exemplars: Map<string, DesignExemplar[]>,
  element: SampledDesignElement,
  property: string,
  raw: string,
  limits: DesignSystemLimits,
): void {
  const category = classifyProperty(property);
  if (!category) return;
  const parsed = normalizeDesignValue(raw, category, limits);
  if (!parsed) return;

  const values = detected[category];
  let entry = values.get(parsed.normalized);
  if (!entry) {
    entry = {
      value: parsed.value,
      normalized: parsed.normalized,
      count: 0,
      sourceProperties: [],
    };
    values.set(parsed.normalized, entry);
  }
  if (entry.sourceProperties.length < limits.maxPropertiesPerElement &&
    !entry.sourceProperties.includes(property)) {
    entry.sourceProperties.push(property);
  }
  if (seen[category].has(parsed.normalized)) return;
  seen[category].add(parsed.normalized);
  entry.count += 1;
  addExemplar(exemplars, category, parsed.normalized, element, limits);
}

function sortDetectedValues(
  detected: DetectedMaps,
  notes: string[],
  limits: DesignSystemLimits,
): void {
  for (const category of DESIGN_SYSTEM_CATEGORIES) {
    const values = detected[category];
    const sorted = Array.from(values.values()).sort((left, right) =>
      right.count - left.count ||
      left.normalized.localeCompare(right.normalized) ||
      left.value.localeCompare(right.value),
    );
    values.clear();
    for (const entry of sorted) values.set(entry.normalized, entry);
    if (values.size > limits.maxDetectedValuesPerCategory) {
      const removed = values.size - limits.maxDetectedValuesPerCategory;
      for (const key of Array.from(values.keys()).slice(limits.maxDetectedValuesPerCategory)) {
        values.delete(key);
      }
      notes.push(
        `Detected ${category} value limit reached (${removed} values omitted at ${limits.maxDetectedValuesPerCategory}).`,
      );
    }
  }
}

function looksLikeCustomValue(category: DesignSystemCategory, value: string): boolean {
  if (category === 'color') {
    return parseColor(value) !== null || /^(?:oklch|oklab|lab|lch|color|color-mix)\(/i.test(value);
  }
  if (category === 'spacing') {
    return /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|%|vw|vh|ch)$/i.test(value);
  }
  if (category === 'typography') {
    return /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em)?$/i.test(value) ||
      /^(?:normal|bold|bolder|lighter|[1-9]00)$/i.test(value) ||
      /^(?:serif|sans-serif|monospace|system-ui|cursive|fantasy)$/i.test(value) ||
      value.includes(',');
  }
  if (category === 'gradient') return isGradientValue(value);
  return /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|%)$/i.test(value) ||
    /^(?:none|solid|dashed|dotted|double)$/i.test(value) ||
    /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/i.test(value);
}

function classifyCustomValue(
  value: string,
  limits: DesignSystemLimits,
): { category: DesignSystemCategory; normalized: string } | null {
  for (const category of DESIGN_SYSTEM_CATEGORIES) {
    if (!looksLikeCustomValue(category, value)) continue;
    const parsed = normalizeDesignValue(value, category, limits);
    if (parsed) return { category, normalized: parsed.normalized };
  }
  return null;
}

function readStylesheetEvidence(
  records: ReadonlyArray<DesignStylesheetRecord>,
  limits: DesignSystemLimits,
): { readable: number; inaccessible: number; customNames: CustomNameMaps; notes: string[] } {
  const readable = 0;
  let inaccessible = 0;
  let ruleCount = 0;
  const notes: string[] = [];
  const customNames = createCustomNameMaps();
  const scoped = records.slice(0, limits.maxStylesheets);

  if (records.length > limits.maxStylesheets) {
    notes.push(`Stylesheet limit reached (${limits.maxStylesheets} stylesheets).`);
  }

  for (const record of scoped) {
    if (!record.accessible) {
      inaccessible += 1;
      continue;
    }
    for (const rule of record.rules) {
      if (ruleCount >= limits.maxCssRules) {
        notes.push(`CSS rule limit reached (${limits.maxCssRules} rules).`);
        break;
      }
      ruleCount += 1;
      let declarationCount = 0;
      for (const [name, raw] of rule.declarations) {
        if (declarationCount >= limits.maxDeclarationsPerRule) {
          notes.push(`Declaration limit reached (${limits.maxDeclarationsPerRule} per rule).`);
          break;
        }
        declarationCount += 1;
        if (!name.startsWith('--')) continue;
        const propertyName = name.trim();
        if (!isValidTokenName(propertyName)) continue;
        const value = sanitizeCssValue(raw);
        if (!value || /var\s*\(/i.test(value)) continue;
        const classified = classifyCustomValue(value, limits);
        if (!classified) continue;
        const names = customNames[classified.category];
        if (!names.has(classified.normalized)) names.set(classified.normalized, propertyName);
      }
    }
    if (notes.includes(`CSS rule limit reached (${limits.maxCssRules} rules).`)) continue;
  }

  return { readable: readable + scoped.filter((record) => record.accessible).length, inaccessible, customNames, notes };
}

function truncateTokenName(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const trimmed = value.slice(0, maxLength).replace(/-+$/g, '');
  return isValidTokenName(trimmed) ? trimmed : '--token';
}

function buildTokenName(
  category: DesignSystemCategory,
  normalized: string,
  rank: number,
  limits: DesignSystemLimits,
): string {
  const slug = normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .filter(Boolean)
    .slice(0, 6)
    .join('-') || `value-${rank}`;
  return truncateTokenName(`--${category}-${slug}`, limits.maxTokenNameLength);
}

function uniqueTokenName(
  base: string,
  used: Set<string>,
  limits: DesignSystemLimits,
): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let suffix = 2;
  let candidate = base;
  while (used.has(candidate)) {
    const marker = `-${suffix}`;
    candidate = `${truncateTokenName(base, limits.maxTokenNameLength - marker.length)}${marker}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function buildTokens(
  detected: DetectedMaps,
  exemplars: Map<string, DesignExemplar[]>,
  customNames: CustomNameMaps,
  limits: DesignSystemLimits,
  notes: string[],
): DesignTokenCandidate[] {
  const tokens: DesignTokenCandidate[] = [];
  const usedNames = new Set<string>();
  let categoryLimitReported = false;

  for (const category of DESIGN_SYSTEM_CATEGORIES) {
    let categoryCount = 0;
    for (const entry of detected[category].values()) {
      if (entry.count < limits.minTokenSupport) continue;
      if (categoryCount >= limits.maxTokensPerCategory) {
        if (!categoryLimitReported) {
          notes.push(`Token limit reached (${limits.maxTokensPerCategory} per category).`);
          categoryLimitReported = true;
        }
        break;
      }
      if (tokens.length >= limits.maxTotalTokens) {
        notes.push(`Token limit reached (${limits.maxTotalTokens} total tokens).`);
        return tokens;
      }

      const originalName = customNames[category].get(entry.normalized);
      const base = isValidTokenName(originalName)
        ? originalName
        : buildTokenName(category, entry.normalized, categoryCount + 1, limits);
      const inferredName = uniqueTokenName(base, usedNames, limits);
      tokens.push({
        id: `${category}-${tokens.length + 1}`,
        category,
        inferredName,
        nameBasis: isValidTokenName(originalName) ? 'heuristic' : 'rank',
        detected: {
          values: [entry],
          exemplars: exemplars.get(`${category}:${entry.normalized}`) ?? [],
          support: entry.count,
        },
      });
      categoryCount += 1;
    }
  }

  return tokens;
}

function safeOrigin(value: unknown): string {
  const raw = boundedText(value, DESIGN_SYSTEM_LIMITS.maxValueLength);
  if (!raw) return 'https://invalid.local';
  try {
    return new URL(raw).origin;
  } catch {
    return 'https://invalid.local';
  }
}

function collectedNotes(notes: string[], limits: DesignSystemLimits): string[] {
  const defaults = [
    'Inferred token names are PixelPeek suggestions, not authored names.',
    'Only visible same-document elements were sampled. Iframes and shadow roots are excluded in v1.',
    'Computed values may not preserve authored custom-property aliases.',
  ];
  return Array.from(new Set([...notes, ...defaults])).slice(0, limits.maxNotes);
}

function enforcePayloadLimit(
  snapshot: DesignSystemSnapshot,
  limits: DesignSystemLimits,
  notes: string[],
): DesignSystemSnapshot {
  if (JSON.stringify(snapshot).length <= limits.maxPayloadChars) return snapshot;

  const payloadNotes = [...notes, `Payload limit reached (${limits.maxPayloadChars} characters).`];
  let next: DesignSystemSnapshot = {
    ...snapshot,
    limitations: collectedNotes(payloadNotes, limits),
  };

  while (next.tokens.length > 0 && JSON.stringify(next).length > limits.maxPayloadChars) {
    next = { ...next, tokens: next.tokens.slice(0, -1) };
  }

  const reverseCategories = [...DESIGN_SYSTEM_CATEGORIES].reverse();
  for (const category of reverseCategories) {
    const field = CATEGORY_FIELDS[category];
    while (next.detected[field].length > 0 && JSON.stringify(next).length > limits.maxPayloadChars) {
      next = {
        ...next,
        detected: {
          ...next.detected,
          [field]: next.detected[field].slice(0, -1),
        },
      };
    }
    if (JSON.stringify(next).length <= limits.maxPayloadChars) break;
  }

  while (next.unavailable.length > 0 && JSON.stringify(next).length > limits.maxPayloadChars) {
    next = { ...next, unavailable: next.unavailable.slice(0, -1) };
  }
  while (next.limitations.length > 0 && JSON.stringify(next).length > limits.maxPayloadChars) {
    next = { ...next, limitations: next.limitations.slice(0, -1) };
  }
  return next;
}

export function buildDesignSystemSnapshotFromSample(
  requestId: string,
  sampled: DesignSamplingResult,
  deps: DesignSystemSnapshotDeps,
): DesignSystemSnapshot {
  const limits = resolveLimits(deps.limits);
  const notes = [...sampled.notes];
  const detected = createDetectedMaps();
  const exemplars = new Map<string, DesignExemplar[]>();
  let textElementsInspected = 0;

  for (const element of sampled.elements) {
    const seen = createSeenValues();
    if (element.textRendering) textElementsInspected += 1;
    for (const property of DESIGN_SYSTEM_PROPERTIES) {
      const raw = element.style[property];
      if (!raw) continue;
      addDetectedValue(detected, seen, exemplars, element, property, raw, limits);
    }
  }

  sortDetectedValues(detected, notes, limits);
  const stylesheetEvidence = readStylesheetEvidence(deps.readStylesheets(), limits);
  notes.push(...stylesheetEvidence.notes);
  const tokens = buildTokens(
    detected,
    exemplars,
    stylesheetEvidence.customNames,
    limits,
    notes,
  );

  const detectedValues: DesignDetectedValues = {
    palette: Array.from(detected.color.values()),
    typography: Array.from(detected.typography.values()),
    spacing: Array.from(detected.spacing.values()),
    effects: Array.from(detected.effect.values()),
    gradients: Array.from(detected.gradient.values()),
  };
  const unavailable = stylesheetEvidence.inaccessible > 0
    ? [`${stylesheetEvidence.inaccessible} inaccessible stylesheet(s) were skipped.`]
    : [];
  const tokensByCategory = {
    color: tokens.filter((token) => token.category === 'color').length,
    typography: tokens.filter((token) => token.category === 'typography').length,
    spacing: tokens.filter((token) => token.category === 'spacing').length,
    effect: tokens.filter((token) => token.category === 'effect').length,
    gradient: tokens.filter((token) => token.category === 'gradient').length,
  };

  const snapshot: DesignSystemSnapshot = {
    requestId: boundedText(requestId, limits.maxRequestIdLength) ?? 'ds-1',
    capturedAt: boundedText(deps.now(), limits.maxValueLength) ?? '1970-01-01T00:00:00.000Z',
    origin: safeOrigin(deps.origin()),
    summary: {
      elementsScanned: sampled.elements.length,
      elementsSkipped: sampled.skipped,
      textElementsInspected,
      stylesheetsReadable: stylesheetEvidence.readable,
      stylesheetsInaccessible: stylesheetEvidence.inaccessible,
      tokensByCategory,
    },
    detected: detectedValues,
    tokens,
    unavailable,
    limitations: collectedNotes(notes, limits),
  };

  return enforcePayloadLimit(snapshot, limits, notes);
}

export function extractDesignSystemSnapshot(
  requestId: string,
  root: unknown,
  deps: DesignSystemDeps,
): DesignSystemSnapshot {
  const limits = resolveLimits(deps.limits);
  const sampled = sampleDesignSystemElements(root, deps.sample, limits);
  return buildDesignSystemSnapshotFromSample(requestId, sampled, deps);
}
