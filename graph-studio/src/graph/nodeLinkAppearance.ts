import { defaultChartStyle } from "../schema/appearanceContract";
const style = defaultChartStyle("node-link");
export const NODE_LINK_DEFAULT_APPEARANCE = style.appearance;
const { appearance: _appearance, ...display } = style;
export const NODE_LINK_DEFAULT_DISPLAY = display;
