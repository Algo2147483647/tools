import { getGraphChartLabel, type GraphChartType } from "../../graph/types";
import { CHART_SCHEMAS } from "./chartSchemas";
import ProtocolSchema from "./ProtocolSchema";

export default function ChartSchema({ chartType }: { chartType: GraphChartType }) {
  const schema = CHART_SCHEMAS[chartType];
  return (
    <ProtocolSchema
      key={chartType}
      label={getGraphChartLabel(chartType)}
      version="Graph Studio · v3"
      fields={schema.fields}
      example={schema.example}
      fileName={`${chartType}-example.json`}
    />
  );
}
