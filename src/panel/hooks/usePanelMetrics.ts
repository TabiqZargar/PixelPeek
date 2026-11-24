import { useEffect, useState } from 'react';
import { getPanelMetrics, type PanelMetrics } from './usePanelWidth';

function currentWidth(): number {
  return typeof window === 'undefined' ? 360 : window.innerWidth;
}

export function usePanelMetrics(): PanelMetrics {
  const [width, setWidth] = useState(currentWidth);

  useEffect(() => {
    const update = () => setWidth(currentWidth());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return getPanelMetrics(width);
}
