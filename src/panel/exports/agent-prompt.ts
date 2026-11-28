import { isWebsiteBlueprint } from '../../shared/messages';
import {
  DESIGN_SYSTEM_CATEGORIES,
  type BlueprintAvailability,
  type BlueprintEvidenceItem,
  type DesignDetectedValues,
  type DesignSystemCategory,
  type WebsiteBlueprint,
} from '../../shared/types';
import { escapeMarkdown } from './serialize';
import { EXPORT_FORMATS, EXPORT_LIMITS, type ExportOptions, type ExportResult } from './types';

const NONE = 'none reported';
const NOT_OBSERVED = 'not observed';

const CATEGORY_FIELDS: Record<DesignSystemCategory, keyof DesignDetectedValues> = {
  color: 'palette',
  typography: 'typography',
  spacing: 'spacing',
  effect: 'effects',
  gradient: 'gradients',
};

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

function md(value: string | null | undefined, fallback = NOT_OBSERVED): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? escapeMarkdown(trimmed) : fallback;
}

function dedupe(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

function list(values: readonly string[], fallback = NONE): string {
  return values.length > 0 ? values.map((value) => md(value)).join(', ') : fallback;
}

function formatGeometry(value: { x: number; y: number; width: number; height: number }): string {
  return `${Math.round(value.width)}×${Math.round(value.height)} @ ${Math.round(value.x)}, ${Math.round(value.y)}`;
}

function formatEvidence(items: readonly BlueprintEvidenceItem[]): string {
  if (items.length === 0) return NONE;
  return items
    .map((item) => `${md(item.source)} (${md(item.status)})${item.note ? `: ${md(item.note)}` : ''}`)
    .join('; ');
}

function evidenceStatuses(items: readonly BlueprintEvidenceItem[]): string[] {
  return dedupe(items.map((item) => item.status));
}

function fields(values: ReadonlyArray<readonly [string, string | null]>): string {
  const parts = values.flatMap(([label, value]) => (value ? [`${label}: ${md(value)}`] : []));
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
    lines.push(`- ${section.label}: ${values.map((value) => md(value)).join('; ')}`);
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

function finish(content: string, warnings: readonly string[], options: ExportOptions | undefined): ExportResult {
  const maxChars = normalizeMaxChars(options);
  if (content.length > maxChars) {
    throw new RangeError(`Blueprint Agent Prompt output exceeds the ${maxChars}-character export limit.`);
  }
  const format = EXPORT_FORMATS['blueprint-agent-prompt'];
  return {
    id: 'blueprint-agent-prompt',
    filename: format.filename,
    mimeType: format.mimeType,
    content,
    charCount: content.length,
    warnings: boundedWarnings(warnings),
  };
}

function pushRoleAndObjective(lines: string[], blueprint: WebsiteBlueprint): void {
  lines.push(
    '## 1. Role and objective',
    '',
    'You are a coding agent implementing the website described by the supplied blueprint.',
    'Treat the blueprint as a source of observed evidence, not as a complete specification.',
    `- Blueprint schema: ${md(blueprint.metadata.schemaVersion)}`,
    `- Extraction status: ${md(blueprint.metadata.status)}`,
    '',
  );
}

function pushImplementationInstructions(lines: string[]): void {
  lines.push(
    '## 2. Implementation instructions',
    '',
    '- Inspect the existing project before making changes.',
    '- Reuse its framework, dependencies, conventions and design system.',
    '- Avoid unnecessary dependencies.',
    '- Build incrementally and verify changes with the checks available in the project.',
    '',
  );
}

function pushPageStructure(lines: string[], blueprint: WebsiteBlueprint): void {
  const { structure, components } = blueprint;
  const occurrences = components.reduce((total, component) => total + component.occurrenceCount, 0);
  lines.push(
    '## 3. Page structure',
    '',
    'Preserve only the parent/child and section relationships supported by the blueprint.',
    'Do not invent missing sections or components.',
    `- Structure nodes: ${structure.nodes.length}; section refs: ${list(structure.sectionRefs)}`,
  );
  if (structure.nodes.length === 0) {
    lines.push('- No structure observations were supplied.');
  } else {
    for (const node of structure.nodes) {
      lines.push(
        `- ${md(node.ref)} · ${md(node.kind)} · ${md(node.category)} · role ${md(node.role)} · ` +
        `parent ${md(node.parentRef)} · children ${list(node.childRefs)} · ${formatGeometry(node.geometry)}`,
      );
      lines.push(`  - Evidence: ${formatEvidence(node.evidence)}`);
    }
  }

  lines.push(`- Component categories: ${components.length}; total occurrences: ${occurrences}`);
  if (components.length === 0) {
    lines.push('- No component observations were supplied.');
  } else {
    for (const component of components) {
      lines.push(
        `- ${md(component.ref)} · ${md(component.category)} · occurrences ${component.occurrenceCount} · ` +
        `section refs ${list(component.sectionRefs)} · status ${list(evidenceStatuses(component.evidence), 'unknown')}`,
      );
      lines.push(`  - Evidence: ${formatEvidence(component.evidence)}`);
      if (component.examples.length === 0) {
        lines.push('  - Examples: none reported');
      } else {
        for (const example of component.examples) {
          lines.push(
            `  - Example ${md(example.ref)} · selector hint ${md(example.selectorHint)} · ` +
            `${formatGeometry(example.geometry)} · evidence ${formatEvidence(example.evidence)}`,
          );
        }
      }
    }
  }
  lines.push('');
}

function pushLayout(lines: string[], blueprint: WebsiteBlueprint): void {
  const { metadata, layout, visualReferences } = blueprint;
  lines.push(
    '## 4. Layout',
    '',
    'Measurements represent the captured viewport only.',
    'Do not extrapolate unobserved breakpoints or viewport states.',
    `- Captured viewport: ${metadata.viewport.width} × ${metadata.viewport.height} @ ${metadata.viewport.devicePixelRatio}x`,
    `- Layout observations: ${layout.length}`,
  );
  if (layout.length === 0) {
    lines.push('- No layout observations were supplied.');
  } else {
    for (const observation of layout) {
      lines.push(`- ${md(observation.ref)} → ${md(observation.targetRef)} · display ${md(observation.display)}`);
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
    }
  }

  lines.push(`- Visual geometry references: ${visualReferences.length}`);
  if (visualReferences.length === 0) {
    lines.push('- No visual geometry observations were supplied.');
  } else {
    for (const reference of visualReferences) {
      lines.push(
        `- ${md(reference.ref)} → ${md(reference.targetRef)} · ${formatGeometry(reference.geometry)} · ` +
        `descriptors ${list(reference.descriptors)}`,
      );
    }
  }
  lines.push('');
}

function pushDesignSystem(lines: string[], blueprint: WebsiteBlueprint): void {
  const { designSystem } = blueprint;
  lines.push(
    '## 5. Design system',
    '',
    'Use detected design tokens and values where available.',
    'Preserve the distinction between detected values and inferred token names.',
    'Treat inferred token names as suggestions, not confirmed facts.',
    `- Elements scanned: ${designSystem.summary.elementsScanned}; skipped: ${designSystem.summary.elementsSkipped}`,
    `- Stylesheets readable: ${designSystem.summary.stylesheetsReadable}; inaccessible: ${designSystem.summary.stylesheetsInaccessible}`,
    '',
    'Detected values:',
  );
  for (const category of DESIGN_SYSTEM_CATEGORIES) {
    const entries = designSystem.detected[CATEGORY_FIELDS[category]];
    const values = entries.map((entry) => `${md(entry.value)} (${entry.count} uses)`);
    lines.push(`- ${category}: ${values.length > 0 ? values.join(', ') : NONE}`);
  }

  lines.push('', 'Inferred token candidates:');
  if (designSystem.tokens.length === 0) {
    lines.push(`- ${NONE}`);
  } else {
    for (const token of designSystem.tokens) {
      lines.push(
        `- ${md(token.inferredName)} · ${md(token.category)} · support ${token.detected.support} · ` +
        `basis ${md(token.nameBasis)} · values ${list(token.detected.values.map((entry) => entry.value))}`,
      );
    }
  }
  lines.push('');
}

function pushMotion(lines: string[], blueprint: WebsiteBlueprint): void {
  const { motion } = blueprint;
  lines.push(
    '## 6. Motion',
    '',
    'Include only observed motion information.',
    'Do not invent animations or interaction behavior.',
    `- CSS animations: ${motion.summary.cssAnimationCount}; transitions: ${motion.summary.transitionCount}; ` +
    `WAAPI animations: ${motion.summary.waapiCount}; running at capture: ${motion.summary.runningCount}`,
    `- Keyframe sets: ${motion.summary.keyframeSetCount}; easings: ${motion.easings.length}`,
    `- Reduced motion preference: ${motion.reducedMotion ? 'preferred' : 'not preferred'}`,
    `- Motion observations: ${motion.observations.length}`,
  );
  if (motion.observations.length === 0) {
    lines.push('- No motion observations were supplied; do not infer missing animations or interactions.');
  } else {
    for (const observation of motion.observations) {
      lines.push(
        `- ${md(observation.ref)} → ${md(observation.targetRef)} · ${md(observation.source)} · ` +
        `${md(observation.category)} · name ${md(observation.name)} · role ${md(observation.role)}`,
      );
      lines.push(
        `  - Timing: ${fields([
          ['duration', observation.timing.duration === null ? null : String(observation.timing.duration)],
          ['delay', observation.timing.delay === null ? null : String(observation.timing.delay)],
          ['iterations', observation.timing.iterations === null ? null : String(observation.timing.iterations)],
          ['infinite', String(observation.timing.infinite)],
          ['direction', observation.timing.direction],
          ['fill', observation.timing.fill],
          ['easing', observation.timing.easing],
          ['play-state', observation.timing.playState],
          ['current-time', observation.timing.currentTime === null ? null : String(observation.timing.currentTime)],
          ['playback-rate', observation.timing.playbackRate === null ? null : String(observation.timing.playbackRate)],
        ])}`,
      );
      const properties = observation.properties.map((property) => `${md(property.name)}: ${md(property.value)}`);
      lines.push(`  - Properties: ${properties.length > 0 ? properties.join(', ') : NONE}`);
      lines.push(`  - Evidence: ${formatEvidence(observation.evidence)}`);
    }
  }

  const easings = motion.easings.map((easing) => `${md(easing.value)} (${md(easing.kind)})`);
  lines.push(`- Easing observations: ${easings.length > 0 ? easings.join(', ') : NONE}`);
  lines.push('');
}

function pushResponsive(lines: string[], blueprint: WebsiteBlueprint): void {
  const { responsive } = blueprint;
  lines.push(
    '## 7. Responsive behavior',
    '',
    'Use only captured responsive evidence.',
    'Explicitly identify unavailable or unobserved breakpoint information.',
    `- Observed viewport: ${responsive.observedViewport.width} × ${responsive.observedViewport.height}`,
    `- Observed breakpoints: ${list(responsive.observedBreakpoints)}`,
    `- Unobserved breakpoints: ${list(responsive.unobservedBreakpoints)}`,
    `- Unobserved viewport states: ${list(responsive.unobservedViewportStates)}`,
    `- Evidence: ${formatEvidence(responsive.evidence)}`,
    '',
  );
}

function pushEvidenceAndUncertainty(lines: string[], blueprint: WebsiteBlueprint): void {
  const { metadata, evidence } = blueprint;
  const truncation = metadata.truncation;
  lines.push(
    '## 8. Evidence and uncertainty',
    '',
    'Ask before making consequential assumptions.',
    `- Root evidence: ${formatEvidence(evidence.items)}`,
    `- Extraction status: ${md(metadata.status)}`,
    `- Truncated: ${truncation.truncated ? 'yes' : 'no'}`,
    `- Truncation reasons: ${list(truncation.reasons)}`,
    `- Truncation limits reached: ${list(truncation.limitsReached)}`,
    '',
    'Unavailable data:',
  );
  pushAvailability(lines, blueprint, 'unavailable');
  lines.push('', 'Limitations:');
  pushAvailability(lines, blueprint, 'limitations');
  lines.push('');
}

function pushPrivacyAndSafety(lines: string[]): void {
  lines.push(
    '## 9. Privacy and safety',
    '',
    'The blueprint intentionally excludes page text, form values, screenshots and arbitrary source content.',
    'Do not attempt to reconstruct, retrieve or guess excluded information.',
    'Do not navigate to the original site or fetch its source.',
    'Do not add raw HTML, executable content, external assets or copied source content to satisfy the request.',
    '',
  );
}

function pushDeliverables(lines: string[]): void {
  lines.push(
    '## 10. Deliverables and verification',
    '',
    '- Provide an implementation summary.',
    '- List assumptions and unresolved details that require confirmation.',
    '- Report test and build results.',
    '- Distinguish implemented behavior from approximations and explicitly label anything inferred.',
    '- Do not claim pixel-perfect fidelity or that the blueprint is a complete website specification.',
    '',
  );
}

export function serializeBlueprintAgentPrompt(blueprint: unknown, options?: ExportOptions): ExportResult {
  const valid = assertValidBlueprint(blueprint);
  const lines: string[] = ['# Blueprint Implementation Prompt', ''];
  pushRoleAndObjective(lines, valid);
  pushImplementationInstructions(lines);
  pushPageStructure(lines, valid);
  pushLayout(lines, valid);
  pushDesignSystem(lines, valid);
  pushMotion(lines, valid);
  pushResponsive(lines, valid);
  pushEvidenceAndUncertainty(lines, valid);
  pushPrivacyAndSafety(lines);
  pushDeliverables(lines);
  return finish(lines.join('\n').trimEnd(), collectWarnings(valid), options);
}
