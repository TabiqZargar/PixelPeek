import type { ElementInfo } from '../../shared/types';
import type { DetectedFact, DetectedGroup, PromptModel } from './types';

type Candidate = [string, string | null | undefined, string?];

function collect(candidates: Candidate[]): {
  facts: DetectedFact[];
  missing: string[];
} {
  const facts: DetectedFact[] = [];
  const missing: string[] = [];
  for (const [label, value, fallback] of candidates) {
    const trimmed = value?.trim();
    if (trimmed) {
      facts.push({ label, value: trimmed });
    } else if (fallback === undefined) {
      missing.push(label);
    }
  }
  return { facts, missing };
}

export function buildPromptModel(element: ElementInfo): PromptModel {
  const source = collect([
    ['Tag', element.tag],
    ['ID', element.id, 'optional'],
    ['Classes', element.classes.length ? element.classes.join(' · ') : null, 'optional'],
    ['Captured from', element.sourceUrl],
  ]);

  const layout = collect([
    ['Display', element.display],
    ['Position', element.position],
    ['Flex direction', element.flexDirection],
    ['Align items', element.alignItems],
    ['Justify content', element.justifyContent],
    ['Gap', element.gap],
    ['Grid columns', element.gridTemplateColumns],
    ['Overflow', element.overflow],
  ]);

  const surface = collect([
    ['Background', element.backgroundColor],
    ['Text color', element.color],
    ['Border', element.borderWidth],
    ['Border style', element.borderStyle, 'optional'],
    ['Border color', element.borderColor, 'optional'],
    ['Border radius', element.borderRadius],
    ['Box shadow', element.boxShadow],
    ['Opacity', element.opacity],
  ]);

  const typography = collect([
    ['Font family', element.fontFamily],
    ['Font size', element.fontSize],
    ['Font weight', element.fontWeight],
    ['Line height', element.lineHeight],
    ['Letter spacing', element.letterSpacing],
    ['Text align', element.textAlign],
    ['Text transform', element.textTransform],
  ]);

  const spacing = collect([
    ['Width', `${element.dimensions.width}px`],
    ['Height', `${element.dimensions.height}px`],
    ['Padding', element.padding],
    ['Margin', element.margin],
  ]);

  const motion = collect([
    ['Transition', element.transition],
    ['Animation', element.animation],
  ]);

  const groups: DetectedGroup[] = [
    { title: 'Reference element', facts: source.facts },
    { title: 'Layout', facts: layout.facts },
    { title: 'Visual styling', facts: surface.facts },
    { title: 'Typography', facts: typography.facts },
    { title: 'Spacing and dimensions', facts: spacing.facts },
    { title: 'Animation and interaction', facts: motion.facts },
  ].filter((group) => group.facts.length > 0);

  return {
    element,
    groups,
    notDetected: [
      ...source.missing,
      ...layout.missing,
      ...surface.missing,
      ...typography.missing,
      ...spacing.missing,
      ...motion.missing,
    ],
    inferred: [
      'Use semantic markup and preserve the captured tag where practical.',
      'Treat the measured values as target values for a viewport similar to the captured one; they are not a complete design system.',
      'Add responsive rules for narrower and wider viewports. One captured element does not describe the surrounding page.',
      'Prefer reusable tokens for repeated colors, spacing and typography values.',
      'Verify the result visually against the captured dimensions and styles, then adjust for real content.',
    ],
  };
}
