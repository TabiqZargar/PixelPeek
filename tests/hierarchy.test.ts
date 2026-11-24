import { describe, expect, it } from 'vitest';
import { extractHierarchy, type HierarchyDeps } from '../src/content/hierarchy';

function setup() {
  const parent = document.createElement('main');
  const target = document.createElement('section');
  const previous = document.createElement('p');
  const next = document.createElement('aside');
  const firstChild = document.createElement('span');
  const secondChild = document.createElement('span');
  parent.id = 'page';
  target.className = 'card active';
  firstChild.className = 'icon';
  parent.append(previous, target, next);
  target.append(firstChild, secondChild);
  const deps: HierarchyDeps = {
    parent: (element) => element.parentElement,
    children: (element) => Array.from(element.children),
    previousSibling: (element) => element.previousElementSibling,
    nextSibling: (element) => element.nextElementSibling,
    meta: (element, depth) => ({
      tag: element.tagName.toLowerCase(),
      id: element.id || null,
      classes: Array.from(element.classList),
      depth,
    }),
  };
  return { target, deps };
}

describe('hierarchy extraction', () => {
  it('captures bounded family metadata without storing DOM nodes', () => {
    const { target, deps } = setup();
    const hierarchy = extractHierarchy(target, deps, { children: 1, siblings: 1, maxDepth: 4 });
    expect(hierarchy.parent?.tag).toBe('main');
    expect(hierarchy.parent?.id).toBe('page');
    expect(hierarchy.children).toHaveLength(1);
    expect(hierarchy.children[0]?.classes).toEqual(['icon']);
    expect(hierarchy.previousSibling?.tag).toBe('p');
    expect(hierarchy.nextSibling?.tag).toBe('aside');
    expect(JSON.stringify(hierarchy)).not.toContain('ownerDocument');
  });

  it('returns nulls for detached roots', () => {
    const element = document.createElement('div');
    const deps: HierarchyDeps = {
      parent: () => null,
      children: () => [],
      previousSibling: () => null,
      nextSibling: () => null,
      meta: () => null,
    };
    expect(extractHierarchy(element, deps)).toEqual({
      parent: null,
      children: [],
      previousSibling: null,
      nextSibling: null,
    });
  });
});
