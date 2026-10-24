import { type GraphAppearance } from "../../graph/appearance";
import { type CommandResult } from "../../graph/commands";
import type { NodeKey,NormalizedDag } from "../../graph/types";
import { type AppearanceCommandResult } from "../../schema/appearanceCommands";


export interface ConsoleUiEffect {
  type: "show" | "json";
  nodeKey: NodeKey;
  line: number;
}

export type ConsoleRunResult =
  | {
      ok: true;
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
