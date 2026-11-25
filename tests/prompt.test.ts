import { describe, expect, it } from 'vitest';
import { buildPromptModel, renderPrompt, type OutputMode } from '../src/panel/prompts';
import type { ElementInfo } from '../src/shared/types';
import { makeMotionSnapshot } from './fixtures';

const captured: ElementInfo = {
  tag: 'button',
  id: 'cta',
  classes: ['primary', 'rounded'],
  dimensions: { width: 240.4, height: 36.1 },
  backgroundColor: 'rgb(139, 109, 255)',
  color: '#ffffff',
  fontFamily: 'Inter, sans-serif',
  fontSize: '14px',
  fontWeight: '600',
  padding: '8px 12px',
  margin: '0px',
  borderRadius: '6px',
  boxShadow: null,
  display: 'flex',
  position: 'relative',
  gap: '8px',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: '20px',
  opacity: null,
  borderWidth: null,
  borderColor: null,
  transition: 'background-color 180ms ease 0s',
  animation: null,
  capturedAt: '2026-01-01T00:00:00.000Z',
  sourceUrl: 'https://example.com/checkout',
};

const sections = [
  'Objective',
  'Reference element',
  'Layout',
  'Visual styling',
  'Typography',
  'Spacing and dimensions',
  'Animation and interaction',
  'Responsive expectations',
  'Technical implementation requirements',
  'Fidelity and validation',
];

describe('prompt generator', () => {
  it('includes all ten sections with detected values and no fabricated ones', () => {
    const prompt = renderPrompt(buildPromptModel(captured), 'react-css');

    sections.forEach((title, index) => expect(prompt).toContain(`## ${index + 1}. ${title}`));
    expect(prompt).toContain('Detected from selection:');
    expect(prompt).toContain('- Tag: button');
    expect(prompt).toContain('- Classes: primary · rounded');
    expect(prompt).toContain('- Width: 240.4px');
    expect(prompt).toContain('- Transition: background-color 180ms ease 0s');
    expect(prompt).toContain('Not detected (do not guess):');
    expect(prompt).toContain('Box shadow');
    expect(prompt).toContain('Animation');
    expect(prompt).not.toContain('undefined');
    expect(prompt).not.toContain('null');
    expect(prompt).not.toContain('hunter2');
  });

  it('separates detected facts from inferred guidance', () => {
    const prompt = renderPrompt(buildPromptModel(captured), 'html-css');

    expect(prompt).toContain('Inferred guidance (not measured):');
    expect(prompt).not.toMatch(/- Width:.*Inferred/);
    expect(prompt).toContain('Use semantic markup');
  });

  it.each<OutputMode>(['react-css', 'html-css', 'react-tailwind'])(
    'produces mode-specific implementation requirements for %s',
    (mode) => {
      const prompt = renderPrompt(buildPromptModel(captured), mode);
      if (mode === 'react-css') {
        expect(prompt).toContain('separate CSS stylesheet');
        expect(prompt).toContain('className hooks');
      } else if (mode === 'html-css') {
        expect(prompt).toContain('semantic HTML');
        expect(prompt).not.toContain('className hooks');
      } else {
        expect(prompt).toContain('Tailwind utility classes');
        expect(prompt).toContain('w-[240.4px]');
      }
    },
  );

  it('is deterministic for the same element and mode', () => {
    const model = buildPromptModel(captured);
    expect(renderPrompt(model, 'react-tailwind')).toBe(renderPrompt(model, 'react-tailwind'));
  });

  it('handles a sparse element without inventing values', () => {
    const sparse: ElementInfo = {
      tag: 'div',
      id: null,
      classes: [],
      dimensions: { width: 0, height: 0 },
      backgroundColor: null,
      color: null,
      fontFamily: null,
      fontSize: null,
      fontWeight: null,
      padding: null,
      margin: null,
      borderRadius: null,
      boxShadow: null,
      display: null,
      position: null,
      capturedAt: 'fixed',
      sourceUrl: 'about:blank',
    };
    const prompt = renderPrompt(buildPromptModel(sparse), 'react-css');

    expect(prompt).toContain('No values detected for this category. Do not invent any.');
    expect(prompt).not.toContain('undefined');
    expect(prompt).not.toContain('null');
  });
});

describe('motion prompt facts', () => {
  it('uses verified motion values without turning guidance into measurements', () => {
    const prompt = renderPrompt(buildPromptModel(captured, makeMotionSnapshot()), 'react-css');
    expect(prompt).toContain('- Declared animation: pulse 1200ms ease-in-out infinite');
    expect(prompt).toContain('- Animated properties: opacity · transform');
    expect(prompt).toContain('- Keyframe sets: pulse');
    expect(prompt).toContain('Inferred guidance (not measured):');
    expect(prompt).toContain('Do not infer animation triggers');
  });

  it('labels missing motion data as unavailable rather than inventing it', () => {
    const motion = makeMotionSnapshot();
    const prompt = renderPrompt(
      buildPromptModel(captured, {
        ...motion,
        declaredAnimation: null,
        declaredTransition: null,
        animations: [],
        transitions: [],
        keyframes: [],
        easings: [],
      }),
      'html-css',
    );
    expect(prompt).toContain(
      'Unavailable motion data (do not guess): declared animation, declared transition, authored keyframes, easing functions',
    );
    expect(prompt).not.toContain('- Declared animation:');
  });
});
