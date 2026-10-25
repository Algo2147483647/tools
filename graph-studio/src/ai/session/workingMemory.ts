import type { WorkingMemory } from "../types";
export function createEmptyWorkingMemory(): WorkingMemory {
  return {
    focus: {
      nodeIds: [],
      edgeIds: [],
      concepts: [],
    },
    userPreferences: {
      preferredLanguage: "auto",
    },
    unresolvedQuestions: [],
  };
}
