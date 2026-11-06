import type { StageData } from "../../layout/shared/types";
import AppearancePreviewFrame from "./AppearancePreviewFrame";
import SampleAppearancePreview, { type SampleAppearancePreviewProps } from "./SampleAppearancePreview";

export type AppearancePreviewSource =
  { kind: "document"; stage: StageData | null; status: string } | { kind: "sample" };

export default function AppearancePreview({
  source,
  ...props
}: SampleAppearancePreviewProps & { source: AppearancePreviewSource }) {
  return source.kind === "sample" ? (
    <SampleAppearancePreview {...props} />
  ) : (
    <AppearancePreviewFrame {...props} stage={source.stage} emptyMessage={source.status || "No visible nodes."} />
  );
}
