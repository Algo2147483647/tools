import type { FieldMapping } from "../graph/fieldMapping";
import { useEffect } from "react";
import { inferFieldMapping } from "../graph/fieldMapping";
import { normalizeDagInput } from "../graph/normalize";
import { getInitialSelection } from "../graph/selectors";
import { loadDefaultSample } from "../adapters/sampleLoader";
import type { GraphAction } from "../state/graphActions";

export function useDefaultGraph(
  dispatch: React.Dispatch<GraphAction>,
  suppressAutoLoadRef: React.MutableRefObject<boolean>,
  setFieldMapping: (mapping: FieldMapping) => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const payload = await loadDefaultSample("example.json");
        if (cancelled || suppressAutoLoadRef.current) {
          return;
        }
        const inferredMapping = inferFieldMapping(payload);
        const dag = normalizeDagInput(payload);
        const selection = getInitialSelection(dag, inferredMapping);
        setFieldMapping(inferredMapping);
        dispatch({
          type: "graphLoaded",
          dag,
          fileName: "example.json",
          fileHandle: null,
          selection,
          status: `${Object.keys(dag).length} nodes loaded from example.json.`,
        });
      } catch (error) {
        if (cancelled || suppressAutoLoadRef.current) {
          return;
        }
        console.error(error);
        dispatch({ type: "graphLoadFailed", status: "Unable to load example.json automatically. Please choose a JSON file." });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [dispatch, enabled, setFieldMapping, suppressAutoLoadRef]);
}
