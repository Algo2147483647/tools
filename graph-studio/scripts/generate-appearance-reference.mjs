// Run with the project's TypeScript loader, as used by npm test.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAppearanceSchema } from "../src/schema/appearance/schema.ts";
import { parseStyleDocument } from "../src/schema/styleProtocol.ts";
import { PRESET_MANIFEST } from "../src/schema/appearance/presets.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const names = {
  "node-link": "Node-link",
  compound: "Nested node-link",
  timeline: "Timeline",
  sankey: "Sankey",
  spatial: "Spatial",
};
const cell = (value) =>
  String(value ?? "—")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ")
    .replaceAll("\r", "");
for (const [chart, name] of Object.entries(names)) {
  const schema = getAppearanceSchema(chart);
  parseStyleDocument(schema.example, chart);
  const lines = [
    `# ${name} Appearance`,
    "",
    "Generated from the canonical field definitions. Required fields are marked with an asterisk. Numeric font sizes use explicit pixel units. Unsupported shared fields are read-only for this chart; the document retains a common appearance shape.",
    "",
    "| Field | Type | Default | Description |",
    "| --- | --- | --- | --- |",
    ...schema.fields.map(
      (field) =>
        `| ${cell(field.path)}${field.requirement === "Required" ? " *" : ""} | ${cell(field.type)} | ${cell(field.type === "object" ? "—" : field.defaultValue)} | ${cell(field.description)} |`,
    ),
    "",
    "## Complete example",
    "",
    "```json",
    JSON.stringify(schema.example, null, 2),
    "```",
    "",
  ];
  fs.writeFileSync(path.join(root, "docs", "appearance", `${chart}.md`), lines.join("\n"));
  for (const preset of PRESET_MANIFEST[chart].presets) parseStyleDocument(preset.document, chart);
}
console.log("Generated five Appearance references and validated all preset documents.");
