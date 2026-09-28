import type { ChangeEvent, Dispatch, MouseEvent, MutableRefObject, SetStateAction } from "react";
import { useEffect, useState } from "react";
import { ensureJsonExtension } from "../adapters/download";
import { openJsonDirectoryWithAccess, openJsonFilesWithAccess, readJsonFile, type PickedJsonCollection } from "../adapters/fileAccess";
import { loadRecentImportMetadata, loadRecentJsonCollection, saveRecentDirectoryImport, saveRecentFileImport } from "../adapters/recentImport";
import { type FieldMapping } from "../graph/fieldMapping";
import { buildImportedDag, type ImportGraphDocument, type ImportWarning } from "../graph/importMerge";
import { getInitialSelection } from "../graph/selectors";
import type { GraphAction } from "../state/graphActions";

export interface ImportFileButtonState {
  status: "idle" | "success" | "error";
  label: string;
  fileName?: string;
}

export function useGraphImport({
  dispatch,
  fieldMapping,
  setFieldMapping,
  suppressDefaultGraphRef,
  setDefaultGraphAutoLoadEnabled,
}: {
  dispatch: Dispatch<GraphAction>;
  fieldMapping: FieldMapping;
  setFieldMapping: Dispatch<SetStateAction<FieldMapping>>;
  suppressDefaultGraphRef: MutableRefObject<boolean>;
  setDefaultGraphAutoLoadEnabled: Dispatch<SetStateAction<boolean>>;
}) {
  const [importFileButtonState, setImportFileButtonState] = useState<ImportFileButtonState>({
    status: "idle",
    label: "Import File",
  });

  useEffect(() => {
    let cancelled = false;

    async function restoreRecentImport() {
      const metadata = loadRecentImportMetadata();
      if (!metadata?.canAutoLoad) {
        if (!cancelled) {
          suppressDefaultGraphRef.current = false;
          setDefaultGraphAutoLoadEnabled(true);
        }
        return;
      }

      try {
        const recentCollection = await loadRecentJsonCollection();
        if (cancelled) {
          return;
        }
        if (!recentCollection || recentCollection.files.length === 0) {
          suppressDefaultGraphRef.current = false;
          setDefaultGraphAutoLoadEnabled(true);
          return;
        }
        await loadPickedJsonFiles(recentCollection, Boolean(recentCollection.directoryHandle), false);
      } catch (error) {
        console.warn("Unable to restore recent import", error);
        if (!cancelled) {
          suppressDefaultGraphRef.current = false;
          setDefaultGraphAutoLoadEnabled(true);
        }
      }
    }

    restoreRecentImport();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleFileInputClick(event: MouseEvent<HTMLInputElement>) {
    if (typeof window.showOpenFilePicker !== "function") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    try {
      const pickedFiles = await openJsonFilesWithAccess();
      if (pickedFiles.files.length > 0) {
        await loadPickedJsonFiles(pickedFiles);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      console.error(error);
      setImportFileButtonState({
        status: "error",
        label: "error",
      });
      dispatch({ type: "statusChanged", status: "The selected JSON files could not be opened." });
    }
  }

  async function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []).map((file) => ({
      file,
      handle: null,
      path: file.webkitRelativePath || file.name,
    }));
    if (!files.length) {
      return;
    }
    await loadPickedJsonFiles({
      files,
      name: files.length === 1 ? files[0].file.name : "selected-json-files.json",
    });
    event.target.value = "";
  }

  async function handleFolderInputClick(event: MouseEvent<HTMLInputElement>) {
    if (typeof window.showDirectoryPicker !== "function") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    try {
      const pickedDirectory = await openJsonDirectoryWithAccess();
      if (pickedDirectory) {
        await loadPickedJsonFiles(pickedDirectory, true);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      console.error(error);
      dispatch({ type: "statusChanged", status: "The selected folder could not be opened." });
    }
  }

  async function handleFolderInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []).map((file) => ({
      file,
      handle: null,
      path: file.webkitRelativePath || file.name,
    }));
    if (!files.length) {
      return;
    }

    const firstPathPart = files[0].path.split(/[\\/]/)[0] || "folder";
    await loadPickedJsonFiles({
      files,
      name: `${firstPathPart}-merged.json`,
    }, true);
    event.target.value = "";
  }

  async function handleDroppedFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).map((file) => ({
      file,
      handle: null,
      path: file.webkitRelativePath || file.name,
    }));
    if (!files.length) {
      return;
    }

    await loadPickedJsonFiles({
      files,
      name: files.length === 1 ? files[0].file.name : "dropped-json-files.json",
    });
  }

  async function loadPickedJsonFiles(collection: PickedJsonCollection, fromFolder = false, cacheRecentImport = true) {
    suppressDefaultGraphRef.current = true;
    const { files: pickedFiles, name: sourceName } = collection;
    const jsonFiles = pickedFiles.filter((item) => isJsonFileName(item.path || item.file.name));
    const skippedNonJsonCount = pickedFiles.length - jsonFiles.length;
    if (jsonFiles.length === 0) {
      if (!fromFolder) {
        setImportFileButtonState({
          status: "error",
          label: "error",
        });
      }
      dispatch({
        type: "statusChanged",
        status: fromFolder
          ? "The selected folder did not contain any JSON files."
          : "No JSON files were selected.",
      });
      return;
    }

    const documents: ImportGraphDocument[] = [];
    const parseFailures: string[] = [];

    for (const pickedFile of jsonFiles) {
      const displayName = pickedFile.path || pickedFile.file.name;
      try {
        documents.push({
          name: displayName,
          payload: await readJsonFile(pickedFile.file),
        });
      } catch (error) {
        console.error(error);
        parseFailures.push(displayName);
      }
    }

    if (!documents.length) {
      if (!fromFolder) {
        setImportFileButtonState({
          status: "error",
          label: "error",
        });
      }
      dispatch({
        type: "statusChanged",
        status: `Could not parse any selected JSON file${jsonFiles.length === 1 ? "" : "s"}.`,
      });
      return;
    }

    try {
      const imported = buildImportedDag(documents, fieldMapping);
      const dag = imported.dag;
      if (Object.keys(dag).length === 0) {
        if (!fromFolder) {
          setImportFileButtonState({
            status: "error",
            label: "error",
          });
        }
        dispatch({
          type: "statusChanged",
          status: "The selected JSON did not contain any graph nodes.",
        });
        return;
      }

      const singleWritableSource = !fromFolder && jsonFiles.length === 1 && parseFailures.length === 0 ? jsonFiles[0] : null;
      const fileName = singleWritableSource ? singleWritableSource.file.name : ensureJsonExtension(sourceName || "merged-graph.json");
      if (!fromFolder) {
        setImportFileButtonState({
          status: "success",
          label: fileName,
          fileName,
        });
      }
      setFieldMapping(imported.mapping);
      dispatch({
        type: "graphLoaded",
        dag,
        fileName,
        fileHandle: singleWritableSource?.handle || null,
        selection: getInitialSelection(dag, imported.mapping),
        status: buildImportStatus({
          nodeCount: Object.keys(dag).length,
          sourceName: fileName,
          loadedJsonCount: documents.length,
          selectedJsonCount: jsonFiles.length,
          skippedNonJsonCount,
          parseFailures,
          warnings: imported.warnings,
        }),
      });
      if (cacheRecentImport) {
        try {
          if (fromFolder) {
            await saveRecentDirectoryImport(collection);
          } else {
            await saveRecentFileImport(collection);
          }
        } catch (error) {
          console.warn("Unable to save recent import source", error);
        }
      }
    } catch (error) {
      console.error(error);
      if (!fromFolder) {
        setImportFileButtonState({
          status: "error",
          label: "error",
        });
      }
      dispatch({ type: "statusChanged", status: "The selected JSON files could not be loaded into a graph." });
    }
  }

  return {
    importFileButtonState,
    handleFileInputClick,
    handleFileInputChange,
    handleFolderInputClick,
    handleFolderInputChange,
    handleDroppedFiles,
  };
}

