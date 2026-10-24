import { useState } from "react";
import AppearanceSettingsView, { type AppearanceSettingsProps } from "./AppearanceSettingsView";
import { AppearanceUIContext } from "./AppearanceUIContext";
import { createAppearanceUIModel } from "./appearanceUIModel";
import { APPEARANCE_RENDERERS } from "./AppearanceUIRenderers";
import { resetChartStyleSection } from "./appearanceSections";
import { createStyleDocument } from "../../schema/styleProtocol";
import type { ChartStyle } from "../../schema/appearance/types";
/** Every renderer, from a section to a tuple input, uses one Schema transaction boundary. */
export default function AppearanceSettings(props: Omit<AppearanceSettingsProps, "onSectionReset">) {
  const [error, setError] = useState("");
  const style: ChartStyle = {
    appearance: props.appearance,
    showNodeDetail: props.showNodeDetail,
    hideNodeBorders: props.hideNodeBorders,
    alignNodeWidthsToMax: props.alignNodeWidthsToMax,
    ...(props.chartType === "timeline" ? { timeline: props.timelineControls?.settings } : {}),
  };
  const model = createAppearanceUIModel(props.chartType, style);
  const commit = (change: () => ChartStyle) => {
    try {
      props.onAppearanceSchemaChange(createStyleDocument(props.chartType, change()).style);
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Invalid appearance value.");
    }
  };
  const set = (path: string, value: unknown) => commit(() => model.bind(path).set(value));
  return (
    <AppearanceUIContext.Provider
      value={{
        model,
        registry: APPEARANCE_RENDERERS,
        commit,
        query: props.query ?? "",
        timelineControls: props.timelineControls,
      }}
    >
      {error && (
        <p className="appearance-setting-error" role="alert">
          {error}
        </p>
      )}
      <AppearanceSettingsView
        {...props}
        onAppearanceCssChange={(value) => set("style.appearance.css", value)}
        onSectionReset={(group) => commit(() => resetChartStyleSection(style, props.chartType, group))}
      />
    </AppearanceUIContext.Provider>
  );
}
