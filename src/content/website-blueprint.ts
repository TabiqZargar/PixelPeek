import { isDesignSystemSnapshot, isMotionSnapshot, isWebsiteBlueprint } from '../shared/messages';
import {
  BLUEPRINT_APPROVED_ROLES,
  BLUEPRINT_COMPONENT_CATEGORIES,
  BLUEPRINT_DISPLAY_MODES,
  BLUEPRINT_EVIDENCE_SOURCES,
  BLUEPRINT_EVIDENCE_STATUSES,
  BLUEPRINT_LIMITS,
  BLUEPRINT_SCHEMA_VERSION,
  BLUEPRINT_STRUCTURE_CATEGORIES,
  DESIGN_SYSTEM_CATEGORIES,
  type BlueprintAriaRole,
  type BlueprintAvailability,
  type BlueprintComponentCategory,
  type BlueprintDisplayMode,
  type BlueprintEvidenceItem,
  type BlueprintGeometry,
  type BlueprintLocalRef,
  type BlueprintMetadata,
  type BlueprintMotionObservation,
  type BlueprintRefCategory,
  type BlueprintStructureCategory,
  type BlueprintStructureNode,
  type BlueprintViewport,
  type DesignSystemSnapshot,
  type EasingInfo,
  type MotionKeyframeProperty,
  type MotionSnapshot,
  type MotionSummary,
  type MotionTiming,
  type WebsiteBlueprint,
} from '../shared/types';
import { sanitizeCssValue } from './css';

export interface WebsiteBlueprintEvidenceInput {
  source?: unknown;
  status?: unknown;
  note?: unknown;
}

export interface WebsiteBlueprintAvailabilityInput {
  unavailable?: readonly unknown[];
  limitations?: readonly unknown[];
}

export interface WebsiteBlueprintGeometryInput {
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
}

export interface WebsiteBlueprintDocumentInput {
  language?: unknown;
  colorScheme?: unknown;
  documentWidth: number;
  documentHeight: number;
  scrollWidth: number;
  scrollHeight: number;
}

export interface WebsiteBlueprintStructureInput extends WebsiteBlueprintAvailabilityInput {
  key: string;
  parentKey?: string | null;
  kind?: 'region' | 'section';
  category?: BlueprintStructureCategory;
  role?: BlueprintAriaRole | null;
  geometry?: WebsiteBlueprintGeometryInput;
  evidence?: readonly WebsiteBlueprintEvidenceInput[];
}

export interface WebsiteBlueprintComponentExampleInput extends WebsiteBlueprintAvailabilityInput {
  selectorHint?: unknown;
  geometry?: WebsiteBlueprintGeometryInput;
  evidence?: readonly WebsiteBlueprintEvidenceInput[];
}

export interface WebsiteBlueprintComponentInput extends WebsiteBlueprintAvailabilityInput {
  category?: BlueprintComponentCategory;
  occurrenceCount?: unknown;
  sectionKeys?: readonly string[];
  examples?: readonly WebsiteBlueprintComponentExampleInput[];
  evidence?: readonly WebsiteBlueprintEvidenceInput[];
  classificationStatus?: 'detected' | 'inferred' | 'unknown';
}

export interface WebsiteBlueprintLayoutInput extends WebsiteBlueprintAvailabilityInput {
  targetKey: string;
  display?: BlueprintDisplayMode;
  width?: unknown;
  height?: unknown;
  minWidth?: unknown;
  maxWidth?: unknown;
  alignItems?: unknown;
  alignSelf?: unknown;
  justifyContent?: unknown;
  justifySelf?: unknown;
  textAlign?: unknown;
  rowGap?: unknown;
  columnGap?: unknown;
  position?: unknown;
  top?: unknown;
  right?: unknown;
  bottom?: unknown;
  left?: unknown;
  zIndex?: unknown;
  flex?: {
    direction?: unknown;
    wrap?: unknown;
    alignItems?: unknown;
    justifyContent?: unknown;
  } | null;
  grid?: {
    templateColumns?: unknown;
    templateRows?: unknown;
    rowGap?: unknown;
    columnGap?: unknown;
  } | null;
  evidence?: readonly WebsiteBlueprintEvidenceInput[];
}

export interface WebsiteBlueprintVisualInput extends WebsiteBlueprintAvailabilityInput {
  targetKey: string;
  geometry?: WebsiteBlueprintGeometryInput;
  descriptors?: readonly unknown[];
  evidence?: readonly WebsiteBlueprintEvidenceInput[];
}

export interface WebsiteBlueprintMotionLabelInput {
  category?: BlueprintComponentCategory | BlueprintStructureCategory;
  role?: BlueprintAriaRole | null;
  name?: unknown;
}

export interface WebsiteBlueprintMotionInput {
  snapshot?: MotionSnapshot | null;
  targets?: Readonly<Record<string, string | null | undefined>>;
  labels?: Readonly<Record<string, WebsiteBlueprintMotionLabelInput | undefined>>;
}

export interface WebsiteBlueprintResponsiveInput extends WebsiteBlueprintAvailabilityInput {
  observedBreakpoints?: readonly unknown[];
  unobservedBreakpoints?: readonly unknown[];
  unobservedViewportStates?: readonly unknown[];
  evidence?: readonly WebsiteBlueprintEvidenceInput[];
}

export interface WebsiteBlueprintInput extends WebsiteBlueprintAvailabilityInput {
  requestId: string;
  capturedAt: string;
  origin: string;
  viewport: BlueprintViewport;
  document: WebsiteBlueprintDocumentInput;
  structure?: readonly WebsiteBlueprintStructureInput[];
  components?: readonly WebsiteBlueprintComponentInput[];
  layout?: readonly WebsiteBlueprintLayoutInput[];
  designSystem?: DesignSystemSnapshot | null;
  motion?: WebsiteBlueprintMotionInput | null;
  responsive?: WebsiteBlueprintResponsiveInput | null;
  visualReferences?: readonly WebsiteBlueprintVisualInput[];
  evidence?: readonly WebsiteBlueprintEvidenceInput[];
}

interface Tracker {
  truncated: boolean;
  reasons: string[];
  limitsReached: string[];
}

interface StructureDraft {
  node: BlueprintStructureNode;
  inputKey: string;
  parentKey: string | null;
}

const EMPTY_EVIDENCE: BlueprintEvidenceItem = { source: 'unavailable', status: 'unknown', note: null };
const MIN_NUMBER = -1000000;
const MAX_NUMBER = 1000000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mark(tracker: Tracker, limit: string, reason: string): void {
  tracker.truncated = true;
  if (tracker.limitsReached.length < BLUEPRINT_LIMITS.maxLimitations &&
    !tracker.limitsReached.includes(limit)) {
    tracker.limitsReached.push(limit);
  }
  if (tracker.reasons.length < BLUEPRINT_LIMITS.maxLimitations &&
    !tracker.reasons.includes(reason)) {
    tracker.reasons.push(reason);
  }
}

