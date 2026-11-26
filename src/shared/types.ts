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

export type MotionSource = 'css-animation' | 'css-transition' | 'waapi';
export type MotionTransitionKind = 'declared' | 'running' | 'observed';

export interface MotionTarget {
  tag: string;
  id: string | null;
  classes: string[];
  depth: number;
}

export interface MotionTiming {
  duration: number | null;
  delay: number | null;
  iterations: number | null;
  infinite: boolean;
  direction: string | null;
  fill: string | null;
  easing: string | null;
  playState: string | null;
  currentTime: number | null;
  playbackRate: number | null;
}

export interface MotionKeyframeProperty {
  name: string;
  value: string;
}

export interface MotionKeyframe {
  offset: number;
  properties: MotionKeyframeProperty[];
  easing: string | null;
  source: 'computed' | 'declared';
}

export interface MotionAnimation {
  id: string;
  source: MotionSource;
  name: string | null;
  target: MotionTarget;
  timing: MotionTiming;
  keyframes: MotionKeyframe[];
  replayable: boolean;
}

export interface MotionTransition {
  id: string;
  kind: MotionTransitionKind;
  target: MotionTarget;
  property: string;
  duration: number | null;
  delay: number | null;
  easing: string | null;
  raw: string | null;
  before: string | null;
  after: string | null;
  elapsedTime: number | null;
}

export interface MotionKeyframes {
  name: string;
  referenced: boolean;
  keyframes: MotionKeyframe[];
}

export type EasingKind = 'linear' | 'keyword' | 'cubic-bezier' | 'steps' | 'unsupported';

export interface EasingInfo {
  value: string;
  kind: EasingKind;
  points: [number, number, number, number] | null;
  visualizable: boolean;
}

export interface MotionSummary {
  animationCount: number;
  cssAnimationCount: number;
  transitionCount: number;
  waapiCount: number;
  runningCount: number;
  keyframeSetCount: number;
  reducedMotion: boolean;
  animatedProperties: string[];
}

export interface MotionSnapshot {
  summary: MotionSummary;
  animations: MotionAnimation[];
  transitions: MotionTransition[];
  keyframes: MotionKeyframes[];
  easings: EasingInfo[];
  declaredAnimation: string | null;
  declaredTransition: string | null;
  interaction: {
    hover: boolean;
    focus: boolean;
    active: boolean;
  };
  stylesheetAccess: {
    readable: number;
    inaccessible: number;
  };
  replay: {
    isolatedActiveId: string | null;
    liveRestorableIds: string[];
  };
  limitations: string[];
  capturedAt: string;
}

export type MotionReplayAction = 'isolated-start' | 'isolated-stop' | 'live-restart' | 'live-restore';

export interface ElementSnapshot {
  element: ElementInfo;
  boxModel: BoxModel;
  properties: CssProperty[];
  typography: TypographyInfo;
  colors: ColorEntry[];
  gradients: GradientInfo[];
  hierarchy: HierarchySnapshot;
  motion: MotionSnapshot;
  limitations: string[];
  capturedAt: string;
}

export type HierarchyDirection = 'parent' | 'child' | 'previous-sibling' | 'next-sibling';

export interface SelectionClearedPayload {
  reason: string;
}

export interface ReplayInvalidatedPayload {
  reason: string;
}

export interface RuntimeErrorPayload {
  source: 'inspector' | 'design-system';
  message: string;
  code?: string;
  requestId?: string;
}

export const DESIGN_SYSTEM_LIMITS = {
  maxElements: 600,
  maxDepth: 12,
  maxChildrenPerNode: 40,
  maxPropertiesPerElement: 24,
  maxStylesheets: 50,
  maxCssRules: 300,
  maxDeclarationsPerRule: 20,
  maxDetectedValuesPerCategory: 40,
  maxValuesPerToken: 8,
  maxExemplarsPerToken: 3,
  maxTokensPerCategory: 20,
  maxTotalTokens: 60,
  maxSelectorLength: 120,
  maxValueLength: 240,
  maxPropertyNameLength: 64,
  maxRequestIdLength: 64,
  maxTokenNameLength: 64,
  maxTagLength: 64,
  maxNotes: 20,
  minTokenSupport: 2,
  maxPayloadChars: 60000,
} as const;

export type DesignSystemCategory = 'color' | 'typography' | 'spacing' | 'effect' | 'gradient';

export const DESIGN_SYSTEM_CATEGORIES: DesignSystemCategory[] = [
  'color',
  'typography',
  'spacing',
  'effect',
  'gradient',
];

export type DesignTokenNameBasis = 'rank' | 'heuristic';

export interface DesignDetectedValue {
  value: string;
  normalized: string;
  count: number;
  sourceProperties: string[];
}

export interface DesignExemplar {
  tag: string;
  roleHint: string | null;
  selector: string;
}

export interface DesignTokenCandidate {
  id: string;
  category: DesignSystemCategory;
  inferredName: string;
  nameBasis: DesignTokenNameBasis;
  detected: {
    values: DesignDetectedValue[];
    exemplars: DesignExemplar[];
    support: number;
  };
}

export interface DesignSystemSummary {
  elementsScanned: number;
  elementsSkipped: number;
  textElementsInspected: number;
  stylesheetsReadable: number;
  stylesheetsInaccessible: number;
  tokensByCategory: Record<DesignSystemCategory, number>;
}

export interface DesignDetectedValues {
  palette: DesignDetectedValue[];
  typography: DesignDetectedValue[];
  spacing: DesignDetectedValue[];
  effects: DesignDetectedValue[];
  gradients: DesignDetectedValue[];
}

export interface DesignSystemSnapshot {
  requestId: string;
  capturedAt: string;
  origin: string;
  summary: DesignSystemSummary;
  detected: DesignDetectedValues;
  tokens: DesignTokenCandidate[];
  unavailable: string[];
  limitations: string[];
}
