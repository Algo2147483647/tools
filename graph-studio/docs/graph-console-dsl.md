# DAG Studio Graph Console DSL

## 1. Scope

This document defines the **Graph Console DSL** used by `DAG Studio`.

The DSL is a compact, line-oriented instruction set for editing graph JSON and graph appearance in **Edit Mode** through a left-side console panel. It is intended to feel closer to a shell, assembler, or low-level command monitor than to a general-purpose scripting language.

User-entered console commands must start with `/`, such as `/help` or `/add Child -p Parent`. Internally, the parser strips that prefix before dispatching the mnemonic. Plain text without `/` is reserved for AI chat when AI is enabled.

The DSL is not a second editing engine. It is a textual front end for the existing graph mutation core and the graph appearance command core.

For a higher-level overview of the app and related documentation, see the repository [README](../README.md) and the [Documentation Index](index.md).

## 2. Design Goals

| Goal | Description |
| --- | --- |
| Short | Commands should be brief and easy to type repeatedly. |
| Explicit | Each instruction should map to one clear editing action. |
| Transactional | A batch of lines executes as one logical edit transaction. |
| Equivalent | Console capabilities should match the right-click editing capabilities. |
| Style-aware | Console capabilities should also cover graph UI appearance, presets, layout tuning, and custom CSS. |
| Deterministic | The same input should always produce the same DAG result. |
| Safe | Parse errors and graph errors should stop execution early and report the exact failing line. |

## 3. Architectural Position

### 3.1 Execution Pipeline

```text
Console Source Text
-> Line Scanner
-> Tokenizer
-> Parser
-> Console Instructions
-> GraphCommand sequence and/or AppearanceCommand sequence
-> applyGraphCommand(...) and/or applyAppearanceCommand(...)
-> DAG result and/or GraphAppearance result
-> reducer commit and/or appearance history commit
```

### 3.2 Layer Responsibilities

| Layer | Responsibility |
| --- | --- |
| Console UI | Accept source text, show help, show output, manage width and visibility. |
| Parser | Convert text lines into typed console instructions. |
| Executor | Resolve context, execute instructions in order, stop on failure. |
| Graph Command Core | Perform the actual graph mutation rules. |
| Appearance Command Core | Perform layout, CSS variable, CSS block, preset, and reset mutations. |
| Reducer / History | Commit a successful graph batch as one undoable graph transaction. |
| Appearance History | Commit a successful appearance batch as one undoable appearance transaction. |

### 3.3 Non-Goals

| Out of Scope for V1 | Reason |
| --- | --- |
| Pipes | Not needed for initial editing productivity. |
| Variables | Adds state complexity without core value. |
| Loops / conditions | Too large for a first instruction set. |
| Full graph replacement | Bypasses the existing mutation model. |
| Embedded multi-line JSON blocks | Makes parsing and line diagnostics harder. |
| Wildcard selection | Risky for early destructive operations. |
| Remote CSS imports | Appearance CSS is stored locally and sanitized before rendering. |

## 4. Console Operating Model

### 4.1 Availability

| Item | Rule |
| --- | --- |
| Visibility | Controlled by a settings-panel toggle. |
| Mode | Available only in `edit` mode. |
| Layout | Rendered as a resizable left sidebar. |
| Persistence | Sidebar visibility and width should be stored in page preferences. |

### 4.2 Execution Model

| Rule | Behavior |
| --- | --- |
| Input unit | One line is one instruction. |
| Empty line | Ignored. |
| Comment line | Ignored when the first non-space character is `#`. |
| Batch order | Top to bottom. |
| Failure rule | Stop at the first error. |
| Commit rule | Commit only if the full batch succeeds. |
| Undo unit | One executed graph mutation batch becomes one graph undo record; one executed appearance mutation batch becomes one appearance undo record. |

### 4.3 Context Register

The console maintains one implicit **current-node context register**.

