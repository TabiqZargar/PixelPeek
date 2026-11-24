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

function hasDuration(value: string | null): boolean {
  if (!value) return false;
  const durations = value.match(/\d+(?:\.\d+)?m?s/g) ?? [];
  return durations.some((duration) => Number.parseFloat(duration) > 0);
}

export function extractElementInfo(
  element: Element,
  deps: InspectDeps = defaultDeps,
  now: () => string = () => new Date().toISOString(),
): ElementInfo {
  const style = deps.computedStyle(element);
  const rect = deps.boundingRect(element);
  const display = readable(style.display);
  const isFlex = display?.includes('flex') ?? false;
  const isGrid = display?.includes('grid') ?? false;
  const isLayoutContainer = isFlex || isGrid;
  const borderWidth = readable(style.borderWidth);
  const hasBorder = borderWidth !== null && borderWidth !== '0px';
  const transition = readable(style.transition);
  const animation = readable(style.animation);

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
    display,
    position: readable(style.position),
    lineHeight: readable(style.lineHeight),
    letterSpacing: readable(style.letterSpacing),
    textAlign: readable(style.textAlign),
    textTransform: readable(style.textTransform),
    opacity: readable(style.opacity),
    overflow: readable(style.overflow),
    gap: isLayoutContainer ? readable(style.gap) : null,
    flexDirection: isFlex ? readable(style.flexDirection) : null,
    alignItems: isLayoutContainer ? readable(style.alignItems) : null,
    justifyContent: isLayoutContainer ? readable(style.justifyContent) : null,
    gridTemplateColumns: isGrid ? readable(style.gridTemplateColumns) : null,
    borderWidth: hasBorder ? borderWidth : null,
    borderStyle: hasBorder ? readable(style.borderStyle) : null,
    borderColor: hasBorder ? readable(style.borderColor) : null,
    transition: hasDuration(transition) ? transition : null,
    animation: hasDuration(animation) ? animation : null,
    capturedAt: now(),
    sourceUrl: element.ownerDocument.location.href,
  };
}
