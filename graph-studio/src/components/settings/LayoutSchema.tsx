import ProtocolSchema from "./ProtocolSchema";
import { layoutFieldSummary } from "../../schema/fieldValues";
import { createLayoutResult, layoutResultFields } from "../../schema/layoutResult";
import type { StageData } from "../../layout/shared/types";
import type { GraphChartType } from "../../graph/types";

export default function LayoutSchema({ stage, chartType }: { stage: StageData | null; chartType: GraphChartType }) {
  const document = createLayoutResult(stage, chartType);
  return (
    <ProtocolSchema
      label="Layout"
      fields={layoutResultFields(chartType)}
      value={document}
      valueHeading="Current"
      fileName={`current.${chartType}.layout.json`}
      allowDownload={false}
      renderValue={(entry) => <code>{layoutFieldSummary(document, entry.path)}</code>}
    />
  );
}
