export const r = String.raw;

// Each entry has a precise claim, its domain, a diagnostic example and a limitation.
// Dependencies are selected learning prerequisites, never an exhaustive formal proof graph.
export function n(id, title, kind, statement, hypotheses, example, caution, requires, reading, proof = "") {
  return {
    id,
    title,
    kind,
    statement,
    hypotheses,
    example,
    caution,
    requires: requires ? requires.split(" ") : [],
    reading,
    proof,
  };
}
