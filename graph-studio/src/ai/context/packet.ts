import { describeCapabilities } from "../../console/capabilities";
import { inspectDomain } from "../../console/domains";
import { inspectGraph } from "../../console/execution/queries";
import { getGraphAppearancePresets } from "../../schema/appearance/commands";
import type { GraphAppState } from "../../app/document/initialState";
import type { ConsoleEnvironment } from "../../console/runtime";
import type { ConsoleEntry } from "../../console/types";
import { TOOL_PROTOCOL_VERSION } from "../tools/catalog";
import { boundedResult } from "../tools/loop";

export function buildAiContextPacket(
  state: GraphAppState,
  environment: ConsoleEnvironment,
  entries: ConsoleEntry[],
  revision: string,
  readOnly: boolean,
) {
  const capabilities = describeCapabilities({ dag: state.dag, chartType: state.chartType });
  const domain: Record<string, unknown> = {};
  if (state.dag)
    for (const family of capabilities.document.filter((c) => c !== "graph")) {
      try {
        domain[family] = boundedResult(
          inspectDomain(
            state.dag,
            { type: "domain", family, action: "inspect", args: { limit: 10 }, line: 1 },
            environment.referenceTime ?? Date.now(),
          ),
        );
      } catch (error) {
        domain[family] = { error: error instanceof Error ? error.message : "Invalid domain data" };
      }
    }
  return {
    protocol: { name: "graph-studio-tools", version: TOOL_PROTOCOL_VERSION },
    document: {
      id: state.document.id,
      revision,
      capabilities,
      graph: state.dag ? boundedResult(inspectGraph(state.dag, "graph", { limit: 30 })) : null,
      domain,
    },
    application: {
      mode: state.mode,
      chart: state.chartType,
      selection: state.selection,
      view: boundedResult(environment.view ?? {}),
      layout: boundedResult(environment.layout ?? {}),
    },
    stylePresets: getGraphAppearancePresets(state.chartType).map(({ id, label }) => ({ id, label })),
    execution: {
      readOnly,
      edits: "validate_then_commit",
      batches: "atomic_document_and_style",
      runtime: "separate_calls",
      staleResults: "discard",
    },
    conversation: entries
      .filter((e) => e.tone === "input" || e.tone === "ai" || e.tone === "ai-action" || e.tone === "error")
      .slice(-30)
      .map(({ tone, text }) => ({ role: tone, text: text.slice(0, 4000) })),
  };
}
