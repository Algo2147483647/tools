import definitions from "./appearanceDefinition.json" with { type: "json" };
import type { AppearanceFieldDefinition } from "./definition";

// Runtime configuration lives exclusively in JSON; keep the existing consumer API.
export const APPEARANCE_DEFINITION = definitions.appearance as AppearanceFieldDefinition;
export const TIMELINE_DEFINITION = definitions.timeline as AppearanceFieldDefinition;
export const STYLE_OPTIONS_DEFINITION = definitions.options as AppearanceFieldDefinition;
