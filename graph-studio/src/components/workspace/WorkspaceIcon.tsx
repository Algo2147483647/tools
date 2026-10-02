export default function WorkspaceIcon({ name = "graph", size = 20 }: { name?: string; size?: number }) {
  const paths: Record<string, string> = {
    folder: "M3 7V5a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z",
    file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8L14 2ZM14 2v6h6M8 13h8M8 17h5",
    recent: "M3 11a9 9 0 1 1 2.6 7M3 4v7h7M12 7v5l3 2",
    home: "m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7",
    search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
    graph: "M5 5h4v4H5zM15 15h4v4h-4zM15 3h4v4h-4zM9 7h3V5h3M7 9v8h8",
    layout: "M3 3h6v6H3zM15 3h6v6h-6zM9 15h6v6H9zM6 9v3h12V9M12 12v3",
    palette:
      "M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-4 2 2 0 0 1 1-4h3a3 3 0 0 0 3-3 9 9 0 0 0-9-7ZM7 10h.01M10 6h.01M15 6h.01",
    ai: "m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3Z",
    close: "M6 6l12 12M18 6 6 18",
    panel: "M3 3h18v18H3zM9 3v18",
    refresh: "M20 7a9 9 0 0 0-15-2L3 8M3 3v5h5M4 17a9 9 0 0 0 15 2l2-3M21 21v-5h-5",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.graph} />
    </svg>
  );
}
