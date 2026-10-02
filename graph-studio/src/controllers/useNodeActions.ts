import { copyTextToClipboard, readTextFromClipboard } from "../adapters/clipboard";
import { useEffect, useState } from "react";
import type { ContextMenuAction } from "../components/ContextMenu";
import type { HierarchyEdit } from "../components/HierarchyEditorModal";
import type { GraphContextTarget } from "../state/contextMenu";
import type { GraphCommand } from "../graph/commands";
import { buildRawNodeEditorValue, parseRawNodeEditorValue } from "../components/nodeDetailRawJson";
import type { NodeKey, RelationValue } from "../graph/types";
import type { DocumentSessionController } from "./useDocumentSession";
import type { GraphTransactionsController } from "./useGraphTransactions";
import type { GraphViewportController } from "./useGraphViewport";

export function useNodeActions(
  session: DocumentSessionController,
  transactions: GraphTransactionsController,
  viewport: GraphViewportController,
) {
  const { state, dispatch } = session;
  const { commitCommand, commitCommands } = transactions;
  const [hierarchyEdit, setHierarchyEdit] = useState<HierarchyEdit | null>(null);
  useEffect(() => setHierarchyEdit(null), [state.document.generation, state.chartType]);
  function parentOf(id: string) {
    const parents = state.dag?.hierarchy?.parentById ?? {};
    return Object.prototype.hasOwnProperty.call(parents, id) ? parents[id] : null;
  }
  function handleContextMenuAction(action: ContextMenuAction, target: GraphContextTarget) {
    dispatch({ type: "contextMenuClosed" });
    const nodeKey = target.kind === "node" ? target.id : null;
    const id = target.kind === "canvas" ? null : target.id;
    const container =
      target.kind === "canvas" ? target.parentId : target.kind === "group" ? target.id : parentOf(target.id);
    if (action === "group-enter" && id) {
      viewport.enterGroup(id);
      return;
    }
    if (action === "group-toggle" && id) {
      viewport.toggleGroup(id);
      return;
    }
    if (action === "group-members") {
      setHierarchyEdit({ mode: "create", parentId: container, selectedIds: [] });
      return;
    }
    if (action === "group-with-siblings" && id) {
      setHierarchyEdit({ mode: "create", parentId: parentOf(id), selectedIds: [id] });
      return;
    }
    if (action === "group-move" && id) {
      setHierarchyEdit({ mode: "move", memberIds: [id] });
      return;
    }
    if (action === "group-rename" && id) {
      setHierarchyEdit({ mode: "rename", id });
      return;
    }
    if (action === "group-promote" && id) {
      const parent = parentOf(id);
      if (parent) commitCommand({ type: "groupMove", memberIds: [id], parentId: parentOf(parent) });
      return;
    }
    if (action === "group-dissolve" && id) {
      commitCommand({ type: "groupDissolve", id });
      return;
    }
    if (action === "add-member") {
      setHierarchyEdit({ mode: "add-node", parentId: container });
      return;
    }
    if (action === "paste-member") {
      void handlePasteNode(undefined, container);
      return;
    }
    if (action === "view-node" && nodeKey) {
      session.openNodeDetail(nodeKey);
      return;
    }
    if (action === "copy-key" && id) {
      void handleCopyNodeKey(id);
      return;
    }
    if (action === "copy-node" && nodeKey) {
      void handleCopyNodeJson(nodeKey);
      return;
    }
    if (action === "rename-node" && nodeKey) {
      promptRenameNode(nodeKey);
      return;
    }
    if (action === "delete-node" && nodeKey) {
      commitCommand({ type: "deleteNode", key: nodeKey });
      return;
    }
    if (action === "delete-subtree" && nodeKey && state.dag) {
      commitCommand({ type: "deleteSubtree", rootKey: nodeKey });
      return;
    }
    if (action === "edit-parents" && nodeKey) {
      dispatch({ type: "relationEditorOpened", nodeKey, field: "parents" });
      return;
    }
    if (action === "edit-children" && nodeKey) {
      dispatch({ type: "relationEditorOpened", nodeKey, field: "children" });
      return;
    }
    if (action === "add-node") {
      promptAddNode(nodeKey);
      return;
    }
    if (action === "copy-node-to-child" && nodeKey) {
      promptCopyNode(nodeKey);
      return;
    }
    if (action === "paste-node") {
      void handlePasteNode();
      return;
    }
    if (action === "paste-node-to-child" && nodeKey) {
      void handlePasteNode(nodeKey);
    }
  }

  async function handleCopyNodeKey(nodeKey: NodeKey) {
    try {
      await copyTextToClipboard(nodeKey);
      dispatch({ type: "statusChanged", status: `Copied node key "${nodeKey}" to the clipboard.` });
    } catch (error) {
      console.error(error);
      dispatch({ type: "statusChanged", status: `Unable to copy node key "${nodeKey}".` });
    }
  }

  async function handleCopyNodeJson(nodeKey: NodeKey) {
    const node = state.dag?.nodes[nodeKey];
    if (!node) {
      dispatch({ type: "statusChanged", status: `Node "${nodeKey}" does not exist.` });
      return;
    }
    try {
      await copyTextToClipboard(buildRawNodeEditorValue(nodeKey, node));
      dispatch({ type: "statusChanged", status: `Copied node "${nodeKey}" JSON to the clipboard.` });
    } catch (error) {
      console.error(error);
      dispatch({ type: "statusChanged", status: `Unable to copy node "${nodeKey}" JSON.` });
    }
  }

  async function handlePasteNode(parentKey?: NodeKey, groupParentId?: string | null) {
    if (!state.dag) {
      dispatch({ type: "statusChanged", status: "Load or initialize a graph before pasting a node." });
      return;
    }

    try {
      const clipboardText = await readTextFromClipboard();
      const parsed = JSON.parse(clipboardText) as unknown;
      const pasted = getPastedNodeFields(parsed);
      if (!pasted) {
        throw new Error("Clipboard does not contain a node JSON object.");
      }

      const nextKey = promptForPastedNodeKey(pasted.key);
      if (nextKey === null) {
        return;
      }
      if (state.chartType === "compound") {
        const parentId = groupParentId !== undefined ? groupParentId : parentKey ? parentOf(parentKey) : null;
        const commands: GraphCommand[] = [
          { type: "addNodeFromFields", key: nextKey, fields: pasted.fields, parentKey },
        ];
        if (parentId) commands.push({ type: "groupMove", memberIds: [nextKey], parentId });
        const error = commitCommands(commands, "Paste node");
        if (error) throw new Error(error);
      } else
        commitCommand(
          { type: "addNodeFromFields", key: nextKey, fields: pasted.fields, parentKey },
          parentKey ? state.selection : { type: "node", key: nextKey },
        );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to paste node from clipboard.";
      console.error(error);
      dispatch({ type: "statusChanged", status: message });
      window.alert(message);
    }
  }

  function promptForPastedNodeKey(rawKey: string): NodeKey | null {
    const trimmedKey = rawKey.trim();
    const defaultKey = trimmedKey && !state.dag?.nodes[trimmedKey] ? trimmedKey : `${trimmedKey || "Pasted_Node"}_Copy`;
    const input = window.prompt("Enter a new unique node key:", defaultKey);
    return input === null ? null : input.trim();
  }

  function promptRenameNode(nodeKey: NodeKey) {
    const input = window.prompt("Enter a new unique node key:", nodeKey);
    if (input === null) {
      return;
    }
    commitCommand({ type: "renameNode", oldKey: nodeKey, newKey: input.trim() });
  }

  function promptAddNode(referenceNodeKey: NodeKey | null) {
    const input = window.prompt("Enter a new unique node key:", "New_Node");
    if (input === null) {
      return;
    }
    const newKey = input.trim();
    addConnectedMember(
      { type: "addNode", key: newKey, parentKey: referenceNodeKey || undefined },
      newKey,
      referenceNodeKey,
    );
  }

  function promptCopyNode(sourceNodeKey: NodeKey) {
    const input = window.prompt("Enter a new unique node key:", `${sourceNodeKey}_Copy`);
    if (input === null) {
      return;
    }
    const newKey = input.trim();
    addConnectedMember(
      { type: "copyNode", sourceKey: sourceNodeKey, key: newKey, parentKey: sourceNodeKey },
      newKey,
      sourceNodeKey,
    );
  }

  function addConnectedMember(command: GraphCommand, id: string, reference: string | null) {
    const parent = reference && state.chartType === "compound" ? parentOf(reference) : null;
    if (!parent) {
      commitCommand(command);
      return;
    }
    const error = commitCommands(
      [command, { type: "groupMove", memberIds: [id], parentId: parent }],
      "Add connected node",
    );
    if (error) window.alert(error);
  }

  function saveRelations(relations: Record<NodeKey, RelationValue>) {
    const editor = state.ui.relationEditor;
    if (!editor) return;
    const error = commitCommand(
      editor.field === "parents"
        ? { type: "setParentRelations", key: editor.nodeKey, parents: relations }
        : { type: "setChildRelations", key: editor.nodeKey, children: relations },
    );
    if (error) return error;
    session.closeModals();
  }

  function saveNode(nextKey: NodeKey, fields: Record<string, unknown>) {
    const key = state.ui.nodeDetail?.nodeKey;
    if (key) return commitCommand({ type: "updateNodeFields", key, nextKey, fields });
  }

  return {
    handleContextMenuAction,
    saveRelations,
    saveNode,
    hierarchyEdit,
    closeHierarchyEditor: () => setHierarchyEdit(null),
  };
}

export type NodeActionsController = ReturnType<typeof useNodeActions>;

function getPastedNodeFields(value: unknown): { key: NodeKey; fields: Record<string, unknown> } | null {
  const parsed = parseRawNodeEditorValue(JSON.stringify(value));
  return parsed.ok ? { key: parsed.nextKey, fields: parsed.fields } : null;
}