| Mechanism | Meaning |
| --- | --- |
| `/use A` | Load node `A` into the current context register. |
| `.` | Operand alias for the current context node. |
| Empty context | Any use of `.` without an active context is an execution error. |

## 5. Lexical Conventions

### 5.1 Line Form

| Form | Meaning |
| --- | --- |
| `/instruction operands...` | Executable command line |
| `` | Empty line |
| `# comment` | Comment line |

### 5.2 Node Keys

| Form | Example | Notes |
| --- | --- | --- |
| Bare identifier | `Tree` | Preferred when no spaces are present. |
| Quoted key | `"Binary Tree"` | Required when spaces are present. |
| Context alias | `.` | Refers to the current context node. |

### 5.3 String Literals

| Form | Example | Use |
| --- | --- | --- |
| Double-quoted string | `"Self-balanced BST"` | Field values and quoted operands |

### 5.4 Lists

| Form | Example | Meaning |
| --- | --- | --- |
| Comma-separated list | `A,B,C` | Ordered operand list |
| Empty list | nothing after `=` | Clear the target relation set |

## 6. Instruction Summary

### 6.1 Primary Instruction Table

| Mnemonic | Category | Effect |
| --- | --- | --- |
| `/help` | Reference | Show the available command reference |
| `/clear`, `/cls` | Console UI | Clear the console output; accepted inside multi-line batches |
| `/keys` | Reference | List every node key in the current graph |
| `/graph` | Analysis | Print graph statistics, roots, leaves, and type counts |
| `/find` | Analysis | Search node keys, titles, types, definitions, and custom fields |
| `/neighbors` | Analysis | Inspect parent and child structure around a node |
| `/path` | Analysis | Find a shortest directed path between two nodes |
| `/ls` | Reference | Print a compact node summary |
| `/show` | UI | Open node detail view |
| `/use` | Context | Set current context node |
| `/mv` | Mutation | Rename a node key |
| `/rm` | Mutation | Delete a node |
| `/add` | Mutation | Create a node |
| `/cp` | Mutation | Copy a node |
| `/edge` | Mutation | Add or update one directed edge |
| `/rm-edge` | Mutation | Delete one directed edge |
| `/parents` | Mutation | Replace parent set |
| `/children` | Mutation | Replace child set |
| `/set` | Mutation | Replace one node field with text, scalar, or JSON |
| `/unset` | Mutation | Remove one node field |
| `/json` | UI | Open raw node JSON editor |
| `/layout` | Appearance | Set one layout appearance number |
| `/style-var` | Appearance | Set or unset one `--dag-*` CSS variable |
| `/style-css` | Appearance | Show, append, or replace custom graph CSS |
| `/style-preset` | Appearance | Apply a built-in appearance preset |
| `/style-reset` | Appearance | Restore the default graph appearance |

### 6.2 Modifier Table

| Modifier | Applies To | Meaning |
| --- | --- | --- |
| `-r` | `rm` | Recursive subtree delete |
| `-p <node>` | `add`, `cp` | Attach created/copied node under parent |

### 6.3 Built-In Console Commands

| Command | Layer | Effect |
| --- | --- | --- |
| `/help` | DSL instruction | Print the available command reference in the console output |
| `/keys` | DSL instruction | List every node key in the current graph |
| `/graph` | DSL instruction | Print graph-level structure and type statistics |
| `/find` | DSL instruction | Search graph data for exact or fuzzy node references |
| `/neighbors` | DSL instruction | Print local structure around a node |
| `/path` | DSL instruction | Find a directed path through child links |
| `/ls` | DSL instruction | Print a compact node summary in the console output |
| `/clear` | Console UI | Clear the console output |
| `/cls` | Console UI | Alias for `/clear` |
| `/style-css show` | DSL instruction | Print the current custom graph CSS |

## 7. Instruction Reference

---

## 7.1 `help`

### Synopsis

```sh
/help
```

### Description