function dedupe(values: readonly string[], max: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
    if (result.length === max) break;
  }
  return result;
}

function allowed<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === 'string' && values.includes(value as T) ? value as T : fallback;
}

function motionCategory(value: unknown): BlueprintComponentCategory | BlueprintStructureCategory {
  const categories = [...BLUEPRINT_COMPONENT_CATEGORIES, ...BLUEPRINT_STRUCTURE_CATEGORIES] as readonly string[];
  return typeof value === 'string' && categories.includes(value)
    ? value as BlueprintComponentCategory | BlueprintStructureCategory
    : 'unknown';
}

function motionRole(value: unknown): BlueprintAriaRole | null {
  return typeof value === 'string' && BLUEPRINT_APPROVED_ROLES.includes(value as BlueprintAriaRole)
    ? value as BlueprintAriaRole
    : null;
}

function safeText(
  value: unknown,
  max: number,
  tracker?: Tracker,
  limit?: string,
  reason?: string,
): string | null {
  if (typeof value !== 'string') return null;
  const clean = sanitizeCssValue(value);
  if (!clean || /^(?:https?|file|data|javascript|chrome-extension|about):/i.test(clean)) return null;
  if (clean.length <= max) return clean;
  if (tracker && limit && reason) mark(tracker, limit, reason);
  return `${clean.slice(0, Math.max(0, max - 3))}...`;
}

function strictText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const clean = sanitizeCssValue(value);
  if (!clean || clean.length > max) return null;
  return clean;
}

function safeOrigin(value: unknown): string | null {
  const clean = strictText(value, BLUEPRINT_LIMITS.maxValueLength);
  return clean && /^https?:\/\/[^\s/?#]+$/.test(clean) ? clean : null;
}

function safeNote(value: unknown, tracker?: Tracker): string | null {
  if (value === null || value === undefined) return null;
  return safeText(
    value,
    BLUEPRINT_LIMITS.maxValueLength,
    tracker,
    'maxValueLength',
    'Evidence note was truncated',
  );
}

function safeName(value: unknown, tracker?: Tracker): string | null {
  return safeText(
    value,
    BLUEPRINT_LIMITS.maxNameLength,
    tracker,
    'maxNameLength',
    'Name was truncated',
  );
}

function safeCss(value: unknown, tracker?: Tracker): string | null {
  return safeText(
    value,
    BLUEPRINT_LIMITS.maxValueLength,
    tracker,
    'maxValueLength',
    'CSS value was truncated',
  );
}

function safeSelector(value: unknown, tracker?: Tracker): string | null {
  const clean = safeCss(value, tracker);
  if (!clean || clean.includes('#') || clean.includes('\\')) return null;
  if (/[<>{};\[\]]/.test(clean)) return null;
  if ((clean.match(/\./g) ?? []).length > 2) return null;
  if (clean.length > BLUEPRINT_LIMITS.maxSelectorLength) {
    if (tracker) mark(tracker, 'maxSelectorLength', 'Selector hint exceeded the allowed length and was omitted');
    return null;
  }
  return clean;
}

function safeFinite(value: unknown, min = MIN_NUMBER, max = MAX_NUMBER): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
}

function boundedNumber(value: unknown, tracker: Tracker, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  if (value < min || value > max) {
    mark(tracker, 'numeric bounds', 'Numeric observation was clamped to the allowed bounds');
    return Math.max(min, Math.min(max, value));
  }
  return value;
}

function truncateValues(
  values: readonly unknown[] | undefined,
  max: number,
  tracker: Tracker,
  limit: string,
  reason: string,
): string[] {
  if (!Array.isArray(values)) return [];
  const result: string[] = [];
  for (const value of values) {
    const clean = safeNote(value, tracker);
    if (clean) result.push(clean);
    if (result.length === max) break;
  }
  if (values.length > max && result.length === max) mark(tracker, limit, reason);
  return result;
}

function availabilityFrom(input: WebsiteBlueprintAvailabilityInput | undefined, tracker: Tracker): BlueprintAvailability {
  return {
    unavailable: truncateValues(
      input?.unavailable,
      BLUEPRINT_LIMITS.maxUnavailable,
      tracker,
      'maxUnavailable',
      'Unavailable notes were truncated',
    ),
    limitations: truncateValues(
      input?.limitations,
      BLUEPRINT_LIMITS.maxLimitations,
      tracker,
      'maxLimitations',
      'Limitations were truncated',
    ),
  };
}

function evidenceFrom(
  values: readonly WebsiteBlueprintEvidenceInput[] | undefined,
  tracker: Tracker,
  context: string,
): BlueprintEvidenceItem[] {
  if (!Array.isArray(values)) return [];
  const result: BlueprintEvidenceItem[] = [];
  for (const value of values) {
    if (!isRecord(value)) {
      mark(tracker, 'evidence validity', `${context} contained invalid evidence`);
      continue;
    }
    const source = value.source;
    const status = value.status;
    if (typeof source !== 'string' || !BLUEPRINT_EVIDENCE_SOURCES.includes(source as BlueprintEvidenceItem['source']) ||
      typeof status !== 'string' || !BLUEPRINT_EVIDENCE_STATUSES.includes(status as BlueprintEvidenceItem['status'])) {
      mark(tracker, 'evidence validity', `${context} contained invalid evidence`);
      continue;
    }
    const item: BlueprintEvidenceItem = {
      source: source as BlueprintEvidenceItem['source'],
      status: status as BlueprintEvidenceItem['status'],
      note: safeNote(value.note, tracker),
    };
    if (result.length === BLUEPRINT_LIMITS.maxEvidenceItemsPerObservation) {
      mark(tracker, 'maxEvidenceItemsPerObservation', `${context} evidence was truncated`);
      break;
    }
    result.push(item);
  }
  return result;
}

function appendEvidence(
  items: BlueprintEvidenceItem[],
  item: BlueprintEvidenceItem,
  tracker: Tracker,
  context: string,
): void {
  if (items.some((entry) => entry.source === item.source && entry.status === item.status && entry.note === item.note)) return;
  if (items.length === BLUEPRINT_LIMITS.maxEvidenceItemsPerObservation) {
    mark(tracker, 'maxEvidenceItemsPerObservation', `${context} evidence was truncated`);
    return;
  }
  items.push(item);
}

