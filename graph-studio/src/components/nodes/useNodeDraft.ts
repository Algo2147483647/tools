import { useEffect,useState } from "react";
import { getTimelineClock } from "../../graph/timeline/clock";
import { getTimelineEditError } from "../../graph/timeline/editing";
import type { DagNode,NodeKey,NormalizedDag } from "../../graph/types";
import {
type EditableField,
type FieldDisplayMode,
buildEditableFields,
buildRawNodeEditorValue,
formatEditorValue,
parseNodeFieldValue,
parseRawNodeEditorValue
} from "./nodeFields";


import { buildDefaultFieldDisplayModes,tryBuildRawJsonFromFieldValues } from "./nodeDraft";
export function useNodeDraft({open, nodeKey, node, graph, timelineReferenceTime, onSave}: {
 open: boolean; nodeKey: NodeKey | null; node: DagNode | null; graph: NormalizedDag | null;
 timelineReferenceTime?: number; onSave: (nextKey: NodeKey, fields: Record<string, unknown>) => string | void;
}) {
 const currentNodeKey = nodeKey ?? "";
  const [fields, setFields] = useState<EditableField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [rawJsonValue, setRawJsonValue] = useState("");
  const [lastEdited, setLastEdited] = useState<"fields" | "raw">("fields");
  const [fieldDisplayModes, setFieldDisplayModes] = useState<Record<string, FieldDisplayMode>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && node && nodeKey) {
      const nextFields = buildEditableFields(nodeKey, node);
      setFields(nextFields);
      setValues(Object.fromEntries(nextFields.map((field) => [field.name, formatEditorValue(field)])));
      setRawJsonValue(buildRawNodeEditorValue(nodeKey, node));
      setLastEdited("fields");
      setFieldDisplayModes(buildDefaultFieldDisplayModes(nextFields));
      setIsEditing(false);
      setError("");
    }
  }, [node, nodeKey, open]);

  function handleFieldChange(fieldName: string, value: string) {
    const nextValues = { ...values, [fieldName]: value };
    setValues(nextValues);
    setLastEdited("fields");
    setError("");

    const nextRawJson = tryBuildRawJsonFromFieldValues(fields, nextValues, currentNodeKey);
    if (nextRawJson) {
      setRawJsonValue(nextRawJson);
    }
  }

  function getDraftValue(name: string): unknown {
    const field = fields.find((item) => item.name === name);
    if (!field) return undefined;
    const parsed = parseNodeFieldValue(field, values[name] ?? "");
    return parsed.ok ? parsed.value : values[name];
  }

  function handleTimelineChange(time: unknown, track: string) {
    const nextFields = fields.filter((field) => !["time", "track"].includes(field.name));
    const added = buildEditableFields(currentNodeKey, {
      ...(time === undefined ? {} : { time }),
      ...(track ? { track } : {}),
    }).filter((field) => field.name !== "key");
    nextFields.push(...added);
    const nextValues = { ...values };
    delete nextValues.time;
    delete nextValues.track;
    for (const field of added) nextValues[field.name] = formatEditorValue(field);
    setFields(nextFields);
    setValues(nextValues);
    setLastEdited("fields");
    setError("");
    const raw = tryBuildRawJsonFromFieldValues(nextFields, nextValues, currentNodeKey);
    if (raw) setRawJsonValue(raw);
  }

  function handleRawJsonChange(nextRawJson: string) {
    setRawJsonValue(nextRawJson);
    setLastEdited("raw");
    setError("");

    const parsed = parseRawNodeEditorValue(nextRawJson);
    if (!parsed.ok) {
      return;
    }

    const nextFields = buildEditableFields(parsed.nextKey, { ...parsed.fields, key: parsed.nextKey });
    setFields(nextFields);
    setValues(Object.fromEntries(nextFields.map((field) => [field.name, formatEditorValue(field)])));
    setFieldDisplayModes((current) => {
      const defaults = buildDefaultFieldDisplayModes(nextFields);
      return Object.fromEntries(
        Object.keys(defaults).map((fieldName) => [fieldName, current[fieldName] ?? defaults[fieldName]]),
      );
    });
  }

  function handleSave() {
    if (lastEdited === "raw") {
      const parsed = parseRawNodeEditorValue(rawJsonValue);
      if (!parsed.ok) {
        setError(parsed.message);
        return;
      }
      saveValidated(parsed.nextKey, parsed.fields);
      return;
    }

    const nextKey = String(values.key || "").trim();
    if (!nextKey) {
      setError("Node key cannot be empty.");
      return;
    }
    if (nextKey.includes("\n") || nextKey.includes(",")) {
      setError("Node key cannot contain commas or line breaks.");
      return;
    }

    const patch: Record<string, unknown> = Object.create(null);
    for (const field of fields) {
      if (field.name === "key") {
        continue;
      }
      const parsed = parseNodeFieldValue(field, values[field.name] ?? "");
      if (!parsed.ok) {
        setError(parsed.message);
        return;
      }
      patch[field.name] = parsed.value;
    }

    saveValidated(nextKey, patch);
  }

  function saveValidated(nextKey: NodeKey, patch: Record<string, unknown>) {
    const timeError = getTimelineEditError(
      node ?? undefined,
      patch,
      timelineReferenceTime,
      getTimelineClock(graph?.metadata),
    );
    if (timeError) {
      setError(timeError);
      return;
    }
    const saveError = onSave(nextKey, patch);
    if (saveError) {
      setError(saveError);
      return;
    }
    setIsEditing(false);
  }

  function setFieldDisplayMode(fieldName: string, mode: FieldDisplayMode) {
    setFieldDisplayModes((current) => ({ ...current, [fieldName]: mode }));
  }
 return { fields, values, rawJsonValue, fieldDisplayModes, isEditing, setIsEditing, error, handleFieldChange, getDraftValue, handleTimelineChange, handleRawJsonChange, handleSave, setFieldDisplayMode };
}