Prints the available command reference directly in the console output.

### Behavioral Notes

| Item | Behavior |
| --- | --- |
| Graph mutation | None |
| Graph required | No |
| Undo history | Not added as a graph edit |
| Typical use | Discover or confirm the currently supported commands |

### Examples

```sh
/help
```

---

## 7.2 `keys`

### Synopsis

```sh
/keys
```

### Description

Prints all node keys in the current graph to the console output. The first line includes the total count, followed by one key per line in sorted order.

### Behavioral Notes

| Item | Behavior |
| --- | --- |
| Graph mutation | None |
| Graph required | No |
| Undo history | Not added as a graph edit |
| Typical use | Discover exact keys before using node-specific commands |

### Examples

```sh
/keys
```

---

## 7.3 `show`

### Synopsis

```sh
/show <node>
/show .
```

### Description

Opens the node detail view for the target node.

### Operand Table

| Operand | Type | Required | Description |
| --- | --- | --- | --- |
| `<node>` | Node key | Yes | Target node key or `.` |

### Behavioral Notes

| Item | Behavior |
| --- | --- |
| Graph mutation | None |
| Undo history | Not added as a graph edit |
| Right-click equivalent | `View Node` |

### Examples

```sh
/show Tree
/use Tree
/show .
```

---

## 7.4 `ls`

### Synopsis

```sh
/ls <node>
/ls .
```

### Description

Prints a compact summary of the target node in the console output, including title, type, define text, relations, and custom field names.

### Examples

```sh
/ls Tree
/use Tree
/ls .
```

---

## 7.5 `use`

### Synopsis

```sh
/use <node>
```

### Description

Loads the target node into the current context register.

### Operand Table

| Operand | Type | Required | Description |
| --- | --- | --- | --- |
| `<node>` | Node key | Yes | Node to become the current context |

### Behavioral Notes

| Item | Behavior |
| --- | --- |
| Graph mutation | None |
| Context register | Updated |
| Undo history | Not added as a graph edit |

### Examples

```sh
/use Tree
/use "Binary Tree"
```

---

## 7.6 `mv`

### Synopsis

```sh
/mv <old-key> <new-key>
```

### Description

Renames a node key and remaps references to that node.

### Operand Table

| Operand | Type | Required | Description |
| --- | --- | --- | --- |
| `<old-key>` | Node key | Yes | Existing key |
| `<new-key>` | Node key | Yes | New unique key |

### Internal Mapping

| DSL | Internal Command |
| --- | --- |
| `mv A B` | `{ type: "renameNode", oldKey: "A", newKey: "B" }` |

### Exceptions

| Condition | Error |
| --- | --- |
| Old key does not exist | Execution error |
| New key already exists | Execution error |
| New key is empty | Execution error |

### Examples

```sh
/mv Tree RootTree
/mv "Binary Tree" "Binary Search Tree"
```

---

## 7.7 `rm`

### Synopsis

```sh
/rm <node>
/rm -r <node>
/rm .
/rm -r .
```

### Description

Deletes either a single node or a full subtree.

### Operand / Modifier Table

| Operand / Modifier | Required | Description |
| --- | --- | --- |
| `<node>` | Yes | Target node key or `.` |
| `-r` | No | Delete subtree rooted at target |

### Internal Mapping

| Form | Internal Command |
| --- | --- |
| `rm A` | `{ type: "deleteNode", key: "A" }` |
| `rm -r A` | `{ type: "deleteSubtree", rootKey: "A" }` |

### Exceptions

| Condition | Error |
| --- | --- |
| Node does not exist | Execution error |
| Delete would remove all remaining nodes | Execution error |

### Examples

```sh
/rm DraftNode
/rm -r Tree
```

---

## 7.8 `add`

### Synopsis

```sh
/add <new-key>
/add <new-key> -p <parent>
```

### Description

Creates a new node. If `-p` is present, the new node is attached as a child of the parent node.

