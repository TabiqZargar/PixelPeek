import type { ColorEntry, ElementInfo, ElementSnapshot } from '../shared/types';
import { computeBoxModel, type StyleReader } from './box-model';
import { findColorTokens, parseColor } from './color';
import { extractCssProperties } from './css-properties';
import { extractGradients } from './gradient';
import { extractHierarchy, type HierarchyDeps } from './hierarchy';
import { extractElementInfo } from './inspect';
import { extractTypography } from './typography';

export interface SnapshotDeps {
  computedStyle: (element: Element) => CSSStyleDeclaration;
  parentStyle: (element: Element) => CSSStyleDeclaration | null;
  boundingRect: (element: Element) => DOMRect;
  hierarchy: HierarchyDeps;
  now?: () => string;
}

const COLOR_PROPERTIES = [
  'color',
  'background-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'text-decoration-color',
  'box-shadow',
  'text-shadow',
];

function reader(style: CSSStyleDeclaration | null): StyleReader {
  return (property) => (style ? style.getPropertyValue(property) : '');
}

function extractColors(style: CSSStyleDeclaration): ColorEntry[] {
  const entries: ColorEntry[] = [];
  for (const property of COLOR_PROPERTIES) {
    const value = style.getPropertyValue(property).trim();
    if (!value) continue;
    for (const token of findColorTokens(value)) {
      entries.push({ property, raw: token, parsed: parseColor(token) });
    }
  }
  return entries.slice(0, 24);
}

export function createSnapshot(element: Element, deps: SnapshotDeps): ElementSnapshot {
  const style = deps.computedStyle(element);
  const parent = deps.hierarchy.parent(element);
  const parentStyle = parent ? deps.parentStyle(parent) : null;
  const elementInfo: ElementInfo = extractElementInfo(
    element,
    {
      computedStyle: deps.computedStyle,
      boundingRect: deps.boundingRect,
    },
    deps.now,
  );
  const read = reader(style);
  const rect = deps.boundingRect(element);
  const properties = extractCssProperties(read);
  const display = read('display');

  return {
    element: elementInfo,
    boxModel: computeBoxModel(
      read,
      { width: Math.max(0, rect.width), height: Math.max(0, rect.height) },
      display || null,
    ),
    properties,
    typography: extractTypography(read, parent ? reader(parentStyle) : null),
    colors: extractColors(style),
    gradients: extractGradients(read('background-image')),
    hierarchy: extractHierarchy(element, deps.hierarchy),
    limitations: [
      'Values are computed styles, not the original authored CSS declarations.',
      'CSS variables, source stylesheets and cascade origins are not reconstructed.',
      'Cross-origin stylesheets may be inaccessible; computed values still reflect what the browser applied.',
      'Modern colour functions that the browser cannot serialize to RGB are shown verbatim.',
    ],
    capturedAt: deps.now ? deps.now() : new Date().toISOString(),
  };
}
