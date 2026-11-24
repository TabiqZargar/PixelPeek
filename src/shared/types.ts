export interface Dimensions {
  width: number;
  height: number;
}

export interface ElementInfo {
  tag: string;
  id: string | null;
  classes: string[];
  dimensions: Dimensions;
  backgroundColor: string | null;
  color: string | null;
  fontFamily: string | null;
  fontSize: string | null;
  fontWeight: string | null;
  padding: string | null;
  margin: string | null;
  borderRadius: string | null;
  boxShadow: string | null;
  display: string | null;
  position: string | null;
  lineHeight?: string | null;
  letterSpacing?: string | null;
  textAlign?: string | null;
  textTransform?: string | null;
  opacity?: string | null;
  overflow?: string | null;
  gap?: string | null;
  flexDirection?: string | null;
  alignItems?: string | null;
  justifyContent?: string | null;
  gridTemplateColumns?: string | null;
  borderWidth?: string | null;
  borderStyle?: string | null;
  borderColor?: string | null;
  transition?: string | null;
  animation?: string | null;
  capturedAt: string;
  sourceUrl: string;
}

export interface InspectionState {
  tabId: number | null;
  active: boolean;
  lastTabId?: number | null;
}

export const IDLE_STATE: InspectionState = { tabId: null, active: false };

export type InspectorStatus = 'idle' | 'starting' | 'active' | 'stopping' | 'error';

export type CssCategory =
  | 'Layout'
  | 'Display & Position'
  | 'Flexbox & Grid'
  | 'Dimensions'
  | 'Spacing'
  | 'Typography'
  | 'Background'
  | 'Borders'
  | 'Shadows & Effects'
  | 'Transforms'
  | 'Transitions'
  | 'Other';

export const CSS_CATEGORIES: CssCategory[] = [
  'Layout',
  'Display & Position',
  'Flexbox & Grid',
  'Dimensions',
  'Spacing',
  'Typography',
  'Background',
  'Borders',
  'Shadows & Effects',
  'Transforms',
  'Transitions',
  'Other',
];

export interface CssProperty {
  name: string;
  value: string;
  category: CssCategory;
}

export interface Edges {
  top: string | null;
  right: string | null;
  bottom: string | null;
  left: string | null;
}

export interface BoxModel {
  boxSizing: string | null;
  computedWidth: string | null;
  computedHeight: string | null;
  measured: Dimensions;
  contentWidth: number | null;
  contentHeight: number | null;
  estimatedOuter: Dimensions | null;
  margin: Edges;
  border: Edges;
  padding: Edges;
  notes: string[];
}

export interface TypographyValue {
  value: string | null;
  matchesParent: boolean;
}

export interface TypographyInfo {
  fontFamily: TypographyValue;
  fontSize: TypographyValue;
  fontWeight: TypographyValue;
  fontStyle: TypographyValue;
  lineHeight: TypographyValue;
  letterSpacing: TypographyValue;
  wordSpacing: TypographyValue;
  textAlign: TypographyValue;
  textTransform: TypographyValue;
  textDecoration: TypographyValue;
  color: TypographyValue;
  whiteSpace: TypographyValue;
}

export interface ParsedColor {
  original: string;
  hex: string | null;
  rgb: string | null;
  hsl: string | null;
  alpha: number;
  supported: boolean;
}

export interface ColorEntry {
  property: string;
  raw: string;
  parsed: ParsedColor | null;
}

export interface GradientStop {
  color: string;
  position: string | null;
}

export interface GradientInfo {
  property: string;
  raw: string;
  kind: 'linear' | 'radial' | 'conic' | 'unknown';
  direction: string | null;
  stops: GradientStop[];
}

export interface HierarchyNode {
  tag: string;
  id: string | null;
  classes: string[];
  depth: number;
}

export interface HierarchySnapshot {
  parent: HierarchyNode | null;
  children: HierarchyNode[];
  previousSibling: HierarchyNode | null;
  nextSibling: HierarchyNode | null;
}

export interface ElementSnapshot {
  element: ElementInfo;
  boxModel: BoxModel;
  properties: CssProperty[];
  typography: TypographyInfo;
  colors: ColorEntry[];
  gradients: GradientInfo[];
  hierarchy: HierarchySnapshot;
  limitations: string[];
  capturedAt: string;
}

export type HierarchyDirection = 'parent' | 'child' | 'previous-sibling' | 'next-sibling';

export interface SelectionClearedPayload {
  reason: string;
}
