/**
 * Geometric stroke icon set, ported from the design prototype (ui.jsx). Single
 * 24×24 viewBox; stroke inherits `color`. Add glyphs here as screens need them.
 */
export type IconName =
  | 'copy'
  | 'share'
  | 'people'
  | 'chevron'
  | 'recenter'
  | 'pause'
  | 'play'
  | 'close'
  | 'back'
  | 'nav'
  | 'globe'
  | 'compass'
  | 'fitAll'
  | 'trash';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

const PATHS: Record<IconName, JSX.Element> = {
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M5 15V5.5A1.5 1.5 0 016.5 4H15" />
    </>
  ),
  share: (
    <>
      <circle cx="6" cy="12" r="2.4" />
      <circle cx="18" cy="6" r="2.4" />
      <circle cx="18" cy="18" r="2.4" />
      <path d="M8.1 10.9l7.8-3.8M8.1 13.1l7.8 3.8" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="9" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0111 0" />
      <path d="M16 6.2a3 3 0 010 5.6M16.5 19a5.5 5.5 0 00-2-4.3" />
    </>
  ),
  chevron: <path d="M9 6l6 6-6 6" />,
  recenter: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  pause: <path d="M9 5v14M15 5v14" />,
  play: <path d="M7 4l13 8-13 8z" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  back: <path d="M15 5l-7 7 7 7" />,
  nav: <path d="M12 3l8 18-8-5-8 5 8-18z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.4 2.5 15.6 0 18M12 3c-2.5 2.4-2.5 15.6 0 18" />
    </>
  ),
  // North-pointing needle in a ring; rotate the whole icon to reflect heading.
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6.5V17" />
      <path d="M9.4 9.1L12 6.5l2.6 2.6" />
    </>
  ),
  // Four corner brackets — "fit everything in view".
  fitAll: (
    <>
      <path d="M4 9V5.5A1.5 1.5 0 015.5 4H9" />
      <path d="M15 4h3.5A1.5 1.5 0 0120 5.5V9" />
      <path d="M20 15v3.5a1.5 1.5 0 01-1.5 1.5H15" />
      <path d="M9 20H5.5A1.5 1.5 0 014 18.5V15" />
    </>
  ),
  trash: (
    <>
      <path d="M5 7h14" />
      <path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" />
      <path d="M7 7l1 12.5a1.5 1.5 0 001.5 1.4h5a1.5 1.5 0 001.5-1.4L17 7" />
    </>
  ),
};

export function Icon({ name, size = 22, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