### Operand / Modifier Table

| Operand / Modifier | Required | Description |
| --- | --- | --- |
| `<new-key>` | Yes | New unique node key |
| `-p <parent>` | No | Parent node key or `.` |

### Internal Mapping

| Form | Internal Command |
| --- | --- |
| `add B` | `{ type: "addNode", key: "B" }` |
| `add B -p A` | `{ type: "addNode", key: "B", parentKey: "A" }` |

### Exceptions

| Condition | Error |
| --- | --- |
| New key already exists | Execution error |
| New key is empty | Execution error |

### Examples

```sh
/add AVL
/add AVL -p Tree
/use Tree
/add RedBlack -p .
```

---

## 7.9 `cp`

### Synopsis

```sh
/cp <source> <new-key>
/cp <source> <new-key> -p <parent>
```

### Description

Copies a node into a new key. The copied node does not inherit source parent/child relations unless a new parent is explicitly specified with `-p`.

### Operand / Modifier Table

| Operand / Modifier | Required | Description |
| --- | --- | --- |
| `<source>` | Yes | Source node key |
| `<new-key>` | Yes | New unique node key |
| `-p <parent>` | No | Parent node key or `.` |

### Internal Mapping

| Form | Internal Command |
| --- | --- |
| `cp A B` | `{ type: "copyNode", sourceKey: "A", key: "B" }` |
| `cp A B -p C` | `{ type: "copyNode", sourceKey: "A", key: "B", parentKey: "C" }` |

### Exceptions

| Condition | Error |
| --- | --- |
| Source does not exist | Execution error |
| New key already exists | Execution error |

### Examples

```sh
/cp Tree Tree_Copy
/cp AVL AVL_Copy -p Tree
/cp . Snapshot -p .
```

---

## 7.10 `parents`

### Synopsis

```sh
/parents <node> = <list>
/parents <node> =
```

### Description

Replaces the full parent set of the target node.

### Operand Table

| Operand | Required | Description |
| --- | --- | --- |
| `<node>` | Yes | Target node key or `.` |
| `<list>` | No | Comma-separated parent keys |

### Internal Mapping

| Form | Internal Command |
| --- | --- |
| `parents A = B,C,D` | `{ type: "setParents", key: "A", parents: ["B", "C", "D"] }` |
| `parents A =` | `{ type: "setParents", key: "A", parents: [] }` |

### Behavioral Notes

| Item | Behavior |
| --- | --- |
| Update mode | Replace, not append |
| Empty assignment | Clears all parents |
| Relation sync | Reverse child links are repaired by core graph logic |

### Examples

```sh
/parents AVL = Tree
/parents . = Root,Index
/parents Draft =
```

---

## 7.11 `children`

### Synopsis

```sh
/children <node> = <list>
/children <node> =
```

### Description

Replaces the full child set of the target node.

### Operand Table

| Operand | Required | Description |
| --- | --- | --- |
| `<node>` | Yes | Target node key or `.` |
| `<list>` | No | Comma-separated child keys |

### Internal Mapping

| Form | Internal Command |
| --- | --- |
| `children A = B,C,D` | `{ type: "setChildren", key: "A", children: ["B", "C", "D"] }` |
| `children A =` | `{ type: "setChildren", key: "A", children: [] }` |

### Behavioral Notes

| Item | Behavior |
| --- | --- |
| Update mode | Replace, not append |
| Empty assignment | Clears all children |
| Relation sync | Reverse parent links are repaired by core graph logic |

### Examples

```sh
/children Tree = AVL,RedBlack
/children . = Left,Right
/children Leaf =
```

---

## 7.12 `edge`

### Synopsis

```sh
/edge <parent> <child>
/edge <parent> <child> <weight>
/edge --create-missing <parent> <child>
/edge --create-missing <parent> <child> <weight>
```

### Description

Adds a directed edge from the parent node to the child node. When `<weight>` is provided, the relation value is created or updated at the same time.

