import { buildRawNodeEditorValue, parseRawNodeEditorValue } from "../components/nodeDetailRawJson";
import type { ContextMenuAction } from "../components/ContextMenu";
import { copyTextToClipboard, readTextFromClipboard } from "../adapters/clipboard";
import { getDefaultFieldMapping } from "../graph/fieldMapping";
import type { NodeKey, RelationValue } from "../graph/types";
import type { DocumentSessionController } from "./useDocumentSession";
import type { GraphTransactionsController } from "./useGraphTransactions";

export function useNodeActions(session: DocumentSessionController, transactions: GraphTransactionsController) {
  const { state, dispatch, fieldMapping } = session;
  const { commitCommand } = transactions;
  function handleContextMenuAction(action: ContextMenuAction, nodeKey: NodeKey | null) {
    dispatch({ type: "contextMenuClosed" });
    if (action === "view-node" && nodeKey) {
      session.openNodeDetail(nodeKey);
      return;
    }
    if (action === "copy-key" && nodeKey) {
      void handleCopyNodeKey(nodeKey);
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
      await copyTextToClipboard(buildRawNodeEditorValue(nodeKey, node, fieldMapping));
      dispatch({ type: "statusChanged", status: `Copied node "${nodeKey}" JSON to the clipboard.` });
    } catch (error) {
      console.error(error);
      dispatch({ type: "statusChanged", status: `Unable to copy node "${nodeKey}" JSON.` });
    }
  }

  async function handlePasteNode(parentKey?: NodeKey) {
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
    commitCommand({ type: "addNode", key: newKey, parentKey: referenceNodeKey || undefined });
  }

  function promptCopyNode(sourceNodeKey: NodeKey) {
    const input = window.prompt("Enter a new unique node key:", `${sourceNodeKey}_Copy`);
    if (input === null) {
      return;
    }
    const newKey = input.trim();
    commitCommand({ type: "copyNode", sourceKey: sourceNodeKey, key: newKey, parentKey: sourceNodeKey });
  }

  function saveRelations(relations: Record<NodeKey, RelationValue>) {
    const editor = state.ui.relationEditor;
    if (!editor) return;
    const error = commitCommand(editor.field === "parents"
      ? { type: "setParentRelations", key: editor.nodeKey, parents: relations }
      : { type: "setChildRelations", key: editor.nodeKey, children: relations });
    if (error) return error;
    session.closeModals();
  }

  function saveNode(nextKey: NodeKey, fields: Record<string, unknown>) {
    const key = state.ui.nodeDetail?.nodeKey;
    if (key) return commitCommand({ type: "updateNodeFields", key, nextKey, fields });
  }

  return { handleContextMenuAction, saveRelations, saveNode };
}

export type NodeActionsController = ReturnType<typeof useNodeActions>;

function getPastedNodeFields(value: unknown): { key: NodeKey; fields: Record<string, unknown> } | null {
  const parsed = parseRawNodeEditorValue(JSON.stringify(value), "", getDefaultFieldMapping());
  return parsed.ok ? { key: parsed.nextKey, fields: parsed.fields } : null;
}
