import type { HierarchyNode, HierarchySnapshot } from '../shared/types';

export interface HierarchyDeps {
  parent: (element: Element) => Element | null;
  children: (element: Element) => Element[];
  previousSibling: (element: Element) => Element | null;
  nextSibling: (element: Element) => Element | null;
  meta: (element: Element, depth: number) => HierarchyNode | null;
}

export interface HierarchyLimits {
  children: number;
  siblings: number;
  maxDepth: number;
}

const DEFAULT_LIMITS: HierarchyLimits = { children: 12, siblings: 4, maxDepth: 20 };

function depthOf(element: Element, deps: HierarchyDeps, maxDepth: number): number {
  let depth = 0;
  let current: Element | null = element;
  while (current && depth < maxDepth) {
    current = deps.parent(current);
    if (current) depth += 1;
  }
  return depth;
}

export function extractHierarchy(
  element: Element,
  deps: HierarchyDeps,
  limits: HierarchyLimits = DEFAULT_LIMITS,
): HierarchySnapshot {
  const depth = depthOf(element, deps, limits.maxDepth);
  const parent = deps.parent(element);
  const children = deps.children(element).slice(0, limits.children);
  const previous = deps.previousSibling(element);
  const next = deps.nextSibling(element);
  return {
    parent: parent ? deps.meta(parent, Math.max(0, depth - 1)) : null,
    children: children
      .map((child) => deps.meta(child, depth + 1))
      .filter((node): node is HierarchyNode => node !== null),
    previousSibling: previous ? deps.meta(previous, depth) : null,
    nextSibling: next ? deps.meta(next, depth) : null,
  };
}