function geometryFrom(value: WebsiteBlueprintGeometryInput | undefined, tracker: Tracker): BlueprintGeometry | null {
  if (!value) return null;
  const x = safeFinite(value.x);
  const y = safeFinite(value.y);
  const width = safeFinite(value.width, 0, MAX_NUMBER);
  const height = safeFinite(value.height, 0, MAX_NUMBER);
  if (x === null || y === null || width === null || height === null) return null;
  return {
    x: boundedNumber(x, tracker, 0, MIN_NUMBER, MAX_NUMBER),
    y: boundedNumber(y, tracker, 0, MIN_NUMBER, MAX_NUMBER),
    width: boundedNumber(width, tracker, 0, 0, MAX_NUMBER),
    height: boundedNumber(height, tracker, 0, 0, MAX_NUMBER),
  };
}

class RefAllocator {
  private refs: BlueprintLocalRef[] = [];

  allocate(category: BlueprintRefCategory): string | null {
    if (this.refs.length >= BLUEPRINT_LIMITS.maxRefs) return null;
    const ref = `ref-${this.refs.length + 1}`;
    this.refs.push({ ref, category });
    return ref;
  }

  all(): BlueprintLocalRef[] {
    return this.refs.map((entry) => ({ ...entry }));
  }
}

function recomputeRefs(blueprint: WebsiteBlueprint): BlueprintLocalRef[] {
  const refs: BlueprintLocalRef[] = [];
  const add = (ref: string, category: BlueprintRefCategory): void => {
    if (!refs.some((entry) => entry.ref === ref)) refs.push({ ref, category });
  };
  for (const node of blueprint.structure.nodes) add(node.ref, node.kind === 'region' ? 'region' : 'section');
  for (const component of blueprint.components) {
    add(component.ref, 'component');
    for (const example of component.examples) add(example.ref, 'component');
  }
  for (const observation of blueprint.layout) add(observation.ref, 'layout');
  for (const observation of blueprint.motion.observations) add(observation.ref, 'layout');
  for (const reference of blueprint.visualReferences) add(reference.ref, 'visual');
  return refs.slice(0, BLUEPRINT_LIMITS.maxRefs);
}

function buildStructure(
  input: WebsiteBlueprintInput,
  allocator: RefAllocator,
  tracker: Tracker,
): { structure: WebsiteBlueprint['structure']; keyToRef: Map<string, string> } {
  const nodes: BlueprintStructureNode[] = [];
  const keyToRef = new Map<string, string>();
  const drafts: StructureDraft[] = [];
  const source = Array.isArray(input.structure) ? input.structure : [];

  for (const entry of source) {
    if (nodes.length === BLUEPRINT_LIMITS.maxStructureNodes) {
      mark(tracker, 'maxStructureNodes', 'Structure nodes were truncated');
      break;
    }
    if (!isRecord(entry)) {
      mark(tracker, 'structure validity', 'Invalid structure observation was omitted');
      continue;
    }
    const key = safeName(entry.key, tracker);
    if (!key || keyToRef.has(key)) {
      mark(tracker, 'structure validity', 'Invalid or duplicate structure key was omitted');
      continue;
    }
    const geometry = geometryFrom(entry.geometry as WebsiteBlueprintGeometryInput | undefined, tracker);
    if (!geometry) {
      mark(tracker, 'structure geometry', 'Structure observation without geometry was omitted');
      continue;
    }
    const evidence = evidenceFrom(entry.evidence as readonly WebsiteBlueprintEvidenceInput[] | undefined, tracker, 'Structure');
    if (evidence.length === 0) {
      mark(tracker, 'structure evidence', 'Structure observation without evidence was omitted');
      continue;
    }
    const ref = allocator.allocate(entry.kind === 'region' ? 'region' : 'section');
    if (!ref) {
      mark(tracker, 'maxRefs', 'Structure refs reached the local ref limit');
      break;
    }
    const node: BlueprintStructureNode = {
      ref,
      kind: entry.kind === 'region' ? 'region' : 'section',
      category: allowed<BlueprintStructureCategory>(
        entry.category,
        BLUEPRINT_STRUCTURE_CATEGORIES,
        'unknown',
      ),
      role: typeof entry.role === 'string' &&
        BLUEPRINT_APPROVED_ROLES.includes(entry.role as BlueprintAriaRole)
        ? entry.role as BlueprintAriaRole
        : null,
      parentRef: null,
      childRefs: [],
      geometry,
      evidence,
      ...availabilityFrom(entry as WebsiteBlueprintAvailabilityInput, tracker),
    };
    nodes.push(node);
    keyToRef.set(key, ref);
    drafts.push({ node, inputKey: key, parentKey: typeof entry.parentKey === 'string' ? entry.parentKey : null });
  }

  const nodeByRef = new Map(nodes.map((node) => [node.ref, node]));
  const parentByRef = new Map<string, string | null>();
  for (const draft of drafts) {
    const parentRef = draft.parentKey ? keyToRef.get(draft.parentKey) ?? null : null;
    if (draft.parentKey && !parentRef) {
      mark(tracker, 'structure parent', 'Unknown structure parent was omitted');
    }
    parentByRef.set(draft.node.ref, parentRef);
    draft.node.parentRef = parentRef;
  }
  for (const draft of drafts) {
    const visited = new Set<string>([draft.node.ref]);
    let current = parentByRef.get(draft.node.ref) ?? null;
    while (current !== null) {
      if (visited.has(current)) {
        mark(tracker, 'structure parent', 'Cyclic structure parent was omitted');
        parentByRef.set(draft.node.ref, null);
        draft.node.parentRef = null;
        break;
      }
      visited.add(current);
      current = parentByRef.get(current) ?? null;
    }
  }
  for (const draft of drafts) {
    const parentRef = draft.node.parentRef;
    if (!parentRef || parentRef === draft.node.ref) continue;
    const parent = nodeByRef.get(parentRef);
    if (!parent) {
      draft.node.parentRef = null;
      continue;
    }
    if (parent.childRefs.length === BLUEPRINT_LIMITS.maxChildrenPerSection) {
      mark(tracker, 'maxChildrenPerSection', 'Structure children were truncated');
      draft.node.parentRef = null;
      continue;
    }
    parent.childRefs.push(draft.node.ref);
  }

  const sectionRefs = nodes
    .filter((node) => node.kind === 'section')
    .map((node) => node.ref)
    .slice(0, BLUEPRINT_LIMITS.maxSections);
  if (nodes.filter((node) => node.kind === 'section').length > sectionRefs.length) {
    mark(tracker, 'maxSections', 'Section refs were truncated');
  }

  return {
    structure: {
      nodes,
      sectionRefs,
      unavailable: [],
      limitations: [],
    },
    keyToRef,
  };
}

