export type PanelLayout = 'compact' | 'regular' | 'wide';

export interface PanelMetrics {
  layout: PanelLayout;
  sidebarWidth: number;
  contentPadding: number;
}

export function getPanelLayout(width: number): PanelLayout {
  if (!Number.isFinite(width) || width <= 0) return 'compact';
  if (width < 380) return 'compact';
  if (width < 480) return 'regular';
  return 'wide';
}

export function getPanelMetrics(width: number): PanelMetrics {
  const layout = getPanelLayout(width);
  if (layout === 'compact') return { layout, sidebarWidth: 132, contentPadding: 12 };
  if (layout === 'regular') return { layout, sidebarWidth: 164, contentPadding: 16 };
  return { layout, sidebarWidth: 192, contentPadding: 20 };
}
