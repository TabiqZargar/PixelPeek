import type { ElementInfo } from '../shared/types';

export interface InspectDeps {
  computedStyle: (element: Element) => CSSStyleDeclaration;
  boundingRect: (element: Element) => DOMRect;
}

const defaultDeps: InspectDeps = {
  computedStyle: (element) => element.ownerDocument.defaultView!.getComputedStyle(element),
  boundingRect: (element) => element.getBoundingClientRect(),
};

function readable(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'normal' || trimmed === 'none') return null;
  return trimmed.length > 300 ? `${trimmed.slice(0, 297)}...` : trimmed;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export function extractElementInfo(
  element: Element,
  deps: InspectDeps = defaultDeps,
  now: () => string = () => new Date().toISOString(),
): ElementInfo {
  const style = deps.computedStyle(element);
  const rect = deps.boundingRect(element);

  return {
    tag: element.tagName.toLowerCase(),
    id: element.id || null,
    classes: Array.from(element.classList).slice(0, 12),
    dimensions: {
      width: round(Math.max(0, rect.width)),
      height: round(Math.max(0, rect.height)),
    },
    backgroundColor: readable(style.backgroundColor),
    color: readable(style.color),
    fontFamily: readable(style.fontFamily),
    fontSize: readable(style.fontSize),
    fontWeight: readable(style.fontWeight),
    padding: readable(style.padding),
    margin: readable(style.margin),
    borderRadius: readable(style.borderRadius),
    boxShadow: readable(style.boxShadow),
    display: readable(style.display),
    position: readable(style.position),
    capturedAt: now(),
    sourceUrl: element.ownerDocument.location.href,
  };
}
