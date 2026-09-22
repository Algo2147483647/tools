import type { CSSProperties } from 'react';

const paths: Record<string, string> = {
  sidebar: 'M4 4h16v16H4z M9 4v16 M6 8h.01 M6 12h.01 M6 16h.01',
  palette:
    'M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.4-3.4 1.5 1.5 0 0 1 1.1-2.6H18a4 4 0 0 0 4-4c0-4.4-4.5-8-10-8z M7 9h.01 M11 6h.01 M16 7h.01 M18 11h.01',
  atlas: 'M4 4h6v6H4z M14 14h6v6h-6z M7 10v7h7 M10 7h7v7',
  plus: 'M12 5v14 M5 12h14',
  folder: 'M3 7V5h7l2 2h9v13H3z',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  chevron: 'm9 5 7 7-7 7',
  back: 'M19 12H5 M11 6l-6 6 6 6',
  node: 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M7 9h10 M7 14h6',
  link: 'M4 5h6v6H4z M14 13h6v6h-6z M10 8h7v5 M15 11l2 2 2-2',
  cursor: 'm5 3 14 10-7 1-3 7z',
  layers: 'm12 3 10 5-10 5L2 8z M2 12l10 5 10-5 M2 16l10 5 10-5',
  file: 'M6 3h8l5 5v13H6z M14 3v6h5 M9 13h7 M9 17h5',
  search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6',
  grid: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',
  fit: 'M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5 M8 8h8v8H8z',
  minus: 'M5 12h14',
  check: 'm5 12 4 4L19 6',
  refresh: 'M20 10a8 8 0 1 0-1 7 M20 3v7h-7',
  trash: 'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
  close: 'm6 6 12 12 M18 6 6 18',
  download: 'M12 3v12 M7 10l5 5 5-5 M4 17v4h16v-4',
  warning: 'm12 3 10 18H2z M12 9v5 M12 17v.1',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5 M12 17v.1',
  branch: 'M6 4v16 M6 12h12V4 M3 2h6v4H3z M15 2h6v4h-6z M3 18h6v4H3z',
};

export default function Icon({
  name,
  size = 18,
  style,
}: {
  name: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={paths[name] || paths.node} />
    </svg>
  );
}