function buildComponents(
  input: WebsiteBlueprintInput,
  allocator: RefAllocator,
  keyToRef: Map<string, string>,
  tracker: Tracker,
): WebsiteBlueprint['components'] {
  const components: WebsiteBlueprint['components'] = [];
  const source = Array.isArray(input.components) ? input.components : [];

  for (const entry of source) {
    if (components.length === BLUEPRINT_LIMITS.maxComponents) {
      mark(tracker, 'maxComponents', 'Components were truncated');
      break;
    }
    if (!isRecord(entry)) {
      mark(tracker, 'component validity', 'Invalid component observation was omitted');
      continue;
    }
    const evidence = evidenceFrom(entry.evidence as readonly WebsiteBlueprintEvidenceInput[] | undefined, tracker, 'Component');
    if (evidence.length === 0) {
      mark(tracker, 'component evidence', 'Component without evidence was omitted');
      continue;
    }
    const ref = allocator.allocate('component');
    if (!ref) {
      mark(tracker, 'maxRefs', 'Component refs reached the local ref limit');
      break;
    }
    const sectionRefs: string[] = [];
    for (const key of Array.isArray(entry.sectionKeys) ? entry.sectionKeys : []) {
      const mapped = typeof key === 'string' ? keyToRef.get(key) : undefined;
      if (mapped && sectionRefs.length < BLUEPRINT_LIMITS.maxSections) sectionRefs.push(mapped);
      else mark(tracker, 'component section refs', 'Unmapped component section was omitted');
    }
    const rawCount = typeof entry.occurrenceCount === 'number' && Number.isFinite(entry.occurrenceCount)
      ? entry.occurrenceCount
      : 0;
    if (typeof entry.occurrenceCount !== 'number') {
      mark(tracker, 'component count', 'Occurrence count was not supplied');
    }
    const occurrenceCount = Math.min(BLUEPRINT_LIMITS.maxBlueprintElements, Math.max(0, Math.floor(rawCount)));

    const examples: WebsiteBlueprint['components'][number]['examples'] = [];
    for (const example of Array.isArray(entry.examples) ? entry.examples : []) {
      if (examples.length === BLUEPRINT_LIMITS.maxEvidenceItemsPerObservation) {
        mark(tracker, 'maxEvidenceItemsPerObservation', 'Component examples were truncated');
        break;
      }
      if (!isRecord(example)) {
        mark(tracker, 'component example', 'Invalid component example was omitted');
        continue;
      }
      const geometry = geometryFrom(example.geometry as WebsiteBlueprintGeometryInput | undefined, tracker);
      if (!geometry) {
        mark(tracker, 'component example', 'Component example without geometry was omitted');
        continue;
      }
      const exampleRef = allocator.allocate('component');
      if (!exampleRef) {
        mark(tracker, 'maxRefs', 'Component example refs reached the local ref limit');
        break;
      }
      examples.push({
        ref: exampleRef,
        selectorHint: safeSelector(example.selectorHint, tracker),
        geometry,
        evidence: evidenceFrom(example.evidence as readonly WebsiteBlueprintEvidenceInput[] | undefined, tracker, 'Component example'),
        ...availabilityFrom(example as WebsiteBlueprintAvailabilityInput, tracker),
      });
    }

    const status = entry.classificationStatus === 'detected' ||
      entry.classificationStatus === 'inferred' ||
      entry.classificationStatus === 'unknown'
      ? entry.classificationStatus
      : 'inferred';
    appendEvidence(evidence, {
      source: 'sampling',
      status,
      note: status === 'detected' ? 'Category was supplied by sampled evidence' : 'Category was inferred from supplied observations',
    }, tracker, 'Component');
    if (occurrenceCount === 1) {
      appendEvidence(evidence, {
        source: 'sampling',
        status: 'inferred',
        note: 'Single occurrence, reusable pattern not established',
      }, tracker, 'Component');
    }

    components.push({
      ref,
      category: allowed<BlueprintComponentCategory>(
        entry.category,
        BLUEPRINT_COMPONENT_CATEGORIES,
        'unknown',
      ),
      occurrenceCount,
      sectionRefs,
      examples,
      evidence,
      ...availabilityFrom(entry as WebsiteBlueprintAvailabilityInput, tracker),
    });
  }

  return components;
}

function cssField(value: unknown, tracker: Tracker): string | null {
  return safeCss(value, tracker);
}

function buildLayout(
  input: WebsiteBlueprintInput,
  allocator: RefAllocator,
  keyToRef: Map<string, string>,
  tracker: Tracker,
): WebsiteBlueprint['layout'] {
  const layout: WebsiteBlueprint['layout'] = [];
  const source = Array.isArray(input.layout) ? input.layout : [];

  for (const entry of source) {
    if (layout.length === BLUEPRINT_LIMITS.maxLayoutObservations) {
      mark(tracker, 'maxLayoutObservations', 'Layout observations were truncated');
      break;
    }
    if (!isRecord(entry)) {
      mark(tracker, 'layout validity', 'Invalid layout observation was omitted');
      continue;
    }
    const targetRef = typeof entry.targetKey === 'string' ? keyToRef.get(entry.targetKey) : undefined;
    if (!targetRef) {
      mark(tracker, 'layout target', 'Layout target could not be mapped to a structure ref');
      continue;
    }
    const evidence = evidenceFrom(entry.evidence as readonly WebsiteBlueprintEvidenceInput[] | undefined, tracker, 'Layout');
    if (evidence.length === 0) {
      mark(tracker, 'layout evidence', 'Layout observation without evidence was omitted');
      continue;
    }
    const ref = allocator.allocate('layout');
    if (!ref) {
      mark(tracker, 'maxRefs', 'Layout refs reached the local ref limit');
      break;
    }
    layout.push({
      ref,
      targetRef,
      display: allowed<BlueprintDisplayMode>(entry.display, BLUEPRINT_DISPLAY_MODES, 'unknown'),
      dimensions: {
        width: cssField(entry.width, tracker),
        height: cssField(entry.height, tracker),
        minWidth: cssField(entry.minWidth, tracker),
        maxWidth: cssField(entry.maxWidth, tracker),
      },
      alignment: {
        alignItems: cssField(entry.alignItems, tracker),
        alignSelf: cssField(entry.alignSelf, tracker),
        justifyContent: cssField(entry.justifyContent, tracker),
        justifySelf: cssField(entry.justifySelf, tracker),
        textAlign: cssField(entry.textAlign, tracker),
      },
      gaps: {
        rowGap: cssField(entry.rowGap, tracker),
        columnGap: cssField(entry.columnGap, tracker),
      },
      positioning: {
        position: cssField(entry.position, tracker),
        top: cssField(entry.top, tracker),
        right: cssField(entry.right, tracker),
        bottom: cssField(entry.bottom, tracker),
        left: cssField(entry.left, tracker),
        zIndex: cssField(entry.zIndex, tracker),
      },
      flex: isRecord(entry.flex) ? {
        direction: cssField(entry.flex.direction, tracker),
        wrap: cssField(entry.flex.wrap, tracker),
        alignItems: cssField(entry.flex.alignItems, tracker),
        justifyContent: cssField(entry.flex.justifyContent, tracker),
      } : null,
      grid: isRecord(entry.grid) ? {
        templateColumns: cssField(entry.grid.templateColumns, tracker),
        templateRows: cssField(entry.grid.templateRows, tracker),
        rowGap: cssField(entry.grid.rowGap, tracker),
        columnGap: cssField(entry.grid.columnGap, tracker),
      } : null,
      evidence,
      ...availabilityFrom(entry as WebsiteBlueprintAvailabilityInput, tracker),
    });
  }

  return layout;
}