### Operand Table

| Operand | Required | Description |
| --- | --- | --- |
| `<parent>` | Yes | Parent node key or `.` |
| `<child>` | Yes | Child node key or `.` |
| `<weight>` | No | Scalar relation value such as `depends_on`, `"subtype of"`, `1`, `true`, or `null` |

### Internal Mapping

| Form | Internal Command |
| --- | --- |
| `edge A B` | `{ type: "setEdge", parentKey: "A", childKey: "B" }` |
| `edge A B depends_on` | `{ type: "setEdge", parentKey: "A", childKey: "B", weight: "depends_on" }` |

### Examples

```sh
/edge Tree AVL
/edge Tree AVL subtype_of
/edge --create-missing Draft_A Draft_B
/use Tree
/edge . RedBlack balanced_by
```

---

## 7.13 `rm-edge`

### Synopsis

```sh
/rm-edge <parent> <child>
```

### Description

Deletes one directed edge without deleting either node.

### Operand Table

| Operand | Required | Description |
| --- | --- | --- |
| `<parent>` | Yes | Parent node key or `.` |
| `<child>` | Yes | Child node key or `.` |

### Internal Mapping

| Form | Internal Command |
| --- | --- |
| `rm-edge A B` | `{ type: "removeEdge", parentKey: "A", childKey: "B" }` |

### Examples

```sh
/rm-edge Tree AVL
/use Tree
/rm-edge . RedBlack
```

---

## 7.14 `set`

### Synopsis

```sh
/set <node> <field> <value>
```

### Description

Replaces one field on the target node. This is a compact single-field entry point for `updateNodeFields`.

### Operand Table

| Operand | Type | Required | Description |
| --- | --- | --- | --- |
| `<node>` | Node key | Yes | Target node key or `.` |
| `<field>` | Field name | Yes | Node field to replace |
| `<value>` | String / scalar / JSON | Yes | New field value |

### Internal Execution Strategy

| Step | Description |
| --- | --- |
| 1 | Read current node fields |
| 2 | Replace exactly one field |
| 3 | Submit full field object through `updateNodeFields` |

### Examples

```sh
/set AVL define "Self-balanced binary search tree"
/set Tree title "Tree"
/set . type "concept"
/set AVL score 12
/set AVL enabled true
/set AVL metadata {"height":2,"balanced":true}
```

---

## 7.15 `unset`

### Synopsis

```sh
/unset <node> <field>
```

### Description

Removes one non-relation field from the target node.

### Examples

```sh
/unset AVL note
/use Tree
/unset . metadata
```

---

## 7.16 `json`

### Synopsis

```sh
/json <node>
/json .
```

### Description

Opens the raw JSON editor for the target node.

### Operand Table

| Operand | Type | Required | Description |
| --- | --- | --- | --- |
| `<node>` | Node key | Yes | Target node key or `.` |

### Behavioral Notes

| Item | Behavior |
| --- | --- |
| Graph mutation | None by itself |
| UI effect | Opens existing node raw JSON editor |
| Purpose | Fast bridge from console to low-level node JSON editing |

### Examples

```sh
/json AVL
/use Tree
/json .
```

---

## 7.17 `layout`

### Synopsis

```sh
/layout <key> <number>
```

### Description

Sets one numeric layout appearance value. Layout appearance controls graph spacing, node sizing, and minimum stage dimensions.

### Supported Keys

| Key | Meaning |
| --- | --- |
| `stagePaddingX` | Horizontal graph padding |
| `stagePaddingY` | Vertical graph padding |
| `columnGap` | Horizontal distance between layers |
| `rowGap` | Vertical distance between rows |
| `edgeLaneGap` | Spacing between edge lanes |
| `nodeHeight` | Base node height |
| `minNodeWidth` | Minimum node width |
| `maxNodeWidth` | Maximum node width |
| `stageMinWidth` | Minimum SVG stage width |
| `stageMinHeight` | Minimum SVG stage height |

