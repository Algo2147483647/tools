import { createGraphDocument } from "../graph/normalize";

export function createSampleDag() {
  return createGraphDocument(
    {
      A: { title: "Alpha", define: "Root node" },
      B: { title: "Beta", define: "Child B" },
      C: { title: "Gamma", define: "Child C" },
      D: { title: "Delta", define: "Leaf D", meta: { priority: 1 } },
    },
    [
      { id: "ab", source: "A", target: "B", value: "edge_ab" },
      { id: "ac", source: "A", target: "C", value: "edge_ac" },
      { id: "bd", source: "B", target: "D", value: "edge_bd" },
    ],
  );
}
export function createForestDag() {
  return createGraphDocument({ Left: { define: "Left root" }, Right: { define: "Right root" } });
}
export function createChildOnlyDag() {
  return createGraphDocument({ Root: {}, Mid: {}, Leaf: { define: "terminal" } }, [
    { id: "rm", source: "Root", target: "Mid", value: "edge_rm" },
    { id: "ml", source: "Mid", target: "Leaf", value: "edge_ml" },
  ]);
}
