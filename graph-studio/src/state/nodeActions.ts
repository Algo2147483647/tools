export type ContextMenuAction =
  | "view-node"
  | "copy-key"
  | "rename-node"
  | "delete-node"
  | "delete-subtree"
  | "edit-parents"
  | "edit-children"
  | "add-node"
  | "copy-node"
  | "copy-node-to-child"
  | "paste-node"
  | "paste-node-to-child"
  | "group-enter"
  | "group-toggle"
  | "group-members"
  | "group-with-siblings"
  | "group-rename"
  | "group-move"
  | "group-promote"
  | "group-dissolve"
  | "add-member"
  | "paste-member";

export type HierarchyEdit =
  | { mode: "create"; parentId: string | null; selectedIds: string[] }
  | { mode: "move"; memberIds: string[] }
  | { mode: "rename"; id: string }
  | { mode: "add-node"; parentId: string | null };