### Behavioral Notes

| Item | Behavior |
| --- | --- |
| Graph mutation | None |
| Appearance mutation | Yes |
| Graph required | No |
| Undo history | Added as an appearance edit |

### Examples

```sh
/layout rowGap 28
/layout columnGap 260
/layout maxNodeWidth 420
```

---

## 7.18 `style-var`

### Synopsis

```sh
/style-var <var> <value>
/style-var --unset <var>
```

### Description

Sets or unsets one graph CSS variable. Variable names must use the `--dag-*` namespace.

### Examples

```sh
/style-var --dag-node-fill #ffffff
/style-var --dag-edge-active #ff6b35
/style-var --dag-title-font-size 18px
/style-var --unset --dag-node-fill
```

### Behavioral Notes

| Item | Behavior |
| --- | --- |
| Graph mutation | None |
| Appearance mutation | Yes |
| Graph required | No |
| Undo history | Added as an appearance edit |
| Sanitization | Non-`--dag-*` keys are rejected by the appearance sanitizer |

---

## 7.19 `style-css`

### Synopsis

```sh
/style-css show
/style-css append <css>
/style-css replace <css>
```

### Description

Reads or updates the custom graph CSS block.

| Form | Effect |
| --- | --- |
| `show` | Prints the current custom CSS without mutating appearance |
| `append` | Adds CSS after the current custom CSS |
| `replace` | Replaces the current custom CSS |

### Examples

```sh
/style-css show
/style-css append .dag-edge[data-active="true"] path { stroke-width: 2.4; }
/style-css replace .dag-node[data-selected="true"] .dag-node-card { stroke: #ff6b35; }
```

### Behavioral Notes

| Item | Behavior |
| --- | --- |
| Graph mutation | None |
| Appearance mutation | `append` and `replace` only |
| Graph required | No |
| Undo history | Added as an appearance edit for `append` and `replace` |
| Sanitization | CSS is size-limited and `@import` rules are stripped |

---

## 7.20 `style-preset`

### Synopsis

```sh
/style-preset <id>
```

### Description

Applies one built-in graph appearance preset.

### Presets

| Preset | Intent |
| --- | --- |
| `simple` | Minimal graph styling with hidden pins and labels |
| `compact` | Denser node spacing |
| `default` | Balanced default UI |
| `slate` | Quiet dark-neutral reading surface |
| `blueprint` | Technical diagram look |
| `contrast` | High-contrast inspection mode |
| `presentation` | Larger, display-oriented graph styling |

### Examples

```sh
/style-preset contrast
/style-preset compact
```

---

## 7.21 `style-reset`

### Synopsis

```sh
/style-reset
```

### Description

Restores the default graph appearance.

### Behavioral Notes

| Item | Behavior |
| --- | --- |
| Graph mutation | None |
| Appearance mutation | Yes |
| Graph required | No |
| Undo history | Added as an appearance edit |
| Risk | Medium when AI-generated because it replaces the whole appearance |

## 8. Batch Semantics

### 8.1 Batch Definition

A batch is the full multi-line source executed by one explicit console run action.

### 8.2 Batch Rules

| Rule | Behavior |
| --- | --- |
| Execution order | Sequential |
| Intermediate state | Later instructions see earlier successful changes |
| Failure handling | Abort on first failing line |
| Commit timing | After all lines succeed |
| Graph undo record | Single graph transaction when graph data changed |
| Appearance undo record | Single appearance transaction when appearance changed |

A batch can contain graph mutations, appearance mutations, UI-only commands, and read-only commands. Graph-dependent commands require a loaded graph; style-only commands do not.

### 8.3 Example Batch

```sh
/use Tree
/add AVL -p .
/add RedBlack -p .
/set AVL define "Self-balanced BST"
/set RedBlack define "Balanced BST with color constraints"
/children . = AVL,RedBlack
/style-var --dag-edge-active #ff6b35
```

