import { isWebsiteBlueprint } from '../../shared/messages';
import type { BlueprintAvailability, BlueprintEvidenceItem, WebsiteBlueprint } from '../../shared/types';
import {
  EXPORT_FORMATS,
  EXPORT_LIMITS,
  type ExportId,
  type ExportOptions,
  type ExportResult,
} from './types';

const NOT_DETECTED = 'not detected';
const NONE = 'none reported';

function assertValidBlueprint(value: unknown): WebsiteBlueprint {
  if (!isWebsiteBlueprint(value)) throw new TypeError('Invalid WebsiteBlueprint.');
  return value;
}

function normalizeMaxChars(options: ExportOptions | undefined): number {
  const max = options?.maxChars ?? EXPORT_LIMITS.maxOutputChars;
  if (!Number.isInteger(max) || max < 1 || max > EXPORT_LIMITS.maxOutputChars) {
    throw new RangeError(`Export limit must be between 1 and ${EXPORT_LIMITS.maxOutputChars} characters.`);
  }
  return max;
}

function dedupe(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

function text(value: string | null | undefined, fallback = NOT_DETECTED): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function list(values: readonly string[], fallback = NONE): string {
  return values.length > 0 ? values.join(', ') : fallback;
}

function formatGeometry(value: { x: number; y: number; width: number; height: number }): string {
  return `${Math.round(value.width)}×${Math.round(value.height)} @ ${Math.round(value.x)}, ${Math.round(value.y)}`;
}

function formatEvidenceItem(item: BlueprintEvidenceItem): string {
  return `${item.source} · ${item.status}${item.note ? ` · ${item.note}` : ''}`;
}

function formatEvidence(items: readonly BlueprintEvidenceItem[]): string {
  return items.length > 0 ? items.map(formatEvidenceItem).join('; ') : NONE;
}

function evidenceStatuses(items: readonly BlueprintEvidenceItem[]): string[] {
  return dedupe(items.map((item) => item.status));
}

function fields(values: ReadonlyArray<readonly [string, string | null]>): string {
  const parts = values.flatMap(([label, value]) => (value ? [`${label}: ${value}`] : []));
  return parts.length > 0 ? parts.join(', ') : NONE;
}

interface AvailabilitySection {
  label: string;
  unavailable: readonly string[];
  limitations: readonly string[];
}

function availabilitySections(blueprint: WebsiteBlueprint): AvailabilitySection[] {
  return [
    { label: 'Blueprint', unavailable: blueprint.evidence.unavailable, limitations: blueprint.evidence.limitations },
    { label: 'Structure', unavailable: blueprint.structure.unavailable, limitations: blueprint.structure.limitations },
    {
      label: 'Components',
      unavailable: blueprint.components.flatMap((component) => component.unavailable),
      limitations: blueprint.components.flatMap((component) => component.limitations),
    },
    {
      label: 'Layout',
      unavailable: blueprint.layout.flatMap((observation) => observation.unavailable),
      limitations: blueprint.layout.flatMap((observation) => observation.limitations),
    },
    { label: 'Design system', unavailable: blueprint.designSystem.unavailable, limitations: blueprint.designSystem.limitations },
    { label: 'Motion', unavailable: blueprint.motion.unavailable, limitations: blueprint.motion.limitations },
    { label: 'Responsive', unavailable: blueprint.responsive.unavailable, limitations: blueprint.responsive.limitations },
    {
      label: 'Visual references',
      unavailable: blueprint.visualReferences.flatMap((reference) => reference.unavailable),
      limitations: blueprint.visualReferences.flatMap((reference) => reference.limitations),
    },
  ];
}

function pushAvailability(lines: string[], blueprint: WebsiteBlueprint, kind: keyof BlueprintAvailability): void {
  let found = false;
  for (const section of availabilitySections(blueprint)) {
    const values = dedupe(section[kind]);
    if (values.length === 0) continue;
    found = true;
    lines.push(`- ${section.label}: ${values.join('; ')}`);
  }
  if (!found) lines.push(`- ${NONE}`);
}

function collectWarnings(blueprint: WebsiteBlueprint): string[] {
  const warnings: string[] = [];
  if (blueprint.metadata.status !== 'complete') {
    warnings.push(`Blueprint status: ${blueprint.metadata.status}.`);
  }
  if (blueprint.metadata.truncation.truncated) {
    warnings.push(
      `Blueprint was truncated. Reasons: ${list(blueprint.metadata.truncation.reasons)}. ` +
      `Limits reached: ${list(blueprint.metadata.truncation.limitsReached)}.`,
    );
  }
  for (const section of availabilitySections(blueprint)) {
    for (const limitation of section.limitations) {
      warnings.push(`${section.label} limitation: ${limitation}`);
    }
  }
  return warnings;
}

function boundedWarnings(values: readonly string[]): string[] {
  const unique = dedupe(values);
  if (unique.length <= EXPORT_LIMITS.maxWarnings) return unique;
  const kept = unique.slice(0, EXPORT_LIMITS.maxWarnings - 1);
  kept.push(`Additional warnings were omitted because the warning limit of ${EXPORT_LIMITS.maxWarnings} was reached.`);
  return kept;
}

function finish(
  id: ExportId,
  content: string,
  warnings: readonly string[],
  options: ExportOptions | undefined,
): ExportResult {
  const maxChars = normalizeMaxChars(options);
  if (content.length > maxChars) {
    throw new RangeError(`${EXPORT_FORMATS[id].title} output exceeds the ${maxChars}-character export limit.`);
  }
  const format = EXPORT_FORMATS[id];
  return {
    id,
    filename: format.filename,
    mimeType: format.mimeType,
    content,
    charCount: content.length,
    warnings: boundedWarnings(warnings),
  };
}

function pushViewport(lines: string[], blueprint: WebsiteBlueprint): void {
  const { viewport, document } = blueprint.metadata;
  lines.push(`- Viewport: ${viewport.width} × ${viewport.height} @ ${viewport.devicePixelRatio}x`);
  lines.push(`- Document: ${document.documentWidth} × ${document.documentHeight}`);
  lines.push(`- Scrollable area: ${document.scrollWidth} × ${document.scrollHeight}`);
  lines.push(`- Language: ${text(document.language)}`);
  lines.push(`- Colour scheme: ${text(document.colorScheme)}`);
}

export function serializeBlueprintJson(blueprint: unknown, options?: ExportOptions): ExportResult {
  const valid = assertValidBlueprint(blueprint);
  return finish('blueprint-json', JSON.stringify(valid, null, 2), collectWarnings(valid), options);
}

export function serializeImplementationBrief(blueprint: unknown, options?: ExportOptions): ExportResult {
  const valid = assertValidBlueprint(blueprint);
  const { metadata, structure, components, layout, designSystem, motion, responsive, visualReferences } = valid;
  const lines: string[] = [
    '# Implementation Brief',
    '',
    `Origin: ${metadata.origin}`,
    `Captured at: ${metadata.capturedAt}`,
    `Schema: ${metadata.schemaVersion}`,
    `Status: ${metadata.status}`,
    `Truncated: ${metadata.truncation.truncated ? 'yes' : 'no'}`,
    '',
    '## Viewport and document',
  ];

  pushViewport(lines, valid);

  lines.push('', '## Structure summary');
  const regions = structure.nodes.filter((node) => node.kind === 'region').length;
  const sections = structure.nodes.filter((node) => node.kind === 'section').length;
  lines.push(`- Nodes: ${structure.nodes.length}; regions: ${regions}; sections: ${sections}`);
  lines.push(`- Section refs: ${list(structure.sectionRefs)}`);
  lines.push(`- Evidence status: ${list(evidenceStatuses(structure.nodes.flatMap((node) => node.evidence)), 'unknown')}`);
  if (structure.nodes.length === 0) {
    lines.push('- No structure observations were supplied.');
  } else {
    for (const node of structure.nodes) {
      lines.push(
        `- ${node.ref} · ${node.kind} · ${node.category} · role ${text(node.role)} · ` +
        `parent ${text(node.parentRef)} · children ${list(node.childRefs)} · ${formatGeometry(node.geometry)}`,
      );
    }
  }

  lines.push('', '## Component summary');
  const occurrences = components.reduce((total, component) => total + component.occurrenceCount, 0);
  lines.push(`- Categories: ${components.length}; total occurrences: ${occurrences}`);
  if (components.length === 0) {
    lines.push('- No component observations were supplied.');
  } else {
    for (const component of components) {
      lines.push(
        `- ${component.ref} · ${component.category} · occurrences ${component.occurrenceCount} · ` +
        `sections ${list(component.sectionRefs)} · status ${list(evidenceStatuses(component.evidence), 'unknown')}`,
      );
    }
  }

  lines.push('', '## Layout observations');
  lines.push(`- Observations: ${layout.length}`);
  if (layout.length === 0) {
    lines.push('- No layout observations were supplied.');
  } else {
    for (const observation of layout) {
      lines.push(
        `- ${observation.ref} → ${observation.targetRef} · ${observation.display} · ` +
        `${fields([
          ['width', observation.dimensions.width],
          ['height', observation.dimensions.height],
          ['min-width', observation.dimensions.minWidth],
          ['max-width', observation.dimensions.maxWidth],
          ['row-gap', observation.gaps.rowGap],
          ['column-gap', observation.gaps.columnGap],
        ])}`,
      );
    }
  }

  lines.push('', '## Design system summary');
  lines.push(`- Elements scanned: ${designSystem.summary.elementsScanned}; skipped: ${designSystem.summary.elementsSkipped}`);
  lines.push(
    `- Stylesheets readable: ${designSystem.summary.stylesheetsReadable}; ` +
    `inaccessible: ${designSystem.summary.stylesheetsInaccessible}`,
  );
  lines.push(
    `- Detected values: color ${designSystem.detected.palette.length}; typography ${designSystem.detected.typography.length}; ` +
    `spacing ${designSystem.detected.spacing.length}; effect ${designSystem.detected.effects.length}; ` +
    `gradient ${designSystem.detected.gradients.length}`,
  );
  lines.push(`- Token candidates: ${designSystem.tokens.length}; names are inferred suggestions.`);

  lines.push('', '## Motion availability');
  lines.push(
    `- Animations: ${motion.summary.animationCount} (CSS ${motion.summary.cssAnimationCount}; ` +
    `WAAPI ${motion.summary.waapiCount}); transitions: ${motion.summary.transitionCount}; running: ${motion.summary.runningCount}`,
  );
  lines.push(`- Keyframe sets: ${motion.summary.keyframeSetCount}; easings: ${motion.easings.length}; observations: ${motion.observations.length}`);
  lines.push(`- Reduced motion preference: ${motion.reducedMotion ? 'preferred' : 'not preferred'}`);

  lines.push('', '## Responsive evidence');
  lines.push('- Only the captured viewport was observed.');
  lines.push(`- Observed viewport: ${responsive.observedViewport.width} × ${responsive.observedViewport.height}`);
  lines.push(`- Observed breakpoints: ${list(responsive.observedBreakpoints)}`);
  lines.push(`- Unobserved breakpoints: ${list(responsive.unobservedBreakpoints)}`);
  lines.push(`- Unobserved viewport states: ${list(responsive.unobservedViewportStates)}`);
  lines.push(`- Evidence: ${formatEvidence(responsive.evidence)}`);

  lines.push('', '## Visual reference summary');
  lines.push(`- References: ${visualReferences.length}`);
  if (visualReferences.length === 0) {
    lines.push('- No visual reference observations were supplied.');
  } else {
    for (const reference of visualReferences) {
      lines.push(
        `- ${reference.ref} → ${reference.targetRef} · ${formatGeometry(reference.geometry)} · ` +
        `descriptors ${list(reference.descriptors)}`,
      );
    }
  }

  lines.push('', '## Unavailable categories');
  pushAvailability(lines, valid, 'unavailable');

  lines.push('', '## Limitations and truncation warnings');
  lines.push(`- Truncated: ${metadata.truncation.truncated ? 'yes' : 'no'}`);
  lines.push(`- Reasons: ${list(metadata.truncation.reasons)}`);
  lines.push(`- Limits reached: ${list(metadata.truncation.limitsReached)}`);
  pushAvailability(lines, valid, 'limitations');
  lines.push(`- Summary: ${collectWarnings(valid).join(' ') || NONE}`);

  return finish('implementation-brief', lines.join('\n'), collectWarnings(valid), options);
}

export function serializeComponentInventory(blueprint: unknown, options?: ExportOptions): ExportResult {
  const valid = assertValidBlueprint(blueprint);
  const components = valid.components;
  const occurrences = components.reduce((total, component) => total + component.occurrenceCount, 0);
  const lines: string[] = [
    '# Component Inventory',
    '',
    `Source: validated WebsiteBlueprint ${valid.metadata.schemaVersion}`,
    `Origin: ${valid.metadata.origin}`,
    `Captured at: ${valid.metadata.capturedAt}`,
    `Component categories: ${components.length}`,
    `Total occurrences: ${occurrences}`,
    '',
  ];

  if (components.length === 0) {
    lines.push('No component observations were supplied.');
  }

  for (const component of components) {
    lines.push(`## ${component.ref} · ${component.category}`, '');
    lines.push(`- Local ref: ${component.ref}`);
    lines.push(`- Classification status: ${list(evidenceStatuses(component.evidence), 'unknown')}`);
    lines.push(`- Occurrences: ${component.occurrenceCount}`);
    lines.push(`- Section refs: ${list(component.sectionRefs)}`);
    lines.push(`- Evidence: ${formatEvidence(component.evidence)}`);
    lines.push(`- Unavailable: ${list(component.unavailable)}`);
    lines.push(`- Limitations: ${list(component.limitations)}`);
    if (component.examples.length === 0) {
      lines.push('- Examples: none reported');
    } else {
      lines.push('- Examples:');
      for (const example of component.examples) {
        lines.push(
          `  - ${example.ref} · selector hint: ${text(example.selectorHint)} · ` +
          `${formatGeometry(example.geometry)} · evidence: ${formatEvidence(example.evidence)}`,
        );
      }
    }
    lines.push('');
  }

  return finish('component-inventory', lines.join('\n').trimEnd(), collectWarnings(valid), options);
}

export function serializeLayoutSpecification(blueprint: unknown, options?: ExportOptions): ExportResult {
  const valid = assertValidBlueprint(blueprint);
  const { metadata, structure, layout, responsive } = valid;
  const lines: string[] = [
    '# Layout Specification',
    '',
    'Scope: only the captured viewport was observed; other viewport states were not observed.',
    '',
    '## Current viewport',
  ];

  pushViewport(lines, valid);

  lines.push('', '## Structure and layout relationships');
  if (structure.nodes.length === 0) {
    lines.push('- No structure observations were supplied.');
  } else {
    for (const node of structure.nodes) {
      lines.push(
        `- ${node.ref} · ${node.kind} · ${node.category} · parent ${text(node.parentRef)} · ` +
        `children ${list(node.childRefs)}`,
      );
    }
  }
  lines.push(`- Layout observations: ${layout.length}`);
  if (layout.length === 0) {
    lines.push('- No layout observations were supplied.');
  } else {
    for (const observation of layout) {
      lines.push(`- ${observation.ref} → ${observation.targetRef} · display ${observation.display}`);
      lines.push(
        `  - Dimensions: ${fields([
          ['width', observation.dimensions.width],
          ['height', observation.dimensions.height],
          ['min-width', observation.dimensions.minWidth],
          ['max-width', observation.dimensions.maxWidth],
        ])}`,
      );
      lines.push(
        `  - Alignment: ${fields([
          ['align-items', observation.alignment.alignItems],
          ['align-self', observation.alignment.alignSelf],
          ['justify-content', observation.alignment.justifyContent],
          ['justify-self', observation.alignment.justifySelf],
          ['text-align', observation.alignment.textAlign],
        ])}`,
      );
      lines.push(
        `  - Gaps: ${fields([
          ['row-gap', observation.gaps.rowGap],
          ['column-gap', observation.gaps.columnGap],
        ])}`,
      );
      lines.push(
        `  - Positioning: ${fields([
          ['position', observation.positioning.position],
          ['top', observation.positioning.top],
          ['right', observation.positioning.right],
          ['bottom', observation.positioning.bottom],
          ['left', observation.positioning.left],
          ['z-index', observation.positioning.zIndex],
        ])}`,
      );
      lines.push(
        `  - Flex: ${observation.flex ? fields([
          ['direction', observation.flex.direction],
          ['wrap', observation.flex.wrap],
          ['align-items', observation.flex.alignItems],
          ['justify-content', observation.flex.justifyContent],
        ]) : NONE}`,
      );
      lines.push(
        `  - Grid: ${observation.grid ? fields([
          ['template-columns', observation.grid.templateColumns],
          ['template-rows', observation.grid.templateRows],
          ['row-gap', observation.grid.rowGap],
          ['column-gap', observation.grid.columnGap],
        ]) : NONE}`,
      );
      lines.push(`  - Evidence: ${formatEvidence(observation.evidence)}`);
      lines.push(`  - Unavailable: ${list(observation.unavailable)}`);
      lines.push(`  - Limitations: ${list(observation.limitations)}`);
    }
  }

  lines.push('', '## Geometry observations');
  if (structure.nodes.length === 0 && valid.visualReferences.length === 0) {
    lines.push('- No geometry observations were supplied.');
  } else {
    for (const node of structure.nodes) {
      lines.push(`- ${node.ref} · ${formatGeometry(node.geometry)}`);
    }
    for (const reference of valid.visualReferences) {
      lines.push(`- ${reference.ref} → ${reference.targetRef} · ${formatGeometry(reference.geometry)} · descriptors ${list(reference.descriptors)}`);
    }
  }

  lines.push('', '## Responsive observations');
  lines.push(`- Observed viewport: ${responsive.observedViewport.width} × ${responsive.observedViewport.height}`);
  lines.push(`- Observed breakpoints: ${list(responsive.observedBreakpoints)}`);
  lines.push(`- Unobserved breakpoints: ${list(responsive.unobservedBreakpoints)}`);
  lines.push(`- Unobserved viewport states: ${list(responsive.unobservedViewportStates)}`);
  lines.push(`- Evidence: ${formatEvidence(responsive.evidence)}`);

  lines.push('', '## Explicit limitations');
  lines.push(`- Truncated: ${metadata.truncation.truncated ? 'yes' : 'no'}`);
  lines.push(`- Reasons: ${list(metadata.truncation.reasons)}`);
  lines.push(`- Limits reached: ${list(metadata.truncation.limitsReached)}`);
  pushAvailability(lines, valid, 'limitations');
  pushAvailability(lines, valid, 'unavailable');

  return finish('layout-specification', lines.join('\n'), collectWarnings(valid), options);
}