function emptyDesignSystem(requestId: string, capturedAt: string, origin: string): DesignSystemSnapshot {
  return {
    requestId,
    capturedAt,
    origin,
    summary: {
      elementsScanned: 0,
      elementsSkipped: 0,
      textElementsInspected: 0,
      stylesheetsReadable: 0,
      stylesheetsInaccessible: 0,
      tokensByCategory: { color: 0, typography: 0, spacing: 0, effect: 0, gradient: 0 },
    },
    detected: { palette: [], typography: [], spacing: [], effects: [], gradients: [] },
    tokens: [],
    unavailable: ['Design system observations were not supplied.'],
    limitations: [],
  };
}

function cloneDesignSystem(source: DesignSystemSnapshot): DesignSystemSnapshot {
  const cloneValue = (value: DesignSystemSnapshot['detected']['palette'][number]) => ({
    value: value.value,
    normalized: value.normalized,
    count: value.count,
    sourceProperties: [...value.sourceProperties],
  });
  return {
    requestId: source.requestId,
    capturedAt: source.capturedAt,
    origin: source.origin,
    summary: {
      ...source.summary,
      tokensByCategory: { ...source.summary.tokensByCategory },
    },
    detected: {
      palette: source.detected.palette.map(cloneValue),
      typography: source.detected.typography.map(cloneValue),
      spacing: source.detected.spacing.map(cloneValue),
      effects: source.detected.effects.map(cloneValue),
      gradients: source.detected.gradients.map(cloneValue),
    },
    tokens: source.tokens.map((token) => ({
      ...token,
      detected: {
        values: token.detected.values.map(cloneValue),
        exemplars: token.detected.exemplars.map((exemplar) => ({ ...exemplar })),
        support: token.detected.support,
      },
    })),
    unavailable: [...source.unavailable],
    limitations: [...source.limitations],
  };
}

function buildDesignSystem(
  input: WebsiteBlueprintInput,
  tracker: Tracker,
  requestId: string,
  capturedAt: string,
  origin: string,
): DesignSystemSnapshot {
  const fallback = emptyDesignSystem(requestId, capturedAt, origin);
  if (!input.designSystem) return fallback;
  if (!isDesignSystemSnapshot(input.designSystem)) {
    mark(tracker, 'design system validity', 'Invalid design system observation was omitted');
    return fallback;
  }
  if (input.designSystem.origin !== origin) {
    mark(tracker, 'design system origin', 'Design system origin did not match the blueprint origin');
    return fallback;
  }
  return cloneDesignSystem(input.designSystem);
}

function cloneTiming(value: MotionTiming | undefined, tracker: Tracker): MotionTiming {
  if (!value) {
    return {
      duration: null,
      delay: null,
      iterations: null,
      infinite: false,
      direction: null,
      fill: null,
      easing: null,
      playState: null,
      currentTime: null,
      playbackRate: null,
    };
  }
  return {
    duration: safeFinite(value.duration),
    delay: safeFinite(value.delay),
    iterations: safeFinite(value.iterations, 0, 1000),
    infinite: typeof value.infinite === 'boolean' ? value.infinite : false,
    direction: safeCss(value.direction, tracker),
    fill: safeCss(value.fill, tracker),
    easing: safeCss(value.easing, tracker),
    playState: safeCss(value.playState, tracker),
    currentTime: safeFinite(value.currentTime, -600000, 600000),
    playbackRate: safeFinite(value.playbackRate, -100, 100),
  };
}

function cloneProperties(values: readonly MotionKeyframeProperty[] | undefined, tracker: Tracker): MotionKeyframeProperty[] {
  if (!Array.isArray(values)) return [];
  const result: MotionKeyframeProperty[] = [];
  for (const value of values) {
    if (!isRecord(value)) continue;
    const name = safeName(value.name, tracker);
    const propertyValue = safeCss(value.value, tracker);
    if (!name || !propertyValue) continue;
    if (result.length === BLUEPRINT_LIMITS.maxEvidenceItemsPerObservation) {
      mark(tracker, 'maxEvidenceItemsPerObservation', 'Motion properties were truncated');
      break;
    }
    result.push({ name, value: propertyValue });
  }
  return result;
}

function cloneSummary(summary: MotionSummary, tracker: Tracker): MotionSummary {
  const animatedProperties = Array.isArray(summary.animatedProperties)
    ? summary.animatedProperties
      .map((value) => safeName(value, tracker))
      .filter((value): value is string => value !== null)
      .slice(0, BLUEPRINT_LIMITS.maxEvidenceItemsPerObservation)
    : [];
  if (Array.isArray(summary.animatedProperties) && summary.animatedProperties.length > animatedProperties.length) {
    mark(tracker, 'motion properties', 'Motion animated properties were truncated');
  }
  return {
    animationCount: Math.max(0, Math.floor(summary.animationCount)),
    cssAnimationCount: Math.max(0, Math.floor(summary.cssAnimationCount)),
    transitionCount: Math.max(0, Math.floor(summary.transitionCount)),
    waapiCount: Math.max(0, Math.floor(summary.waapiCount)),
    runningCount: Math.max(0, Math.floor(summary.runningCount)),
    keyframeSetCount: Math.max(0, Math.floor(summary.keyframeSetCount)),
    reducedMotion: summary.reducedMotion === true,
    animatedProperties,
  };
}

function cloneEasings(values: readonly EasingInfo[] | undefined, tracker: Tracker): EasingInfo[] {
  if (!Array.isArray(values)) return [];
  const result: EasingInfo[] = [];
  for (const value of values) {
    if (!isRecord(value)) continue;
    const easingValue = safeCss(value.value, tracker);
    const kind = value.kind;
    if (!easingValue || typeof kind !== 'string' ||
      !['linear', 'keyword', 'cubic-bezier', 'steps', 'unsupported'].includes(kind)) {
      continue;
    }
    const points = Array.isArray(value.points) && value.points.length === 4 &&
      value.points.every((point) => typeof point === 'number' && Number.isFinite(point))
      ? value.points as [number, number, number, number]
      : null;
    if (result.length === BLUEPRINT_LIMITS.maxEvidenceItemsPerObservation) {
      mark(tracker, 'maxEvidenceItemsPerObservation', 'Motion easings were truncated');
      break;
    }
    result.push({
      value: easingValue,
      kind: kind as EasingInfo['kind'],
      points,
      visualizable: value.visualizable === true,
    });
  }
  return result;
}

