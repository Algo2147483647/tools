import { type GraphAppearance } from "../../schema/appearance/defaults";
import { type CommandResult } from "../../graph/commands";
import type { NodeKey, NormalizedDag } from "../../graph/types";
import { type AppearanceCommandResult } from "../../schema/appearance/commands";

export interface ConsoleUiEffect {
  type: "show" | "json";
  nodeKey: NodeKey;
  line: number;
}

export type ConsoleRunResult =
  | {
      ok: true;
      style: import("../../schema/appearance/types").ChartStyle;
      queryResults: import("../domains").QueryResult[];
      runtimeEffects: import("../domainRegistry").DomainInstruction[];
      diff: string[];
      referenceTime: number;
      dag: NormalizedDag;
      contextNodeKey: NodeKey | null;
      results: CommandResult[];
      appearance: GraphAppearance;
      appearanceResults: AppearanceCommandResult[];
      uiEffects: ConsoleUiEffect[];
      outputMessages: string[];
      instructionCount: number;
      mutationCount: number;
      appearanceMutationCount: number;
    }
  | {
      ok: false;
      line: number;
      message: string;
      contextNodeKey: NodeKey | null;
    };
