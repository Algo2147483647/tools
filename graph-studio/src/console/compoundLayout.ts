import { parseLayoutIntent, type LayoutIntent } from "../layout/compound-layout-plan";

export type CompoundLayoutInstruction =
  | { type: "inspect" | "diagnose"; groupId?: string | null }
  | { type: "propose"; intent: LayoutIntent }
  | { type: "compare" | "apply"; candidateId: string }
  | { type: "cancel" };
export function parseCompoundLayoutCommand(source: string): CompoundLayoutInstruction {
  const match = source
    .trim()
    .match(/^\/compound-layout\s+(inspect|diagnose|propose|compare|apply|cancel)(?:\s+([\s\S]*))?$/);
  if (!match)
    throw new Error(
      "Use /compound-layout inspect, diagnose, propose <JSON>, compare <candidate-id>, apply <candidate-id>, or cancel.",
    );
  const action = match[1],
    argument = match[2]?.trim();
  if (action === "propose") return { type: action, intent: parseLayoutIntent(JSON.parse(argument || "null")) };
  if (argument?.includes("\n")) throw new Error("Run layout operations separately from other commands.");
  if (action === "inspect" || action === "diagnose")
    return { type: action, groupId: argument === "root" ? null : argument || undefined };
  if (action === "cancel") {
    if (argument) throw new Error("Cancel does not accept arguments.");
    return { type: action };
  }
  if (!argument) throw new Error("A candidate ID is required.");
  return { type: action as "compare" | "apply", candidateId: argument };
}