function buildMotion(
  input: WebsiteBlueprintInput,
  allocator: RefAllocator,
  keyToRef: Map<string, string>,
  tracker: Tracker,
): WebsiteBlueprint['motion'] {
  const unavailable: string[] = [];
  const limitations = truncateValues(
    input.motion?.snapshot?.limitations,
    BLUEPRINT_LIMITS.maxLimitations,
    tracker,
    'maxLimitations',
    'Motion limitations were truncated',
  );
  if (!input.motion?.snapshot) {
    unavailable.push('Motion observations were not supplied.');
  }
  if (!isMotionSnapshot(input.motion?.snapshot)) {
    if (input.motion?.snapshot) {
      mark(tracker, 'motion validity', 'Invalid motion observation was omitted');
      unavailable.push('Motion observations were invalid.');
    }
    return {
      summary: {
        animationCount: 0,
        cssAnimationCount: 0,
        transitionCount: 0,
        waapiCount: 0,
        runningCount: 0,
        keyframeSetCount: 0,
        reducedMotion: false,
        animatedProperties: [],
      },
      observations: [],
      easings: [],
      reducedMotion: false,
      unavailable: dedupe(unavailable, BLUEPRINT_LIMITS.maxUnavailable),
      limitations,
    };
  }

  const snapshot = input.motion.snapshot;
  const targetKeys = isRecord(input.motion.targets) ? input.motion.targets : {};
  const labels = isRecord(input.motion.labels) ? input.motion.labels : {};
  const observations: BlueprintMotionObservation[] = [];
  const resolveTarget = (id: string): string | null => {
    const key = targetKeys[id];
    return typeof key === 'string' ? keyToRef.get(key) ?? null : null;
  };
  const labelFor = (id: string): WebsiteBlueprintMotionLabelInput => {
    const value = labels[id];
    return isRecord(value) ? value as WebsiteBlueprintMotionLabelInput : {};
  };

  for (const animation of snapshot.animations) {
    if (observations.length === BLUEPRINT_LIMITS.maxLayoutObservations) {
      mark(tracker, 'motion observations', 'Motion observations were truncated');
      break;
    }
    const targetRef = resolveTarget(animation.id);
    if (!targetRef) {
      mark(tracker, 'motion target', 'Motion animation target could not be mapped to a structure ref');
      continue;
    }
    const ref = allocator.allocate('layout');
    if (!ref) {
      mark(tracker, 'maxRefs', 'Motion refs reached the local ref limit');
      break;
    }
    const label = labelFor(animation.id);
    const category = label.category;
    observations.push({
      ref,
      targetRef,
      source: animation.source,
      category: motionCategory(category),
      role: motionRole(label.role),
      name: safeName(animation.name, tracker),
      timing: cloneTiming(animation.timing, tracker),
      properties: cloneProperties(animation.keyframes[0]?.properties, tracker),
      evidence: [{ source: 'motion-event', status: 'detected', note: null }],
      unavailable: [],
      limitations: [],
    });
  }

  for (const transition of snapshot.transitions) {
    if (observations.length === BLUEPRINT_LIMITS.maxLayoutObservations) {
      mark(tracker, 'motion observations', 'Motion observations were truncated');
      break;
    }
    const targetRef = resolveTarget(transition.id);
    if (!targetRef) {
      mark(tracker, 'motion target', 'Motion transition target could not be mapped to a structure ref');
      continue;
    }
    const ref = allocator.allocate('layout');
    if (!ref) {
      mark(tracker, 'maxRefs', 'Motion refs reached the local ref limit');
      break;
    }
    const label = labelFor(transition.id);
    observations.push({
      ref,
      targetRef,
      source: 'css-transition',
      category: motionCategory(label.category),
      role: motionRole(label.role),
      name: safeName(transition.property, tracker),
      timing: {
        duration: safeFinite(transition.duration),
        delay: safeFinite(transition.delay),
        iterations: null,
        infinite: false,
        direction: null,
        fill: null,
        easing: safeCss(transition.easing, tracker),
        playState: null,
        currentTime: safeFinite(transition.elapsedTime, -600000, 600000),
        playbackRate: null,
      },
      properties: [],
      evidence: [{ source: 'motion-event', status: 'detected', note: null }],
      unavailable: [],
      limitations: [],
    });
  }

  return {
    summary: cloneSummary(snapshot.summary, tracker),
    observations,
    easings: cloneEasings(snapshot.easings, tracker),
    reducedMotion: snapshot.summary.reducedMotion === true,
    unavailable: dedupe(unavailable, BLUEPRINT_LIMITS.maxUnavailable),
    limitations,
  };
}

function buildResponsive(input: WebsiteBlueprintInput, tracker: Tracker): WebsiteBlueprint['responsive'] {
  const responsive = input.responsive;
  const evidence = evidenceFrom(responsive?.evidence, tracker, 'Responsive');
  appendEvidence(evidence, EMPTY_EVIDENCE, tracker, 'Responsive');
  return {
    observedViewport: { ...input.viewport },
    observedBreakpoints: truncateValues(
      responsive?.observedBreakpoints,
      BLUEPRINT_LIMITS.maxLimitations,
      tracker,
      'maxLimitations',
      'Observed breakpoints were truncated',
    ),
    unobservedBreakpoints: truncateValues(
      responsive?.unobservedBreakpoints ?? ['Breakpoints were not supplied.'],
      BLUEPRINT_LIMITS.maxLimitations,
      tracker,
      'maxLimitations',
      'Unobserved breakpoints were truncated',
    ),
    unobservedViewportStates: truncateValues(
      responsive?.unobservedViewportStates ?? ['Viewport states were not supplied.'],
      BLUEPRINT_LIMITS.maxLimitations,
      tracker,
      'maxLimitations',
      'Unobserved viewport states were truncated',
    ),
    evidence,
    ...availabilityFrom(responsive ?? undefined, tracker),
  };
}