function isJsonFileName(fileName: string): boolean {
  return /\.json$/i.test(fileName);
}

function buildImportStatus({
  nodeCount,
  sourceName,
  loadedJsonCount,
  selectedJsonCount,
  skippedNonJsonCount,
  parseFailures,
  warnings,
}: {
  nodeCount: number;
  sourceName: string;
  loadedJsonCount: number;
  selectedJsonCount: number;
  skippedNonJsonCount: number;
  parseFailures: string[];
  warnings: ImportWarning[];
}): string {
  const sourceLabel = loadedJsonCount === 1
    ? sourceName
    : `${sourceName} from ${loadedJsonCount} JSON files`;
  const issueCount = parseFailures.length + warnings.length + skippedNonJsonCount;
  const parsedSuffix = selectedJsonCount === loadedJsonCount
    ? ""
    : ` ${selectedJsonCount - loadedJsonCount} selected JSON file${selectedJsonCount - loadedJsonCount === 1 ? "" : "s"} could not be parsed.`;
  const warningSuffix = issueCount > 0
    ? ` ${issueCount} import warning${issueCount === 1 ? "" : "s"}; valid JSON files were loaded.`
    : "";

  if (warnings.length > 0 || parseFailures.length > 0) {
    console.warn("DAG Studio import warnings", {
      parseFailures,
      warnings: warnings.map((warning) => warning.message),
      skippedNonJsonCount,
    });
  }

  return `${nodeCount} nodes loaded from ${sourceLabel}.${parsedSuffix}${warningSuffix}`;
}
