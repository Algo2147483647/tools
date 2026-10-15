import type { SVGProps } from "react";
const paths = {
    folder: "M3 7V5a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z",
    file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8L14 2ZM14 2v6h6M8 13h8M8 17h5",
    recent: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M12 7v5l3 2",
    home: "m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7",
    search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
    graph: "M5 5h4v4H5zM15 15h4v4h-4zM15 3h4v4h-4zM9 7h3V5h3M7 9v8h8",
    layout: "M3 3h6v6H3zM15 3h6v6h-6zM9 15h6v6H9zM6 9v3h12V9M12 12v3",
    palette:
      "M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-4 2 2 0 0 1 1-4h3a3 3 0 0 0 3-3 9 9 0 0 0-9-7ZM7 10h.01M10 6h.01M15 6h.01",
    ai: "m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3Z",
    close: "M6 6l12 12M18 6 6 18",
    "arrow-left": "M19 12H5M11 18L5 12L11 6",
    "arrow-up": "M12 19V5M6 11L12 5L18 11",
    undo: "M9 9H5V5M5 9C6.8 6.4 9.8 5 13 5C18 5 21 8.3 21 12.9C21 17.4 17.7 20 13.5 20",
    redo: "M15 9H19V5M19 9C17.2 6.4 14.2 5 11 5C6 5 3 8.3 3 12.9C3 17.4 6.3 20 10.5 20",
    minus: "M6 12H18", plus: "M12 6V18M6 12H18",
    fit: "M8 4H4V8M16 4H20V8M8 20H4V16M16 20H20V16M9 9L4 4M15 9L20 4M9 15L4 20M15 15L20 20",
    save: "M5 5H16L19 8V19H5ZM8 5V10H15V5M8 19V14H16V19",
    chevron: "M7 10L12 15L17 10",
    expand: "M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5",
    collapse: "M8 3v5H3M21 8h-5V3M16 21v-5h5M3 16h5v5",
    check: "m5 12 4 4L19 6",
    panel: "M3 3h18v18H3zM9 3v18",
    refresh: "M20 7a9 9 0 0 0-15-2L3 8M3 3v5h5M4 17a9 9 0 0 0 15 2l2-3M21 21v-5h-5",
  } as const;

export type IconName = keyof typeof paths | "roots" | "sliders";
interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> { name?: IconName; size?: number; }
export default function Icon({ name = "graph", size = 20, className = "", ...props }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={"studio-icon " + className} {...props}>
    {name === "roots" ? <><circle cx="6" cy="7" r="2.2" /><circle cx="18" cy="7" r="2.2" /><circle cx="12" cy="17" r="2.2" /><path d="M7.8 8.6L10.4 14.2M16.2 8.6L13.6 14.2" /></>
      : name === "sliders" ? <><path d="M5 6H19M5 12H19M5 18H19" /><circle cx="9" cy="6" r="1.8" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="1.8" fill="currentColor" stroke="none" /><circle cx="11" cy="18" r="1.8" fill="currentColor" stroke="none" /></>
      : <path d={paths[name]} />}
  </svg>;
}