function buildVisualReferences(
  input: WebsiteBlueprintInput,
  allocator: RefAllocator,
  keyToRef: Map<string, string>,
  structureNodes: readonly BlueprintStructureNode[],
  tracker: Tracker,
): WebsiteBlueprint['visualReferences'] {
  const references: WebsiteBlueprint['visualReferences'] = [];
  const source = Array.isArray(input.visualReferences) ? input.visualReferences : [];

  for (const entry of source) {
    if (references.length === BLUEPRINT_LIMITS.maxSections) {
      mark(tracker, 'maxSections', 'Visual references were truncated');
      break;
    }
    if (!isRecord(entry)) {
      mark(tracker, 'visual reference', 'Invalid visual reference was omitted');
      continue;
    }
    const targetRef = typeof entry.targetKey === 'string' ? keyToRef.get(entry.targetKey) : undefined;
    if (!targetRef) {
      mark(tracker, 'visual target', 'Visual target could not be mapped to a structure ref');
      continue;
    }
    const geometry = geometryFrom(entry.geometry as WebsiteBlueprintGeometryInput | undefined, tracker) ??
      structureNodes.find((node) => node.ref === targetRef)?.geometry ?? null;
    if (!geometry) {
      mark(tracker, 'visual geometry', 'Visual reference without geometry was omitted');
      continue;
    }
    const ref = allocator.allocate('visual');
    if (!ref) {
      mark(tracker, 'maxRefs', 'Visual refs reached the local ref limit');
      break;
    }
    const descriptors: string[] = [];
    for (const value of Array.isArray(entry.descriptors) ? entry.descriptors : []) {
      const clean = safeCss(value, tracker);
      if (!clean) continue;
      if (descriptors.length === BLUEPRINT_LIMITS.maxEvidenceItemsPerObservation) {
        mark(tracker, 'maxEvidenceItemsPerObservation', 'Visual descriptors were truncated');
        break;
      }
      descriptors.push(clean);
    }
    const evidence = evidenceFrom(entry.evidence as readonly WebsiteBlueprintEvidenceInput[] | undefined, tracker, 'Visual reference');
    if (evidence.length === 0) {
      appendEvidence(evidence, { source: 'geometry', status: 'detected', note: null }, tracker, 'Visual reference');
    }
    references.push({
      ref,
      targetRef,
      geometry,
      descriptors,
      evidence,
      ...availabilityFrom(entry as WebsiteBlueprintAvailabilityInput, tracker),
    });
  }

  return references;
}

function shrinkDesignSystem(
  source: DesignSystemSnapshot,
  tracker: Tracker,
  isOversized: (candidate: DesignSystemSnapshot) => boolean,
): DesignSystemSnapshot {
  const snapshot = cloneDesignSystem(source);
  const note = 'Design system data was truncated to fit the blueprint payload limit';
  const noteLimit = (): void => {
    mark(tracker, 'maxPayloadChars', note);
    if (!snapshot.limitations.includes(note)) snapshot.limitations = dedupe([...snapshot.limitations, note], 20);
  };
  while (snapshot.tokens.length > 0 && isOversized(snapshot)) {
    snapshot.tokens.pop();
    for (const category of DESIGN_SYSTEM_CATEGORIES) {
      snapshot.summary.tokensByCategory[category] =
        snapshot.tokens.filter((token) => token.category === category).length;
    }
    noteLimit();
  }
  const categories = ['gradients', 'effects', 'spacing', 'typography', 'palette'] as const;
  for (const category of categories) {
    while (snapshot.detected[category].length > 0 && isOversized(snapshot)) {
      snapshot.detected[category].pop();
      noteLimit();
    }
    if (!isOversized(snapshot)) break;
  }
  while (snapshot.unavailable.length > 0 && isOversized(snapshot)) {
    snapshot.unavailable.pop();
    noteLimit();
  }
  while (snapshot.limitations.length > 0 && isOversized(snapshot)) {
    snapshot.limitations.pop();
  }
  return snapshot;
}

function dropStructureRefs(
  blueprint: WebsiteBlueprint,
  refs: readonly string[],
  tracker: Tracker,
): void {
  const removed = new Set(refs);
  blueprint.structure.nodes = blueprint.structure.nodes.filter((node) => !removed.has(node.ref));
  for (const node of blueprint.structure.nodes) {
    node.childRefs = node.childRefs.filter((ref) => !removed.has(ref));
    if (node.parentRef && removed.has(node.parentRef)) node.parentRef = null;
  }
  blueprint.structure.sectionRefs = blueprint.structure.sectionRefs.filter((ref) => !removed.has(ref));
  for (const component of blueprint.components) {
    component.sectionRefs = component.sectionRefs.filter((ref) => !removed.has(ref));
  }
  blueprint.layout = blueprint.layout.filter((observation) => !removed.has(observation.targetRef));
  blueprint.motion.observations = blueprint.motion.observations
    .filter((observation) => !removed.has(observation.targetRef));
  blueprint.visualReferences = blueprint.visualReferences
    .filter((reference) => !removed.has(reference.targetRef));
  blueprint.refs = recomputeRefs(blueprint);
  mark(tracker, 'maxPayloadChars', 'Structure observations were truncated to fit the payload limit');
}

function finalize(blueprint: WebsiteBlueprint, tracker: Tracker, rootLimitations: readonly string[]): void {
  const meaningful = blueprint.structure.nodes.length > 0 ||
    blueprint.components.length > 0 ||
    blueprint.layout.length > 0 ||
    blueprint.visualReferences.length > 0 ||
    blueprint.motion.observations.length > 0;
  blueprint.metadata.status = tracker.truncated ? 'partial' : meaningful ? 'complete' : 'unavailable';
  blueprint.metadata.truncation = {
    truncated: tracker.truncated,
    reasons: [...tracker.reasons],
    limitsReached: [...tracker.limitsReached],
  };
  blueprint.evidence.unavailable = dedupe(blueprint.evidence.unavailable, BLUEPRINT_LIMITS.maxUnavailable);
  blueprint.evidence.limitations = dedupe(
    [...rootLimitations, ...tracker.reasons],
    BLUEPRINT_LIMITS.maxLimitations,
  );
}

