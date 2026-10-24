import type { CSSProperties } from "react";
import type { GraphAppearance } from "../../schema/appearance/types";

export function appearanceToStageStyle(appearance: GraphAppearance): CSSProperties {
  const { nodeShadow, shadowBlur, shadowOffset, shadowOpacity, sankeyLinkOpacity } = appearance.display;
  const shadow = (active: boolean) =>
    !nodeShadow
      ? "none"
      : `drop-shadow(0 1px 1px rgba(${appearance.cssVars["--dag-shadow-color"]}, ${shadowOpacity / 200})) drop-shadow(0 ${shadowOffset * (active ? Number(appearance.cssVars["--dag-shadow-active-offset-scale"]) : 1)}px ${shadowBlur * (active ? Number(appearance.cssVars["--dag-shadow-active-blur-scale"]) : 1)}px rgba(${appearance.cssVars["--dag-shadow-color"]}, ${shadowOpacity / 100}))`;
  return {
    ...appearance.cssVars,
    "--dag-edge-label-color": appearance.cssVars["--dag-edge-label-color"] || "var(--dag-text-soft)",
    "--dag-node-pin-display": appearance.display.showNodeDots ? "inline" : "none",
    "--dag-node-content-shift": appearance.display.showNodeDots ? "0px" : "-32px",
    "--dag-node-shadow": shadow(false),
    "--dag-node-shadow-active": shadow(true),
    "--dag-sankey-opacity": sankeyLinkOpacity / 100,
  } as CSSProperties;
}
