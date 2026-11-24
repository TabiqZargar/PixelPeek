import { describe, expect, it, vi } from 'vitest';
import { createSnapshot, type SnapshotDeps } from '../src/content/snapshot';

function style(values: Record<string, string>): CSSStyleDeclaration {
  const base = {
    ...values,
    getPropertyValue: (name: string) => values[name] ?? '',
  };
  return base as unknown as CSSStyleDeclaration;
}

function rect(width: number, height: number): DOMRect {
  return { width, height, left: 10, top: 20, right: width + 10, bottom: height + 20, x: 10, y: 20, toJSON: () => ({}) } as DOMRect;
}

describe('snapshot orchestration', () => {
  it('builds a serialisable snapshot from injected DOM reads', () => {
    const parent = document.createElement('main');
    const element = document.createElement('button');
    element.className = 'cta primary';
    parent.appendChild(element);
    const now = vi.fn(() => 'fixed-time');
    const values: Record<string, string> = {
      display: 'flex',
      position: 'relative',
      'box-sizing': 'border-box',
      width: '120px',
      height: '40px',
      'font-size': '14px',
      'color': 'rgb(255, 255, 255)',
      'background-color': 'rgb(139, 109, 255)',
      'background-image': 'linear-gradient(#fff, #000)',
      'padding-top': '8px',
      'padding-left': '12px',
      'padding-right': '12px',
      'padding-bottom': '8px',
      'border-top-width': '1px',
      'border-right-width': '1px',
      'border-bottom-width': '1px',
      'border-left-width': '1px',
    };
    const deps: SnapshotDeps = {
      computedStyle: () => style(values),
      parentStyle: () => style({ 'font-size': '14px', color: 'rgb(255, 255, 255)' }),
      boundingRect: () => rect(120, 40),
      now,
      hierarchy: {
        parent: (node) => node.parentElement,
        children: (node) => Array.from(node.children),
        previousSibling: (node) => node.previousElementSibling,
        nextSibling: (node) => node.nextElementSibling,
        meta: (node, depth) => ({
          tag: node.tagName.toLowerCase(),
          id: node.id || null,
          classes: Array.from(node.classList),
          depth,
        }),
      },
    };

    const snapshot = createSnapshot(element, deps);
    expect(snapshot.capturedAt).toBe('fixed-time');
    expect(snapshot.element.tag).toBe('button');
    expect(snapshot.boxModel.measured).toEqual({ width: 120, height: 40 });
    expect(snapshot.properties.some((property) => property.name === 'display')).toBe(true);
    expect(snapshot.typography.fontSize.matchesParent).toBe(true);
    expect(snapshot.colors.length).toBeGreaterThan(0);
    expect(snapshot.gradients[0]?.kind).toBe('linear');
    expect(snapshot.hierarchy.parent?.tag).toBe('main');
    expect(JSON.stringify(snapshot)).not.toContain('ownerDocument');
  });
});
