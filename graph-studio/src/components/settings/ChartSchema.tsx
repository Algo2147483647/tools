import { getGraphChartLabel, type GraphChartType, type GraphDocument } from "../../graph/types";
import { CHART_SCHEMAS } from "../../schema/document/definition";
import ProtocolSchema from "./ProtocolSchema";

export default function ChartSchema({
  chartType,
  document,
}: {
  chartType: GraphChartType;
  document: GraphDocument | null;
}) {
  const schema = CHART_SCHEMAS[chartType];
  return (
    <ProtocolSchema
      key={chartType}
      label={getGraphChartLabel(chartType)}
      fields={schema.fields}
      value={document}
      fileName={`${chartType}-current.json`}
    />
  );
}
