import type { LayoutObjective } from "../layout-plan";

export const FCOSE_ENGINE = "fcose-2.2.0/cytoscape-3.34.4/adapter-1/router-1";

/** Explicit algorithm settings, not a claim of global optimality. */
export function fcoseParameters(objective: LayoutObjective) {
  return {
    quality: "proof" as const,
    randomize: true,
    randomSeed: 173,
    animate: false,
    fit: false,
    padding: 0,
    nodeDimensionsIncludeLabels: false,
    uniformNodeDimensions: false,
    packComponents: false,
    step: "all",
    samplingType: true,
    sampleSize: 25,
    nodeSeparation: objective === "compact" ? 48 : 80,
    piTol: 0.0000001,
    nodeRepulsion: 4500,
    idealEdgeLength: objective === "compact" ? 60 : 100,
    // Measured cards are much larger than Cytoscape's default nodes; strong
    // springs can leave adjacent compound envelopes intersecting at convergence.
    edgeElasticity: 0.02,
    nestingFactor: 0.1,
    numIter: 2500,
    tile: true,
    tilingPaddingVertical: 36,
    tilingPaddingHorizontal: 36,
    gravity: 0.25,
    gravityRangeCompound: 1.5,
    gravityCompound: 1,
    gravityRange: 3.8,
    initialEnergyOnIncremental: 0.3,
  };
}
