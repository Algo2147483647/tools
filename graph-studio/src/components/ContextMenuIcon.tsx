const paths: Record<string, string> = {
  node: "M8 5h8a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Z",
  group: "M3 8V4h4m10 0h4v4m0 8v4h-4M7 20H3v-4M8 8h8v8H8Z",
  canvas: "M4 4h6v6H4Zm10 0h6v6h-6ZM4 14h6v6H4Zm10 0h6v6h-6Z",
  "view-node": "M4 4h16v16H4ZM8 8h8m-8 4h8m-8 4h5",
  "group-enter": "M14 4h6v16h-6M3 12h12m-5-5 5 5-5 5",
  expand: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
  collapse: "M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5",
  rename: "m4 15 11-11 5 5L9 20H4Zm9-9 5 5",
  members: "M4 4h6v6H4Zm10 0h6v6h-6ZM4 14h6v6H4Zm13 0v6m-3-3h6",
  organize: "M9 3h6v5H9Zm-6 13h6v5H3Zm12 0h6v5h-6Zm-3-8v4m-6 4v-4h12v4",
  "group-members": "M3 8V4h4m10 0h4v4m0 8v4h-4M7 20H3v-4M8 12h8m-4-4v8",
  "group-move": "M4 5h7m-7 0v14h7m1-7h9m-4-4 4 4-4 4",
  "group-promote": "M5 19h14M12 16V4m-5 5 5-5 5 5",
  "group-dissolve": "M3 8V4h4m10 0h4v4m0 8v4h-4M7 20H3v-4M8 12h8",
  "copy-key": "M9 9h11v11H9ZM5 15H3V3h12v2",
  clipboard: "M9 4H5v17h14V4h-4M9 2h6v5H9Z",
  add: "M12 4v16M4 12h16",
  connections: "M5 3h5v5H5Zm9 13h5v5h-5ZM7.5 8v6a4.5 4.5 0 0 0 4.5 4.5h2",
  "edit-parents": "M3 5h10a5 5 0 0 1 5 5v9m-4-4 4 4 4-4M3 19h7",
  "edit-children": "M3 19h10a5 5 0 0 0 5-5V5m-4 4 4-4 4 4M3 5h7",
  "copy-node": "m8 6-5 6 5 6m8-12 5 6-5 6m-5 2 2-16",
  "copy-node-to-child": "M3 3h7v7H3Zm11 11h7v7h-7ZM7 10v8h7",
  delete: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
  chevron: "m9 6 6 6-6 6",
  back: "m14 6-6 6 6 6",
};

const aliases: Record<string, string> = {
  "rename-node": "rename",
  "group-rename": "rename",
  "group-with-siblings": "group-members",
  "add-node": "add",
  "add-member": "add",
  "paste-node": "clipboard",
  "paste-member": "clipboard",
  "paste-node-to-child": "clipboard",
  "delete-node": "delete",
  "delete-subtree": "delete",
};

export default function ContextMenuIcon({ name }: { name: string }) {
  return (
    <svg
      aria-hidden="true"
      className="context-menu-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[aliases[name] ?? name] ?? paths.node} />
    </svg>
  );
}
