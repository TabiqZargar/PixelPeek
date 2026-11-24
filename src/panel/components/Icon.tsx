import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'crosshair'
  | 'layers'
  | 'motion'
  | 'layout'
  | 'bookmark'
  | 'settings'
  | 'copy'
  | 'check'
  | 'square'
  | 'cursor';

type Props = SVGProps<SVGSVGElement> & { name: IconName; size?: number };

const paths: Record<IconName, ReactNode> = {
  crosshair: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3 3 8l9 5 9-5-9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </>
  ),
  motion: (
    <>
      <path d="M3 12h4l3-7 4 14 3-7h4" />
    </>
  ),
  layout: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 9v12" />
    </>
  ),
  bookmark: (
    <>
      <path d="M6 4h12v17l-6-4-6 4V4Z" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06-2.1 2.1-.06-.06A1.7 1.7 0 0 0 15.8 18.5a1.7 1.7 0 0 0-1 1.56V21h-3v-.09A1.7 1.7 0 0 0 10.2 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06-2.1-2.1.06-.06A1.7 1.7 0 0 0 6.5 15.8a1.7 1.7 0 0 0-1.56-1H4.8v-3h.09A1.7 1.7 0 0 0 6.7 10.2a1.7 1.7 0 0 0-.34-1.87l-.06-.06 2.1-2.1.06.06A1.7 1.7 0 0 0 10.2 6.5a1.7 1.7 0 0 0 1-1.56V4.8h3v.09a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06 2.1 2.1-.06.06A1.7 1.7 0 0 0 18.5 10.2a1.7 1.7 0 0 0 1.56 1H21v3h-.09a1.7 1.7 0 0 0-1.51.8Z" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  square: <rect x="6" y="6" width="12" height="12" rx="1.5" />,
  cursor: <path d="m5 3 13 8-6 1.5L9.5 19 5 3Z" />,
};

export function Icon({ name, size = 16, ...rest }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
