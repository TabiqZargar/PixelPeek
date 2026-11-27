import {
  BLUEPRINT_APPROVED_ROLES,
  BLUEPRINT_COMPONENT_CATEGORIES,
  BLUEPRINT_DISPLAY_MODES,
  BLUEPRINT_LIMITS,
  BLUEPRINT_STRUCTURE_CATEGORIES,
  DESIGN_SYSTEM_LIMITS,
  type BlueprintAriaRole,
  type BlueprintComponentCategory,
  type BlueprintDisplayMode,
  type BlueprintStructureCategory,
  type MotionSnapshot,
  type WebsiteBlueprint,
} from '../shared/types';
import { isWebsiteBlueprint } from '../shared/messages';
import { sanitizeCssValue } from './css';
import {
  buildDesignSystemSnapshotFromSample,
  sampleDesignSystemElements,
  type DesignSampleDeps,
  type DesignSamplingResult,
  type DesignStylesheetRecord,
  type DesignSystemLimits,
  type SampledDesignElement,
} from './design-system';
import {
  buildWebsiteBlueprint,
  type WebsiteBlueprintComponentInput,
  type WebsiteBlueprintDocumentInput,
  type WebsiteBlueprintEvidenceInput,
  type WebsiteBlueprintGeometryInput,
  type WebsiteBlueprintInput,
  type WebsiteBlueprintLayoutInput,
  type WebsiteBlueprintMotionInput,
  type WebsiteBlueprintMotionLabelInput,
  type WebsiteBlueprintStructureInput,
  type WebsiteBlueprintVisualInput,
} from './website-blueprint';

export interface WebsiteBlueprintViewportInput {
  width: number;
  height: number;
  devicePixelRatio: number;
}

export interface WebsiteBlueprintCaptureDeps {
  root: () => unknown;
  sample: DesignSampleDeps;
  readStylesheets: () => ReadonlyArray<DesignStylesheetRecord>;
  now: () => string;
  origin: () => string;
  viewport: () => WebsiteBlueprintViewportInput;
  documentInfo: () => WebsiteBlueprintDocumentInput;
  motion?: () => MotionSnapshot | null;
  motionTargets?: () => Readonly<Record<string, string | null | undefined>>;
  motionLabels?: () => Readonly<Record<string, WebsiteBlueprintMotionLabelInput | undefined>>;
  limits?: Partial<DesignSystemLimits>;
}

interface SemanticInfo {
  kind: 'region' | 'section';
  category: BlueprintStructureCategory;
  role: BlueprintAriaRole;
}

interface StructureCandidate {
  key: string;
  element: SampledDesignElement;
  semantic: SemanticInfo;
}

interface ComponentGroup {
  count: number;
  examples: SampledDesignElement[];
  sectionKeys: Set<string>;
  examplesTruncated: boolean;
  sectionsTruncated: boolean;
}

const STRUCTURE_BY_TAG: Readonly<Record<string, SemanticInfo>> = {
  header: { kind: 'region', category: 'banner', role: 'banner' },
  nav: { kind: 'region', category: 'navigation', role: 'navigation' },
  aside: { kind: 'region', category: 'complementary', role: 'complementary' },
  footer: { kind: 'region', category: 'contentinfo', role: 'contentinfo' },
  main: { kind: 'section', category: 'main', role: 'main' },
  form: { kind: 'section', category: 'form', role: 'form' },
  section: { kind: 'section', category: 'section', role: 'region' },
  article: { kind: 'section', category: 'article', role: 'article' },
  ul: { kind: 'section', category: 'list', role: 'list' },
  ol: { kind: 'section', category: 'list', role: 'list' },
  table: { kind: 'section', category: 'table', role: 'table' },
  dialog: { kind: 'section', category: 'dialog', role: 'dialog' },
};

const STRUCTURE_BY_ROLE: Readonly<Partial<Record<BlueprintAriaRole, SemanticInfo>>> = {
  banner: STRUCTURE_BY_TAG.header!,
  navigation: STRUCTURE_BY_TAG.nav!,
  complementary: STRUCTURE_BY_TAG.aside!,
  contentinfo: STRUCTURE_BY_TAG.footer!,
  main: STRUCTURE_BY_TAG.main!,
  search: { kind: 'section', category: 'search', role: 'search' },
  form: STRUCTURE_BY_TAG.form!,
  region: { kind: 'section', category: 'region', role: 'region' },
  article: STRUCTURE_BY_TAG.article!,
  section: { kind: 'section', category: 'section', role: 'region' },
  list: STRUCTURE_BY_TAG.ul!,
  table: STRUCTURE_BY_TAG.table!,
  dialog: STRUCTURE_BY_TAG.dialog!,
};

