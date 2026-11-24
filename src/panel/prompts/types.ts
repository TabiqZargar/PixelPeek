import type { ElementInfo } from '../../shared/types';

export type OutputMode = 'react-css' | 'html-css' | 'react-tailwind';

export interface DetectedFact {
  label: string;
  value: string;
}

export interface DetectedGroup {
  title: string;
  facts: DetectedFact[];
}

export interface PromptModel {
  element: ElementInfo;
  groups: DetectedGroup[];
  notDetected: string[];
  inferred: string[];
}

export const outputModes: Array<{ id: OutputMode; label: string }> = [
  { id: 'react-css', label: 'React + CSS' },
  { id: 'html-css', label: 'HTML + CSS' },
  { id: 'react-tailwind', label: 'React + Tailwind' },
];
