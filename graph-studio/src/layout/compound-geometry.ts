/** Shared by ELK and SVG so group controls never consume the member content area. */
export const GROUP_HEADER_HEIGHT = 72;
export const GROUP_CONTENT_TOP = 76;
export const GROUP_CONTENT_PADDING = 24;
export const GROUP_ACTION_WIDTH = 104;
export const GROUP_TITLE_INSET = 18;
export const GROUP_COLLAPSED_HEIGHT = 112;

function titleWidth(title: string): number {
  return Array.from(title).reduce(
    (width, character) => width + (/[^\u0000-\u00ff]/.test(character) ? 14 : /[MW@#%&]/.test(character) ? 12 : 7.6),
    0,
  );
}

export function groupMinimumWidth(title: string): number {
  return Math.max(300, Math.min(620, titleWidth(title) + GROUP_ACTION_WIDTH + GROUP_TITLE_INSET * 2 + 12));
}

export function fitGroupTitle(title: string, availableWidth: number): string {
  if (titleWidth(title) <= availableWidth) return title;
  let fitted = "";
  for (const character of title) {
    if (titleWidth(fitted + character + "…") > availableWidth) break;
    fitted += character;
  }
  return `${fitted}…`;
}