const COMPONENT_BY_TAG: Readonly<Record<string, BlueprintComponentCategory>> = {
  button: 'button',
  a: 'link',
  img: 'image',
  picture: 'image',
  svg: 'icon',
  li: 'list-item',
  tr: 'table-row',
  video: 'media',
  audio: 'media',
};

const COMPONENT_BY_ROLE: Readonly<Partial<Record<BlueprintAriaRole, BlueprintComponentCategory>>> = {
  button: 'button',
  link: 'link',
  img: 'image',
  listitem: 'list-item',
  row: 'table-row',
};

const DETECTED_EVIDENCE: readonly WebsiteBlueprintEvidenceInput[] = [
  { source: 'sampling', status: 'detected', note: null },
];

const GEOMETRY_EVIDENCE: readonly WebsiteBlueprintEvidenceInput[] = [
  { source: 'geometry', status: 'detected', note: null },
];

const COMPUTED_STYLE_EVIDENCE: readonly WebsiteBlueprintEvidenceInput[] = [
  { source: 'computed-style', status: 'detected', note: null },
];

const UNAVAILABLE_EVIDENCE: readonly WebsiteBlueprintEvidenceInput[] = [
  { source: 'unavailable', status: 'unknown', note: 'Only the current viewport was observed.' },
];

function safeCss(value: unknown): string | null {
  return sanitizeCssValue(typeof value === 'string' ? value : null);
}

function addBoundedNote(list: string[], value: unknown, max: number): boolean {
  const note = safeCss(value);
  if (!note || list.includes(note)) return true;
  if (list.length < max) {
    list.push(note);
    return true;
  }
  const truncation = 'Additional observations were truncated due to limits.';
  if (list[list.length - 1] !== truncation) list[list.length - 1] = truncation;
  return false;
}

function originOnly(value: unknown): string | null {
  const text = safeCss(value);
  if (!text) return null;
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function positiveFinite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegativeFinite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function readSafely<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}

function isApprovedRole(value: string | null): value is BlueprintAriaRole {
  return value !== null &&
    (BLUEPRINT_APPROVED_ROLES as readonly string[]).includes(value);
}

function isDisplayMode(value: string | null): value is BlueprintDisplayMode {
  return value !== null &&
    (BLUEPRINT_DISPLAY_MODES as readonly string[]).includes(value);
}

function isStructureCategory(value: BlueprintStructureCategory): boolean {
  return (BLUEPRINT_STRUCTURE_CATEGORIES as readonly string[]).includes(value);
}

function isComponentCategory(value: BlueprintComponentCategory): boolean {
  return (BLUEPRINT_COMPONENT_CATEGORIES as readonly string[]).includes(value);
}

function isAttached(node: unknown): boolean {
  if (typeof node !== 'object' && typeof node !== 'function') return true;
  return (node as { isConnected?: unknown }).isConnected !== false;
}

function semanticFor(element: SampledDesignElement): SemanticInfo | null {
  const role = isApprovedRole(element.roleHint) ? element.roleHint : null;
  if (role) {
    const byRole = STRUCTURE_BY_ROLE[role];
    if (byRole && isStructureCategory(byRole.category)) return byRole;
  }
  const byTag = STRUCTURE_BY_TAG[element.tag];
  return byTag && isStructureCategory(byTag.category) ? byTag : null;
}

function componentFor(element: SampledDesignElement): BlueprintComponentCategory | null {
  const role = isApprovedRole(element.roleHint) ? element.roleHint : null;
  if (role) {
    const byRole = COMPONENT_BY_ROLE[role];
    if (byRole && isComponentCategory(byRole)) return byRole;
  }
  const byTag = COMPONENT_BY_TAG[element.tag];
  return byTag && isComponentCategory(byTag) ? byTag : null;
}

function geometryOf(element: SampledDesignElement): WebsiteBlueprintGeometryInput | undefined {
  const { x, y, width, height } = element.geometry;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined;
  return {
    x: nonNegativeFinite(x, 0),
    y: nonNegativeFinite(y, 0),
    width,
    height,
  };
}

