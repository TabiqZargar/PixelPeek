export const EXPORT_LIMITS = {
  maxOutputChars: 240000,
  maxWarnings: 60,
} as const;

export type ExportId =
  | 'blueprint-json'
  | 'implementation-brief'
  | 'design-tokens-css'
  | 'component-inventory'
  | 'layout-specification';

export type ExportMimeType = 'application/json' | 'text/css' | 'text/markdown';

export interface ExportFormatMetadata {
  id: ExportId;
  title: string;
  label: string;
  filename: string;
  mimeType: ExportMimeType;
}

export const EXPORT_FORMATS: Readonly<Record<ExportId, ExportFormatMetadata>> = {
  'blueprint-json': {
    id: 'blueprint-json',
    title: 'Blueprint JSON',
    label: 'Validated structured blueprint',
    filename: 'blueprint.json',
    mimeType: 'application/json',
  },
  'implementation-brief': {
    id: 'implementation-brief',
    title: 'Implementation Brief',
    label: 'Concise developer handoff',
    filename: 'implementation-brief.md',
    mimeType: 'text/markdown',
  },
  'design-tokens-css': {
    id: 'design-tokens-css',
    title: 'Design Tokens CSS',
    label: 'Inferred token names with detected values',
    filename: 'design-tokens.css',
    mimeType: 'text/css',
  },
  'component-inventory': {
    id: 'component-inventory',
    title: 'Component Inventory',
    label: 'Detected component categories and local refs',
    filename: 'component-inventory.md',
    mimeType: 'text/markdown',
  },
  'layout-specification': {
    id: 'layout-specification',
    title: 'Layout Specification',
    label: 'Observed structure, geometry and layout values',
    filename: 'layout-specification.md',
    mimeType: 'text/markdown',
  },
};

export interface ExportOptions {
  maxChars?: number;
}

export interface ExportResult {
  id: ExportId;
  filename: string;
  mimeType: ExportMimeType;
  content: string;
  charCount: number;
  warnings: string[];
}
