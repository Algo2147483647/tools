import assert from "node:assert/strict";
import { getSemanticFieldName, SYSTEM_FIELD_KEYS } from "../graph/fieldRoles";
import { parseGraphPagePreferences } from "../state/preferences";
import { defineSuite, defineTest } from "./harness";

export const fieldRolesSuite = defineSuite("native field roles", [
  defineTest("v3 keeps fixed field roles and ignores obsolete mapping preferences", () => {
    for (const field of SYSTEM_FIELD_KEYS) assert.equal(getSemanticFieldName(field), field);
    assert.equal(getSemanticFieldName("next"), null);
    assert.equal(getSemanticFieldName("metadata"), null);
    assert.deepEqual(
      parseGraphPagePreferences(JSON.stringify({ fieldMapping: { children: "next" }, layoutMode: "dagre" })),
      { layoutMode: "dagre" },
    );
  }),
]);