function nearestStructureKey(
  node: unknown,
  parentByNode: ReadonlyMap<unknown, unknown>,
  structureKeys: ReadonlyMap<unknown, string>,
): string | null {
  let current = node;
  const seen = new Set<unknown>();
  while (current !== null && current !== undefined && !seen.has(current)) {
    seen.add(current);
    const key = structureKeys.get(current);
    if (key) return key;
    current = parentByNode.get(current);
  }
  return null;
}

function displayMode(style: Readonly<Record<string, string>>): BlueprintDisplayMode {
  const display = safeCss(style.display);
  const position = safeCss(style.position);
  if (display === 'inline-flex') return 'flex';
  if (display === 'inline-grid') return 'grid';
  if (display === 'inline-block') return 'inline';
  if (display?.startsWith('table')) return 'table';
  if (isDisplayMode(display)) return display;
  if (!display && (position === 'absolute' || position === 'fixed' || position === 'sticky')) {
    return 'positioned';
  }
  return 'unknown';
}

function layoutFor(
  key: string,
  element: SampledDesignElement,
): WebsiteBlueprintLayoutInput {
  const style = element.style;
  const flexValues = {
    direction: safeCss(style['flex-direction']),
    wrap: safeCss(style['flex-wrap']),
    alignItems: safeCss(style['align-items']),
    justifyContent: safeCss(style['justify-content']),
  };
  const gridValues = {
    templateColumns: safeCss(style['grid-template-columns']),
    templateRows: safeCss(style['grid-template-rows']),
    rowGap: safeCss(style['grid-row-gap']),
    columnGap: safeCss(style['grid-column-gap']),
  };
  const hasFlex = Object.values(flexValues).some(Boolean);
  const hasGrid = Object.values(gridValues).some(Boolean);
  return {
    targetKey: key,
    display: displayMode(style),
    width: safeCss(style.width),
    height: safeCss(style.height),
    minWidth: safeCss(style['min-width']),
    maxWidth: safeCss(style['max-width']),
    alignItems: safeCss(style['align-items']),
    alignSelf: safeCss(style['align-self']),
    justifyContent: safeCss(style['justify-content']),
    justifySelf: safeCss(style['justify-self']),
    textAlign: safeCss(style['text-align']),
    rowGap: safeCss(style['row-gap']) ?? safeCss(style.gap),
    columnGap: safeCss(style['column-gap']) ?? safeCss(style.gap),
    position: safeCss(style.position),
    top: safeCss(style.top),
    right: safeCss(style.right),
    bottom: safeCss(style.bottom),
    left: safeCss(style.left),
    zIndex: safeCss(style['z-index']),
    flex: hasFlex ? flexValues : null,
    grid: hasGrid ? gridValues : null,
    evidence: COMPUTED_STYLE_EVIDENCE,
  };
}

function visualDescriptors(element: SampledDesignElement): string[] {
  const style = element.style;
  const descriptors = [
    displayMode(style),
    safeCss(style.width),
    safeCss(style['max-width']),
    safeCss(style.padding),
    safeCss(style.position),
    safeCss(style['row-gap']) ?? safeCss(style.gap),
  ];
  return descriptors
    .filter((value): value is string => Boolean(value))
    .slice(0, BLUEPRINT_LIMITS.maxEvidenceItemsPerObservation);
}

