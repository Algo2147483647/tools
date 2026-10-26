import { DOMAIN_COMMANDS, domainAvailability } from "./domainRegistry";
import type { CapabilityContext } from "./capabilities";
interface ConsoleCommandReference {
  label: string;
  insertText: string;
  help: string;
}

export const CONSOLE_COMMAND_REFERENCE: ConsoleCommandReference[] = [
  {
    label: "/compound-layout inspect [group-id|root]",
    insertText: "/compound-layout inspect",
    help: "Inspect nested layout geometry and metrics for the current scope, a group, or root. Run separately from edit batches.",
  },
  {
    label: "/compound-layout diagnose [group-id|root]",
    insertText: "/compound-layout diagnose",
    help: "Inspect nested layout diagnostics. Uses the same inspection result as inspect.",
  },
  {
    label: "/compound-layout propose <intent JSON>",
    insertText: "/compound-layout propose ",
    help: "Compute and apply a local layout from a validated intent. Run separately from edit batches. Compatibility alias of /layout run; AI and Arrange use the same layout service.",
  },
  {
    label: "/compound-layout cancel",
    insertText: "/compound-layout cancel",
    help: "Cancel the current nested layout calculation.",
  },
  { label: "/help", insertText: "/help", help: "Show this command reference." },
  { label: "/keys", insertText: "/keys", help: "List every node key in the current graph." },
  { label: "/graph", insertText: "/graph", help: "Print graph-level statistics, roots, leaves, and type counts." },
  {
    label: "/find <query>",
    insertText: "/find ",
    help: "Search node keys, titles, types, definitions, and custom fields.",
  },
  {
    label: "/neighbors <node> [depth]",
    insertText: "/neighbors ",
    help: "Print parents and children around a node up to depth 4.",
  },
  {
    label: "/path <from> <to>",
    insertText: "/path ",
    help: "Find the shortest directed path from one node to another.",
  },
  { label: "/ls <node>", insertText: "/ls ", help: "Print a compact node summary in the console output." },
  {
    label: "/use <node>",
    insertText: "/use ",
    help: "Set the current context node. Use . to refer to the current context in later commands.",
  },
  { label: "/show <node>", insertText: "/show ", help: "Open the node viewer for a node." },
  { label: "/json <node>", insertText: "/json ", help: "Open the raw JSON editor for a node." },
  { label: "/mv <old-key> <new-key>", insertText: "/mv ", help: "Rename a node key." },
  { label: "/rm <node>", insertText: "/rm ", help: "Delete a single node." },
  { label: "/rm -r <node>", insertText: "/rm -r ", help: "Delete a node and its descendants." },
  { label: "/add <new-key>", insertText: "/add ", help: "Add a new node without linking it." },
  {
    label: "/add <new-key> -p <parent>",
    insertText: "/add ",
    help: "Add a new node and link it as a child of the parent.",
  },
  { label: "/cp <source> <new-key>", insertText: "/cp ", help: "Copy a node into a new node key." },
  {
    label: "/cp <source> <new-key> -p <parent>",
    insertText: "/cp ",
    help: "Copy a node and link the copy to a parent.",
  },
  {
    label: "/edge <parent> <child>",
    insertText: "/edge ",
    help: "Add an edge from parent to child with the default relation value.",
  },
  { label: "/edge <parent> <child> <weight>", insertText: "/edge ", help: "Add an edge or update its relation value." },
  {
    label: "/edge --create-missing <parent> <child>",
    insertText: "/edge --create-missing ",
    help: "Create any missing endpoint nodes before adding the edge.",
  },
  {
    label: "/edge --create-missing <parent> <child> <weight>",
    insertText: "/edge --create-missing ",
    help: "Create missing endpoint nodes and set the edge relation value.",
  },
  { label: "/rm-edge <parent> <child>", insertText: "/rm-edge ", help: "Remove a single directed edge." },
  { label: "/parents <node> = A,B", insertText: "/parents ", help: "Replace the parent relation set for a node." },
  { label: "/children <node> = A,B", insertText: "/children ", help: "Replace the child relation set for a node." },
  {
    label: "/set <node> <field> <value>",
    insertText: "/set ",
    help: "Set a non-relation field value as string, number, boolean, null, or JSON.",
  },
  { label: "/unset <node> <field>", insertText: "/unset ", help: "Remove a non-relation field from a node." },
  {
    label: "/appearance-set <path> <JSON>",
    insertText: "/appearance-set ",
    help: "Edit an Appearance Schema field, e.g. nodes.widths [160,280], nodes.spacing.row 24, or canvas.padding [40,60].",
  },
  {
    label: "/style-var <var> <value>",
    insertText: "/style-var --dag-",
    help: "Set a graph CSS variable. Variable names must start with --dag-.",
  },
  {
    label: "/style-var --unset <var>",
    insertText: "/style-var --unset --dag-",
    help: "Remove a graph CSS variable override.",
  },
  { label: "/style-css show", insertText: "/style-css show", help: "Print the current graph appearance CSS." },
  {
    label: "/style-css append <css>",
    insertText: "/style-css append ",
    help: "Append scoped graph CSS using stable .dag-* selectors.",
  },
  {
    label: "/style-css replace <css>",
    insertText: "/style-css replace ",
    help: "Replace the full graph appearance CSS.",
  },
  {
    label: "/style-preset <id>",
    insertText: "/style-preset ",
    help: "Apply the current chart type's default appearance preset.",
  },
  {
    label: "/style-reset",
    insertText: "/style-reset",
    help: "Reset graph appearance to the default CSS, variables, and visual settings.",
  },
  { label: "/clear", insertText: "/clear", help: "Clear the console output." },
  { label: "/cls", insertText: "/cls", help: "Alias of /clear. Clear the console output." },
];

export function getConsoleCommandReference(context?: CapabilityContext, all = false) {
  const common = CONSOLE_COMMAND_REFERENCE.filter(
    (c) => !c.label.startsWith("/compound-layout") || !context || context.chartType === "compound",
  );
  const domain = DOMAIN_COMMANDS.flatMap((definition) => {
    const unavailable = context ? domainAvailability(definition, context) : null;
    if (unavailable && !all) return [];
    const prefix = `/${definition.family} ${definition.action}`;
    return [
      {
        label: `${prefix}${definition.args.length ? " <JSON>" : ""}`,
        insertText: `${prefix}${definition.args.length ? " " + JSON.stringify(definition.example) : ""}`,
        help: `${definition.help} Arguments: ${definition.args.join(", ") || "none"}. Example: ${prefix}${definition.args.length ? " " + JSON.stringify(definition.example) : ""}.${unavailable ? " Unavailable: " + unavailable : ""}`,
      },
    ];
  });
  return [...domain, ...common];
}
export function buildConsoleHelpText(context?: CapabilityContext, all = false): string {
  return [
    "Available commands (domain arguments use JSON objects):",
    ...getConsoleCommandReference(context, all).map((c) => `- ${c.label}: ${c.help}`),
  ].join("\n");
}
