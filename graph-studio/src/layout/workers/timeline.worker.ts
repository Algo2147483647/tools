import { indexGraphDocument } from "../../graph/graphIndex";
import { evaluateTimelineLayout } from "../timeline/layout-candidate";
import { handleLayoutWorker, type TimelineWorkerInput } from "./protocol";

handleLayoutWorker(
  self,
  ({ input, baseline, plan }: TimelineWorkerInput) => {
    // Structured cloning omits the non-enumerable node IDs and adjacency indexes.
    const restored = {
      ...input,
      dag: indexGraphDocument(input.dag),
      axisSource: input.axisSource ? indexGraphDocument(input.axisSource) : undefined,
    };
    // The candidate evaluator reuses the baseline's measured label widths and titles.
    return evaluateTimelineLayout(restored, baseline, plan);
  },
  "Timeline layout failed.",
);