export function captureWebsiteBlueprint(
  requestId: string,
  deps: WebsiteBlueprintCaptureDeps,
): WebsiteBlueprint {
  const unavailable: string[] = [];
  const limitations: string[] = [];
  const sampled = sampleDesignSystemElements(
    readSafely(() => deps.root(), null),
    deps.sample,
    deps.limits,
  );
  const attached = sampled.elements.filter((element) => isAttached(element.node));
  const detachedCount = sampled.elements.length - attached.length;
  if (detachedCount > 0) {
    addBoundedNote(limitations, `${detachedCount} detached element(s) were excluded.`, BLUEPRINT_LIMITS.maxLimitations);
  }
  for (const note of sampled.notes) {
    addBoundedNote(limitations, note, BLUEPRINT_LIMITS.maxLimitations);
  }

  const filteredSample: DesignSamplingResult = {
    elements: attached,
    skipped: Math.min(
      sampled.skipped + detachedCount,
      deps.limits?.maxElements ?? DESIGN_SYSTEM_LIMITS.maxElements,
    ),
    notes: sampled.notes,
  };
  const capturedAt = safeCss(readSafely(() => deps.now(), '')) ?? '1970-01-01T00:00:00.000Z';
  const origin = originOnly(readSafely(() => deps.origin(), '')) ?? '';
  const designSystem = buildDesignSystemSnapshotFromSample(requestId, filteredSample, {
    readStylesheets: () => readSafely(
      () => deps.readStylesheets(),
      [] as ReadonlyArray<DesignStylesheetRecord>,
    ),
    now: () => capturedAt,
    origin: () => origin,
    limits: deps.limits,
  });
  for (const note of designSystem.limitations) {
    addBoundedNote(limitations, note, BLUEPRINT_LIMITS.maxLimitations);
  }
  for (const note of designSystem.unavailable) {
    addBoundedNote(unavailable, note, BLUEPRINT_LIMITS.maxUnavailable);
  }

  const parentByNode = new Map<unknown, unknown>();
  const keyByNode = new Map<unknown, string>();
  attached.forEach((element, index) => {
    const key = `node-${index + 1}`;
    keyByNode.set(element.node, key);
    parentByNode.set(element.node, element.parentNode);
  });

  const candidates: StructureCandidate[] = [];
  attached.forEach((element) => {
    const semantic = semanticFor(element);
    const key = keyByNode.get(element.node);
    if (!semantic || !key) return;
    candidates.push({ key, element, semantic });
  });

  const validCandidates = candidates.filter((candidate) => geometryOf(candidate.element) !== undefined);
  if (candidates.length > validCandidates.length) {
    addBoundedNote(
      limitations,
      `${candidates.length - validCandidates.length} structure observation(s) lacked usable geometry.`,
      BLUEPRINT_LIMITS.maxLimitations,
    );
  }
  if (validCandidates.length > BLUEPRINT_LIMITS.maxStructureNodes) {
    addBoundedNote(
      limitations,
      `Structure observations were limited to ${BLUEPRINT_LIMITS.maxStructureNodes} nodes.`,
      BLUEPRINT_LIMITS.maxLimitations,
    );
  }
  const included = validCandidates.slice(0, BLUEPRINT_LIMITS.maxStructureNodes);
  const structureKeys = new Map<unknown, string>();
  for (const candidate of included) structureKeys.set(candidate.element.node, candidate.key);

  const structure: WebsiteBlueprintStructureInput[] = included.map((candidate) => ({
    key: candidate.key,
    parentKey: nearestStructureKey(candidate.element.parentNode, parentByNode, structureKeys),
    kind: candidate.semantic.kind,
    category: candidate.semantic.category,
    role: candidate.semantic.role,
    geometry: geometryOf(candidate.element),
    evidence: GEOMETRY_EVIDENCE,
  }));

  const groups = new Map<BlueprintComponentCategory, ComponentGroup>();
  for (const element of attached) {
    const category = componentFor(element);
    if (!category) continue;
    let group = groups.get(category);
    if (!group) {
      group = { count: 0, examples: [], sectionKeys: new Set(), examplesTruncated: false, sectionsTruncated: false };
      groups.set(category, group);
    }
    if (group.count >= BLUEPRINT_LIMITS.maxBlueprintElements) {
      if (!group.examplesTruncated) {
        group.examplesTruncated = true;
        addBoundedNote(
          limitations,
          `Component occurrences were limited to ${BLUEPRINT_LIMITS.maxBlueprintElements} elements.`,
          BLUEPRINT_LIMITS.maxLimitations,
        );
      }
      continue;
    }
    group.count += 1;
    if (group.examples.length < BLUEPRINT_LIMITS.maxEvidenceItemsPerObservation) {
      group.examples.push(element);
    } else if (!group.examplesTruncated) {
      group.examplesTruncated = true;
      addBoundedNote(
        limitations,
        `Component examples were limited to ${BLUEPRINT_LIMITS.maxEvidenceItemsPerObservation} per category.`,
        BLUEPRINT_LIMITS.maxLimitations,
      );
    }
    const sectionKey = nearestStructureKey(element.node, parentByNode, structureKeys);
    if (sectionKey && group.sectionKeys.size < BLUEPRINT_LIMITS.maxSections) {
      group.sectionKeys.add(sectionKey);
    } else if (sectionKey && !group.sectionsTruncated) {
      group.sectionsTruncated = true;
      addBoundedNote(
        limitations,
        `Component section references were limited to ${BLUEPRINT_LIMITS.maxSections} per category.`,
        BLUEPRINT_LIMITS.maxLimitations,
      );
    }
  }

  const components: WebsiteBlueprintComponentInput[] = [];
  for (const [category, group] of groups) {
    if (components.length >= BLUEPRINT_LIMITS.maxComponents) {
      addBoundedNote(
        limitations,
        `Component categories were limited to ${BLUEPRINT_LIMITS.maxComponents}.`,
        BLUEPRINT_LIMITS.maxLimitations,
      );
      break;
    }
    components.push({
      category,
      occurrenceCount: group.count,
      sectionKeys: Array.from(group.sectionKeys),
      examples: group.examples.map((element) => ({
        selectorHint: safeCss(element.selector),
        geometry: geometryOf(element),
        evidence: GEOMETRY_EVIDENCE,
      })),
      evidence: DETECTED_EVIDENCE,
      classificationStatus: 'detected',
    });
  }

  const layout: WebsiteBlueprintLayoutInput[] = [];
  for (const candidate of included) {
    if (layout.length >= BLUEPRINT_LIMITS.maxLayoutObservations) {
      addBoundedNote(
        limitations,
        `Layout observations were limited to ${BLUEPRINT_LIMITS.maxLayoutObservations}.`,
        BLUEPRINT_LIMITS.maxLimitations,
      );
      break;
    }
    layout.push(layoutFor(candidate.key, candidate.element));
  }

  const visualReferences: WebsiteBlueprintVisualInput[] = [];
  for (const candidate of included) {
    if (visualReferences.length >= BLUEPRINT_LIMITS.maxSections) {
      addBoundedNote(
        limitations,
        `Visual references were limited to ${BLUEPRINT_LIMITS.maxSections}.`,
        BLUEPRINT_LIMITS.maxLimitations,
      );
      break;
    }
    visualReferences.push({
      targetKey: candidate.key,
      geometry: geometryOf(candidate.element),
      descriptors: visualDescriptors(candidate.element),
      evidence: GEOMETRY_EVIDENCE,
    });
  }

  let motion: WebsiteBlueprintMotionInput | null = null;
  const motionSnapshot = readSafely(() => deps.motion?.() ?? null, null);
  if (motionSnapshot) {
    motion = {
      snapshot: motionSnapshot,
      targets: readSafely(() => deps.motionTargets?.() ?? {}, {}),
      labels: readSafely(() => deps.motionLabels?.() ?? {}, {}),
    };
  } else {
    addBoundedNote(
      unavailable,
      'Motion observations were not available in this capture.',
      BLUEPRINT_LIMITS.maxUnavailable,
    );
  }

  const rawViewport = readSafely(() => deps.viewport(), {
    width: 1,
    height: 1,
    devicePixelRatio: 1,
  });
  const rawDocument = readSafely(() => deps.documentInfo(), {
    language: null,
    colorScheme: null,
    documentWidth: 1,
    documentHeight: 1,
    scrollWidth: 1,
    scrollHeight: 1,
  });

  const input: WebsiteBlueprintInput = {
    requestId,
    capturedAt,
    origin,
    viewport: {
      width: positiveFinite(rawViewport.width, 1),
      height: positiveFinite(rawViewport.height, 1),
      devicePixelRatio: positiveFinite(rawViewport.devicePixelRatio, 1),
    },
    document: {
      language: safeCss(rawDocument.language),
      colorScheme: safeCss(rawDocument.colorScheme),
      documentWidth: positiveFinite(rawDocument.documentWidth, 1),
      documentHeight: positiveFinite(rawDocument.documentHeight, 1),
      scrollWidth: positiveFinite(rawDocument.scrollWidth, 1),
      scrollHeight: positiveFinite(rawDocument.scrollHeight, 1),
    },
    structure,
    components,
    layout,
    designSystem,
    motion,
    responsive: {
      observedBreakpoints: ['current viewport'],
      unobservedBreakpoints: ['other viewport sizes were not observed'],
      unobservedViewportStates: ['hover, focus, and resize states were not observed'],
      evidence: UNAVAILABLE_EVIDENCE,
    },
    visualReferences,
    evidence: DETECTED_EVIDENCE,
    unavailable,
    limitations,
  };

  const blueprint = buildWebsiteBlueprint(input);
  if (!isWebsiteBlueprint(blueprint)) {
    throw new Error('Website blueprint capture produced an invalid blueprint');
  }
  return blueprint;
}
