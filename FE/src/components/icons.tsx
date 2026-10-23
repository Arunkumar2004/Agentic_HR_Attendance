import type { CSSProperties, ReactElement, ReactNode } from 'react';

// Minimal stroke icon set — inherits text color, so it follows dark/light theme.
// Usage: <Icon name="bell" />  or  <Icon name="download" size={14} />
const P: Record<string, ReactNode> = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  home: (
    <>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10.5V20h13v-9.5" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M16 14.7c2.3.2 3.9 1.6 4.4 3.8" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </>
  ),
  doc: (
    <>
      <path d="M6 3.5h8l4 4V20.5H6z" />
      <path d="M14 3.5V8h4M9 12.5h6M9 16h6" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20c.8-3.6 3.6-5.4 7-5.4s6.2 1.8 7 5.4" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20l1-4.5L16.5 4l3.5 3.5L8.5 19z" />
      <path d="M14.5 6l3.5 3.5" />
    </>
  ),
  folder: (
    <>
      <path d="M3.5 7.5c0-1 .8-2 2-2h4l2 2.5h7c1.2 0 2 1 2 2v8.5c0 1-.8 2-2 2h-13c-1.2 0-2-1-2-2z" />
    </>
  ),
  chat: (
    <>
      <path d="M4 6.5c0-1.4 1.1-2.5 2.5-2.5h11c1.4 0 2.5 1.1 2.5 2.5v7c0 1.4-1.1 2.5-2.5 2.5H9l-5 4z" />
    </>
  ),
  list: (
    <>
      <path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12" />
      <circle cx="4.5" cy="6.5" r="1" />
      <circle cx="4.5" cy="12" r="1" />
      <circle cx="4.5" cy="17.5" r="1" />
    </>
  ),
  cpu: (
    <>
      <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
      <rect x="10.5" y="10.5" width="3" height="3" />
      <path d="M9 3.5v3M15 3.5v3M9 17.5v3M15 17.5v3M3.5 9h3M3.5 15h3M17.5 9h3M17.5 15h3" />
    </>
  ),
  spark: (
    <>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </>
  ),
  sliders: (
    <>
      <path d="M5 7.5h14M5 16.5h14" />
      <circle cx="10" cy="7.5" r="2.2" />
      <circle cx="15" cy="16.5" r="2.2" />
    </>
  ),
  bell: (
    <>
      <path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10" />
      <path d="M10 19a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="12" r="4" />
      <path d="M12 12h8M17.5 12v3.5M20.5 12v2.5" />
    </>
  ),
  moon: (
    <>
      <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19" />
    </>
  ),
  download: (
    <>
      <path d="M12 3.5V15M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4.5 19.5h15" />
    </>
  ),
  check: (
    <>
      <path d="M4.5 12.5 10 18 19.5 6.5" />
    </>
  ),
  x: (
    <>
      <path d="M6 6l12 12M18 6 6 18" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 6.5h15M9.5 6V4.5h5V6M7 6.5l1 13h8l1-13" />
      <path d="M10 10.5v6M14 10.5v6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-6-6.5-10.5A6.5 6.5 0 0 1 12 4a6.5 6.5 0 0 1 6.5 6.5C18.5 15 12 21 12 21z" />
      <circle cx="12" cy="10.5" r="2.2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 5 6v6c0 4.5 3 7.5 7 8.5 4-1 7-4 7-8.5V6z" />
      <path d="M9.5 12l2 2 3.5-4" />
    </>
  ),
  gift: (
    <>
      <rect x="4.5" y="9" width="15" height="11" rx="1.5" />
      <path d="M3.5 6h17v3h-17zM12 6v14M12 6S8 6 6.5 4.5A1.8 1.8 0 0 1 9.5 2.7C10.8 3.6 12 6 12 6zm0 0s4 0 5.5-1.5a1.8 1.8 0 0 0-3-1.8C13.2 3.6 12 6 12 6z" />
    </>
  ),
  logout: (
    <>
      <path d="M14 4.5H6v15h8" />
      <path d="M10.5 12H20M17 9.5 19.5 12 17 14.5" />
    </>
  ),
  refresh: (
    <>
      <path d="M19.5 12a7.5 7.5 0 0 1-13 5.1M4.5 12a7.5 7.5 0 0 1 13-5.1" />
      <path d="M17.5 3.5v4h-4M6.5 20.5v-4h4" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5" />
      <circle cx="12" cy="8" r="0.6" />
    </>
  ),
  sheet: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 9.5h16M4 14.5h16M12 4v16" />
    </>
  ),
  pie: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 12V3.5M12 12l6.5 6.5" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4 2.8 19.5h18.4z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="16.8" r="0.7" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M4.5 7.5 12 13l7.5-5.5" />
    </>
  ),
  send: (
    <>
      <path d="M20.5 3.5 10 14M20.5 3.5 14 20.5l-4-6.5-6.5-4z" />
    </>
  ),
};

export function Icon({
  name,
  size = 16,
  style,
}: {
  name: string;
  size?: number;
  style?: CSSProperties;
}): ReactElement {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ verticalAlign: '-3px', flexShrink: 0, ...style }}
    >
      {P[name] ?? null}
    </svg>
  );
}