## 9. Diagnostics and Error Model

### 9.1 Error Classes

| Class | Description |
| --- | --- |
| Lexical error | Invalid quoting, token boundary, or illegal character pattern |
| Parse error | Unknown mnemonic or malformed operand sequence |
| Context error | Use of `.` without an active current node |
| Execution error | Graph core rejects the requested operation |

### 9.2 Diagnostic Requirements

| Requirement | Description |
| --- | --- |
| Line-local | Every error should identify the failing source line |
| Human-readable | Messages should read like operator diagnostics |
| Early stop | Only the first failing line is reported per run |
| Source-preserving | The original input remains editable after failure |

### 9.3 Recommended Message Format

| Template | Example |
| --- | --- |
| `Line N: Unknown instruction "<name>".` | `Line 3: Unknown instruction "mov".` |
| `Line N: Missing operand "<name>".` | `Line 5: Missing operand "<new-key>".` |
| `Line N: Current context is empty.` | `Line 2: Current context is empty. Use 'use <node>' first.` |
| `Line N: Node "<key>" already exists.` | `Line 4: Node "AVL" already exists.` |

## 10. Equivalence to Context Menu Operations

| Context Menu Action | Console Form |
| --- | --- |
| View Node | `/show <node>` |
| Rename Node Key | `/mv <old> <new>` |
| Delete Node | `/rm <node>` |
| Delete Subtree | `/rm -r <node>` |
| Edit Parents | `/parents <node> = ...` |
| Edit Children | `/children <node> = ...` |
| Add Node | `/add <new> [-p <parent>]` |
| Copy Node | `/cp <source> <new> [-p <parent>]` |
| Open Raw Node JSON | `/json <node>` |

Appearance settings have matching console forms:

| Settings Action | Console Form |
| --- | --- |
| Layout tuning | `/layout <key> <number>` |
| Token editing | `/style-var <var> <value>` |
| Token removal | `/style-var --unset <var>` |
| Custom CSS editing | `/style-css append <css>` or `/style-css replace <css>` |
| Preset selection | `/style-preset <id>` |
| UI configuration reset | `/style-reset` |

## 11. Recommended Parser Strategy

### 11.1 Parsing Stages

| Stage | Purpose |
| --- | --- |
| Line split | Preserve original line numbers |
| Comment / empty filter | Ignore non-executable lines |
| Tokenization | Produce operand tokens with quoting support |
| Instruction parse | Match mnemonic-specific grammar |
| Lowering | Convert parsed form into executor input |

### 11.2 Suggested Internal Types

```ts
type ConsoleInstruction =
  | { type: "help"; line: number }
  | { type: "clear"; line: number }
  | { type: "keys"; line: number }
  | { type: "graphStats"; line: number }
  | { type: "find"; query: string; line: number }
  | { type: "neighbors"; key: string; depth: number; line: number }
  | { type: "path"; fromKey: string; toKey: string; line: number }
  | { type: "list"; key: string; line: number }
  | { type: "show"; key: string; line: number }
  | { type: "use"; key: string; line: number }
  | { type: "rename"; oldKey: string; newKey: string; line: number }
  | { type: "delete"; key: string; recursive: boolean; line: number }
  | { type: "add"; key: string; parentKey?: string; line: number }
  | { type: "copy"; sourceKey: string; key: string; parentKey?: string; line: number }
  | { type: "setEdge"; parentKey: string; childKey: string; weight?: string | number | boolean | null; createMissing?: boolean; line: number }
  | { type: "removeEdge"; parentKey: string; childKey: string; line: number }
  | { type: "setParents"; key: string; keys: string[]; line: number }
  | { type: "setChildren"; key: string; keys: string[]; line: number }
  | { type: "setField"; key: string; field: string; value: string; line: number }
  | { type: "unsetField"; key: string; field: string; line: number }
  | { type: "json"; key: string; line: number }
  | { type: "setLayout"; key: string; value: number; line: number }
  | { type: "setCssVar"; key: string; value: string; line: number }
  | { type: "unsetCssVar"; key: string; line: number }
  | { type: "appearanceCssShow"; line: number }
  | { type: "appendCss"; css: string; line: number }
  | { type: "replaceCss"; css: string; line: number }
  | { type: "applyPreset"; presetId: string; line: number }
  | { type: "resetAppearance"; line: number };
```