function fitPayload(
  blueprint: WebsiteBlueprint,
  tracker: Tracker,
  rootLimitations: readonly string[],
): void {
  const evaluate = (): boolean => {
    finalize(blueprint, tracker, rootLimitations);
    return JSON.stringify(blueprint).length <= BLUEPRINT_LIMITS.maxPayloadChars;
  };
  if (evaluate()) return;

  blueprint.designSystem = shrinkDesignSystem(blueprint.designSystem, tracker, (candidate) => {
    blueprint.designSystem = candidate;
    return !evaluate();
  });
  if (evaluate()) return;

  while (blueprint.visualReferences.length > 0 && !evaluate()) {
    blueprint.visualReferences.pop();
    mark(tracker, 'maxPayloadChars', 'Visual references were truncated to fit the payload limit');
  }
  blueprint.refs = recomputeRefs(blueprint);
  if (evaluate()) return;

  while (blueprint.layout.length > 0 && !evaluate()) {
    blueprint.layout.pop();
    mark(tracker, 'maxPayloadChars', 'Layout observations were truncated to fit the payload limit');
  }
  blueprint.refs = recomputeRefs(blueprint);
  if (evaluate()) return;

  while (blueprint.motion.observations.length > 0 && !evaluate()) {
    blueprint.motion.observations.pop();
    mark(tracker, 'maxPayloadChars', 'Motion observations were truncated to fit the payload limit');
  }
  blueprint.refs = recomputeRefs(blueprint);
  if (evaluate()) return;

  for (let index = blueprint.components.length - 1; index >= 0 && !evaluate(); index -= 1) {
    blueprint.components[index]!.examples = [];
    mark(tracker, 'maxPayloadChars', 'Component examples were truncated to fit the payload limit');
    blueprint.refs = recomputeRefs(blueprint);
  }
  if (evaluate()) return;

  while (blueprint.components.length > 0 && !evaluate()) {
    blueprint.components.pop();
    mark(tracker, 'maxPayloadChars', 'Components were truncated to fit the payload limit');
  }
  blueprint.refs = recomputeRefs(blueprint);
  if (evaluate()) return;

  while (blueprint.structure.nodes.length > 0 && !evaluate()) {
    const childRefs = new Set(blueprint.structure.nodes.flatMap((node) => node.childRefs));
    let index = blueprint.structure.nodes.findIndex((node) => !childRefs.has(node.ref));
    if (index < 0) index = blueprint.structure.nodes.length - 1;
    const [node] = blueprint.structure.nodes.splice(index, 1);
    dropStructureRefs(blueprint, node ? [node.ref] : [], tracker);
  }
  evaluate();
}

export function buildWebsiteBlueprint(input: WebsiteBlueprintInput): WebsiteBlueprint {
  if (!isRecord(input)) throw new TypeError('Website blueprint input must be an object');
  const requestId = strictText(input.requestId, BLUEPRINT_LIMITS.maxNameLength);
  if (!requestId) throw new TypeError('Website blueprint requestId must be a bounded string');
  const capturedAt = strictText(input.capturedAt, BLUEPRINT_LIMITS.maxValueLength);
  if (!capturedAt || Number.isNaN(Date.parse(capturedAt))) {
    throw new TypeError('Website blueprint capturedAt must be a bounded timestamp');
  }
  const origin = safeOrigin(input.origin);
  if (!origin) throw new TypeError('Website blueprint origin must be an origin-only http(s) string');
  try {
    if (new URL(origin).origin !== origin) throw new Error('not origin-only');
  } catch {
    throw new TypeError('Website blueprint origin must be origin-only');
  }
  if (!isRecord(input.viewport) || !isRecord(input.document)) {
    throw new TypeError('Website blueprint viewport and document observations are required');
  }

  const tracker: Tracker = { truncated: false, reasons: [], limitsReached: [] };
  const viewport: BlueprintViewport = {
    width: boundedNumber(input.viewport.width, tracker, 0, 0, MAX_NUMBER),
    height: boundedNumber(input.viewport.height, tracker, 0, 0, MAX_NUMBER),
    devicePixelRatio: boundedNumber(input.viewport.devicePixelRatio, tracker, 1, 0, 100),
  };
  const document = {
    language: safeName(input.document.language, tracker),
    colorScheme: safeName(input.document.colorScheme, tracker),
    documentWidth: boundedNumber(input.document.documentWidth, tracker, 0, 0, MAX_NUMBER),
    documentHeight: boundedNumber(input.document.documentHeight, tracker, 0, 0, MAX_NUMBER),
    scrollWidth: boundedNumber(input.document.scrollWidth, tracker, 0, 0, MAX_NUMBER),
    scrollHeight: boundedNumber(input.document.scrollHeight, tracker, 0, 0, MAX_NUMBER),
  };
  if (document.language === null && input.document.language !== undefined && input.document.language !== null) {
    mark(tracker, 'metadata validity', 'Language metadata was invalid and omitted');
  }
  if (document.colorScheme === null && input.document.colorScheme !== undefined && input.document.colorScheme !== null) {
    mark(tracker, 'metadata validity', 'Color scheme metadata was invalid and omitted');
  }

  const allocator = new RefAllocator();
  const { structure, keyToRef } = buildStructure(input, allocator, tracker);
  const components = buildComponents(input, allocator, keyToRef, tracker);
  const layout = buildLayout(input, allocator, keyToRef, tracker);
  const designSystem = buildDesignSystem(input, tracker, requestId, capturedAt, origin);
  const motion = buildMotion(input, allocator, keyToRef, tracker);
  const responsive = buildResponsive(input, tracker);
  const visualReferences = buildVisualReferences(input, allocator, keyToRef, structure.nodes, tracker);

  const rootEvidence = evidenceFrom(input.evidence, tracker, 'Blueprint');
  appendEvidence(rootEvidence, EMPTY_EVIDENCE, tracker, 'Blueprint');
  const rootUnavailable = truncateValues(
    input.unavailable,
    BLUEPRINT_LIMITS.maxUnavailable,
    tracker,
    'maxUnavailable',
    'Blueprint unavailable notes were truncated',
  );
  const rootLimitations = truncateValues(
    input.limitations,
    BLUEPRINT_LIMITS.maxLimitations,
    tracker,
    'maxLimitations',
    'Blueprint limitations were truncated',
  );
  if (structure.nodes.length === 0) rootUnavailable.push('Structure observations were not supplied.');
  if (components.length === 0) rootUnavailable.push('Component observations were not supplied.');
  if (layout.length === 0) rootUnavailable.push('Layout observations were not supplied.');
  if (visualReferences.length === 0) rootUnavailable.push('Visual reference observations were not supplied.');
  if (motion.observations.length === 0) rootUnavailable.push('Motion observations were not available.');

  const metadata: BlueprintMetadata = {
    schemaVersion: BLUEPRINT_SCHEMA_VERSION,
    capturedAt,
    requestId,
    origin,
    viewport,
    document,
    status: 'complete',
    truncation: { truncated: false, reasons: [], limitsReached: [] },
  };
  const blueprint: WebsiteBlueprint = {
    metadata,
    refs: allocator.all(),
    structure,
    components,
    layout,
    designSystem,
    motion,
    responsive,
    visualReferences,
    evidence: {
      items: rootEvidence,
      unavailable: dedupe(rootUnavailable, BLUEPRINT_LIMITS.maxUnavailable),
      limitations: [],
    },
  };

  fitPayload(blueprint, tracker, rootLimitations);
  finalize(blueprint, tracker, rootLimitations);
  if (!isWebsiteBlueprint(blueprint)) {
    throw new Error('Website blueprint builder produced an invalid blueprint');
  }
  return blueprint;
}
