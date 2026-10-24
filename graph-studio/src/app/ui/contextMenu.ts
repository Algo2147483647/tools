export type GraphContextTarget =
  { kind: "node"; id: string } | { kind: "group"; id: string } | { kind: "canvas"; parentId: string | null };

export interface GraphContextMenu {
  x: number;
  y: number;
  target: GraphContextTarget;
}