## 12. Recommended Executor Strategy

### 12.1 Executor Responsibilities

| Responsibility | Description |
| --- | --- |
| Context resolution | Replace `.` with the current node |
| Instruction dispatch | Convert console instructions into UI actions or graph commands |
| Transaction simulation | Apply changes in sequence against a working DAG |
| Appearance simulation | Apply style changes in sequence against a working appearance object |
| Error trapping | Stop and report the first failure |
| Commit handoff | Emit graph and/or appearance commits for successful mutation batches |

### 12.2 Mixed UI / Mutation Behavior

| Instruction Class | Handling |
| --- | --- |
| UI-only instructions | Execute as immediate UI operations |
| Graph mutation instructions | Accumulate into transactional graph edits |
| Appearance mutation instructions | Accumulate into transactional appearance edits |
| Appearance read-only instructions | Execute as console output without mutating appearance |

Recommended V1 rule:

- allow UI-only instructions such as `show` and `json`
- treat graph mutation instructions as the batch that participates in graph undo history
- treat appearance mutation instructions as the batch that participates in appearance undo history
- if needed, disallow mixing UI-only instructions after mutation lines in the same run for simpler semantics

## 13. Worked Examples

### 13.1 Create a Small Branch

```sh
/use Tree
/add AVL -p .
/add RedBlack -p .
/children . = AVL,RedBlack
```

### 13.2 Rename and Re-Describe a Node

```sh
/mv Graph DAG
/set DAG define "A directed acyclic graph"
```

### 13.3 Clear Relations

```sh
/parents Draft =
/children Draft =
```

### 13.4 Open a Node for Raw JSON Work

```sh
/use AVL
/json .
```

## 14. Minimum Viable Instruction Set

### 14.1 Required V1 Instructions

| Priority | Instruction |
| --- | --- |
| P0 | `/use` |
| P0 | `/help` |
| P0 | `/keys` |
| P0 | `/ls` |
| P0 | `/show` |
| P0 | `/mv` |
| P0 | `/rm` |
| P0 | `/rm -r` |
| P0 | `/add` |
| P0 | `/cp` |
| P0 | `/edge` |
| P0 | `/rm-edge` |
| P0 | `/parents` |
| P0 | `/children` |
| P0 | `/set` |
| P0 | `/unset` |
| P0 | `/json` |
| P0 | `/layout` |
| P0 | `/style-var` |
| P0 | `/style-css show` |
| P0 | `/style-css append` |
| P0 | `/style-css replace` |
| P0 | `/style-preset` |
| P0 | `/style-reset` |

### 14.2 Optional V1.1 Extensions

| Candidate | Purpose |
| --- | --- |
| `focus <node>` | Move graph viewport focus |
| `/ls <node>` | Show relation summary |
| `append-child <node> <child>` | Incremental relation edit |
| `append-parent <node> <parent>` | Incremental relation edit |
| `/unset <node> <field>` | Field removal |
| History recall | Operator productivity |
| Autocomplete | Faster command entry |

## 15. Summary

The Graph Console DSL should behave like a compact graph-edit instruction set:

- brief like shell commands
- explicit like assembly mnemonics
- transactional like an editor command buffer
- backed by the existing graph mutation and appearance command cores
- self-describing through an in-console `/help` command

That combination gives the console the speed of typed operations without sacrificing the safety and consistency of the current JSON and UI configuration models.
