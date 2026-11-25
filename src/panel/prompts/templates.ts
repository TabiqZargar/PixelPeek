import type { DetectedGroup, OutputMode, PromptModel } from './types';

function group(model: PromptModel, title: string): DetectedGroup | undefined {
  return model.groups.find((entry) => entry.title === title);
}

function detectedLines(model: PromptModel, title: string): string[] {
  const found = group(model, title);
  if (!found) return ['No values detected for this category. Do not invent any.'];
  return [
    'Detected from selection:',
    ...found.facts.map((fact) => `- ${fact.label}: ${fact.value}`),
  ];
}

function inferredLines(lines: string[]): string[] {
  return ['Inferred guidance (not measured):', ...lines.map((line) => `- ${line}`)];
}

function requirements(mode: OutputMode): string[] {
  if (mode === 'react-css') {
    return [
      'Return a React component plus a separate CSS stylesheet.',
      'Use className hooks rather than inline styles for static values.',
      'Scope selectors to the component so page styles cannot leak in.',
    ];
  }
  if (mode === 'html-css') {
    return [
      'Return semantic HTML plus a separate CSS stylesheet.',
      'Use one root class with descendant selectors; no framework or JavaScript required.',
      'Keep the markup copyable into a plain static page.',
    ];
  }
  return [
    'Return a React component using Tailwind utility classes.',
    'Use arbitrary values only for measured values with no standard token, e.g. w-[240.4px].',
    'Extract repeated utilities into a shared component or an @apply layer.',
  ];
}

interface PromptSection {
  title: string;
  lines: string[];
}

export function renderPrompt(model: PromptModel, mode: OutputMode): string {
  const reference = detectedLines(model, 'Reference element');
  if (model.notDetected.length) {
    reference.push(`Not detected (do not guess): ${model.notDetected.join(', ')}`);
  }

  const animation = detectedLines(model, 'Animation and interaction');
  if (model.unavailableMotion.length) {
    animation.push(`Unavailable motion data (do not guess): ${model.unavailableMotion.join(', ')}`);
  }

  const sections: PromptSection[] = [
    {
      title: 'Objective',
      lines: [
        'Recreate the referenced element as closely as possible from the measured values below.',
        'This is a single-element reconstruction, not a full-page clone.',
      ],
    },
    { title: 'Reference element', lines: reference },
    { title: 'Layout', lines: detectedLines(model, 'Layout') },
    { title: 'Visual styling', lines: detectedLines(model, 'Visual styling') },
    { title: 'Typography', lines: detectedLines(model, 'Typography') },
    { title: 'Spacing and dimensions', lines: detectedLines(model, 'Spacing and dimensions') },
    { title: 'Animation and interaction', lines: animation },
    {
      title: 'Responsive expectations',
      lines: inferredLines([
        'Keep the element usable when the viewport is narrower than the captured width.',
        'Preserve hierarchy and spacing ratios at other viewport sizes; do not hard-code a single screen width.',
      ]),
    },
    {
      title: 'Technical implementation requirements',
      lines: [...requirements(mode), ...inferredLines(model.inferred.slice(0, 2))],
    },
    {
      title: 'Fidelity and validation',
      lines: [
        ...inferredLines(model.inferred.slice(2)),
        '- Compare the rendered result against the detected values and explain any intentional deviation.',
      ],
    },
  ];

  return [
    'You are recreating one UI element from measured browser data.',
    '',
    'Rules:',
    '- Use only the detected values below as measurements.',
    '- Do not invent properties that are not listed as detected.',
    '- Treat inferred guidance as suggestions, not as measurements.',
    '',
    ...sections.flatMap((section, index) => [
      `## ${index + 1}. ${section.title}`,
      ...section.lines,
      '',
    ]),
  ]
    .join('\n')
    .trimEnd();
}
