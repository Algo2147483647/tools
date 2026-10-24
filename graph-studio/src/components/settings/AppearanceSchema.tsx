import { getGraphChartLabel, type GraphChartType } from "../../graph/types";
import { getAppearanceSchema } from "./appearanceSchemas";
import ProtocolSchema from "./ProtocolSchema";

export default function AppearanceSchema({ chartType }: { chartType: GraphChartType }) {
  const schema = getAppearanceSchema(chartType);
  return (
    <div className="appearance-schema-view">
      <ProtocolSchema
        key={chartType}
        label={`${getGraphChartLabel(chartType)} appearance`}
        version="graph-studio-style · v1 / GraphAppearance · v1"
        fields={schema.fields}
        example={schema.example}
        fileName={`${chartType}.style.json`}
        note="Defaults show this chart's Default preset; omitted appearance fields use generic fallbacks. Required children apply when their parent is present. This example is a complete importable style; layout engines and session cameras are stored separately."
      />
    </div>
  );
}
