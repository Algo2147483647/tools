import { evaluateTimelineLayout } from "./timeline-layout-candidate";
import { indexGraphDocument } from "../graph/graphIndex";
self.onmessage = (event: MessageEvent<Parameters<typeof evaluateTimelineLayout>>) => {
  try {
    const [input, baseline, plan] = event.data;
    // Worker messages omit the non-enumerable node IDs and adjacency indexes.
    const restored = {
      ...input,
      dag: indexGraphDocument(input.dag),
      axisSource: input.axisSource ? indexGraphDocument(input.axisSource) : undefined,
    };
    self.postMessage({ result: evaluateTimelineLayout(restored, baseline, plan) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Timeline layout failed." });
  }
};
