import type { ElementInfo, MotionSnapshot } from '../../shared/types';
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

function motionFacts(motion: MotionSnapshot | null): {
  facts: DetectedFact[];
  unavailable: string[];
} {
  if (!motion) {
    return {
      facts: [],
      unavailable: ['animation timing', 'transition timing', 'keyframes', 'easing'],
    };
  }

  const facts: DetectedFact[] = [];
  if (motion.declaredAnimation) {
    facts.push({ label: 'Declared animation', value: motion.declaredAnimation });
  }
  if (motion.declaredTransition) {
    facts.push({ label: 'Declared transition', value: motion.declaredTransition });
  }
  if (motion.summary.cssAnimationCount > 0) {
    facts.push({ label: 'Detected CSS animations', value: String(motion.summary.cssAnimationCount) });
  }
  if (motion.summary.transitionCount > 0) {
    facts.push({ label: 'Detected transitions', value: String(motion.summary.transitionCount) });
  }
  if (motion.summary.waapiCount > 0) {
    facts.push({ label: 'Detected WAAPI animations', value: String(motion.summary.waapiCount) });
  }
  if (motion.summary.runningCount > 0) {
    facts.push({ label: 'Running at capture', value: String(motion.summary.runningCount) });
  }
  if (motion.summary.animatedProperties.length) {
    facts.push({ label: 'Animated properties', value: motion.summary.animatedProperties.join(' · ') });
  }
  if (motion.keyframes.length) {
    facts.push({ label: 'Keyframe sets', value: motion.keyframes.map((set) => set.name).join(' · ') });
  }
  if (motion.easings.length) {
    facts.push({ label: 'Easing values', value: motion.easings.map((easing) => easing.value).join(' · ') });
  }
  facts.push({
    label: 'Reduced motion preference',
    value: motion.summary.reducedMotion ? 'preferred' : 'not preferred',
  });

  const observed = motion.transitions
    .filter((transition) => transition.kind === 'observed')
    .map((transition) => `${transition.property} at ${transition.elapsedTime ?? 0}ms`);
  if (observed.length) {
    facts.push({ label: 'Observed transitions', value: observed.join(' · ') });
  }

  const unavailable: string[] = [];
  if (!motion.declaredAnimation) unavailable.push('declared animation');
  if (!motion.declaredTransition) unavailable.push('declared transition');
  if (!motion.keyframes.length) unavailable.push('authored keyframes');
  if (!motion.easings.length) unavailable.push('easing functions');
  if (motion.stylesheetAccess.inaccessible > 0) {
    unavailable.push(`${motion.stylesheetAccess.inaccessible} inaccessible stylesheet(s)`);
  }
  return { facts, unavailable };
}

export function buildPromptModel(element: ElementInfo, motion: MotionSnapshot | null = null): PromptModel {
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

  const basicMotion = collect([
    ['Transition', element.transition],
    ['Animation', element.animation],
  ]);
  const verifiedMotion = motionFacts(motion);

  const groups: DetectedGroup[] = [
    { title: 'Reference element', facts: source.facts },
    { title: 'Layout', facts: layout.facts },
    { title: 'Visual styling', facts: surface.facts },
    { title: 'Typography', facts: typography.facts },
    { title: 'Spacing and dimensions', facts: spacing.facts },
    { title: 'Animation and interaction', facts: [...basicMotion.facts, ...verifiedMotion.facts] },
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
      ...basicMotion.missing,
    ],
    unavailableMotion: verifiedMotion.unavailable,
    inferred: [
      'Use semantic markup and preserve the captured tag where practical.',
      'Treat the measured values as target values for a viewport similar to the captured one; they are not a complete design system.',
      'Add responsive rules for narrower and wider viewports. One captured element does not describe the surrounding page.',
      'Prefer reusable tokens for repeated colors, spacing and typography values.',
      'Verify the result visually against the captured dimensions and styles, then adjust for real content.',
      'Do not infer animation triggers from a single captured frame; use only the detected states and timing.',
      'Treat observed transitions as samples from the inspection window, not proof of how the animation starts.',
    ],
  };
}
