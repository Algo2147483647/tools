import { parseConsoleSource } from "./dsl";
import { getDomainCommand } from "./domainRegistry";

/** Validate syntax up front; runtime tasks form explicit boundaries between atomic edit batches. */
export function splitCommandStages(commands: string[]): string[][] {
  const source = commands.join("\n");
  if (source.length > 100000) throw new Error("Command workflow is too large.");
  const parsed = parseConsoleSource(source);
  if (!parsed.ok) throw new Error(`Line ${parsed.error.line}: ${parsed.error.message}`);
  if (!parsed.instructions.length || parsed.instructions.length > 200)
    throw new Error("A workflow requires 1..200 instructions.");
  const lines = source.split(/\r?\n/),
    stages: string[][] = [];
  let edits: string[] = [];
  for (const instruction of parsed.instructions) {
    const effect =
      instruction.type === "domain" ? getDomainCommand(instruction.family, instruction.action).effect : undefined;
    const line = lines[instruction.line - 1];
    if (effect === "view" || effect === "layout") {
      if (edits.length) stages.push(edits);
      edits = [];
      stages.push([line]);
    } else edits.push(line);
  }
  if (edits.length) stages.push(edits);
  if (stages.length > 20) throw new Error("A workflow supports at most 20 dependent steps.");
  return stages;
}
