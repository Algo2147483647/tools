import assert from "node:assert/strict";
import {
  buildEditableFields,
  formatEditorValue,
  parseNodeFieldValue,
  supportsDisplayMode,
} from "../components/nodeFields";
import { parseRelationInput } from "../graph/relations";
import { defineSuite, defineTest } from "./harness";

export const nodeFieldsSuite = defineSuite("Node field editing", [
  defineTest("field editors round trip arbitrary JSON fields without losing value types", () => {
    const values = {
      title: "  A title  ",
      define: "A **definition** with $x^2$",
      count: 12,
      enabled: false,
      nested: { list: [null, true, 3] },
      absent: null,
    };
    const fields = buildEditableFields("A", values);
    assert.equal(fields[0].name, "key");
    for (const field of fields.slice(1)) {
      assert.deepEqual(parseNodeFieldValue(field, formatEditorValue(field)), { ok: true, value: field.value });
      assert.equal(supportsDisplayMode(field), typeof field.value === "string");
    }
    const count = fields.find((field) => field.name === "count")!;
    assert.equal(parseNodeFieldValue(count, "NaN").ok, false);
    assert.equal(parseNodeFieldValue(count, "").ok, false);
    assert.equal(
      parseNodeFieldValue(
        fields.find((field) => field.name === "nested")!,
        "{",
      ).ok,
      false,
    );
  }),
  defineTest("relation text accepts comma and newline separators and preserves key order", () => {
    assert.deepEqual(parseRelationInput(" A, B\nA\r\n __proto__, constructor, "), [
      "A",
      "B",
      "__proto__",
      "constructor",
    ]);
    assert.deepEqual(parseRelationInput(""), []);
  }),
]);
