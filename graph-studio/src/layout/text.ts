import { getNodeDefine, getNodeTitle } from "../graph/accessors";
import type { FieldMapping } from "../graph/fieldMapping";
import type { DagNode, NodeKey } from "../graph/types";
import { sanitizeNodeLabel } from "../graph/selectors";

export function getNodeVisual(
  nodeKey: NodeKey,
  node: DagNode & { synthetic?: boolean },
  mapping: FieldMapping,
  minNodeWidth: number,
  maxNodeWidth: number,
  showDetail: boolean,
  alignToMaxWidth = false,
): { title: string; detail: string; width: number } {
  if (node.synthetic) {
    const syntheticTitle = getNodeTitle(node, mapping) || "Selected roots";
    return {
      title: syntheticTitle,
      detail: showDetail ? "Combined entry point for every detected root branch." : "",
      width: alignToMaxWidth ? maxNodeWidth : clamp(232, minNodeWidth, maxNodeWidth),
    };
  }

  const title = sanitizeNodeLabel(getNodeTitle(node, mapping) || nodeKey);
  const detail = showDetail ? getNodeDetail(node, title, mapping) : "";
  const estimatedContentWidth = Math.max(estimateTextWidth(title, 15), estimateTextWidth(detail, 10) * 0.76);
  const width = alignToMaxWidth ? maxNodeWidth : clamp(132 + estimatedContentWidth, minNodeWidth, maxNodeWidth);
  return { title: title || nodeKey, detail, width };
}

export function getNodeDetail(node: DagNode, fallbackTitle: string, mapping: FieldMapping): string {
  const defineText = stripRichText(getNodeDefine(node, mapping));
  return firstMeaningfulSegment(defineText) || fallbackTitle;
}

export function stripRichText(text: unknown): string {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$\n]+\$/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/<img[^>]*>/gi, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_>#|-]/g, " ")
    .replace(/\bhttps?:\/\/\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function firstMeaningfulSegment(text: string): string {
  if (!text) {
    return "";
  }
  const segments = text
    .split(/[.?!:;]\s+|\s{2,}/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  return segments.find((segment) => /[A-Za-z\u4e00-\u9fff]/.test(segment)) || "";
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}...`;
}

export function truncateTitleToWidth(text: string, nodeWidth: number): string {
  const availableWidth = Math.max(nodeWidth - 74, 72);
  const estimatedMaxLength = Math.max(10, Math.floor(availableWidth / 7.1));
  return truncate(text, estimatedMaxLength);
}

export function wrapDetailText(text: string, maxLineWidth: number, maxLines: number): string[] {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [""];
  }

  const lines: string[] = [];
  let remaining = normalized;
  while (remaining && lines.length < maxLines) {
    if (estimateTextWidth(remaining, 10) <= maxLineWidth) {
      lines.push(remaining);
      remaining = "";
      break;
    }

    const breakAt = findWrapIndex(remaining, maxLineWidth);
    lines.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trimStart();
  }

  if (remaining) {
    const lastLine = lines[lines.length - 1] || "";
    lines[lines.length - 1] = fitTextWithEllipsis(lastLine, maxLineWidth);
  }

  return lines.slice(0, maxLines);
}

export function estimateTextWidth(text: string, fontSize: number): number {
  return Array.from(String(text || "")).reduce((width, character) => width + getCharacterEmWidth(character) * fontSize, 0);
}

function findWrapIndex(text: string, maxLineWidth: number): number {
  const characters = Array.from(text);
  let width = 0;
  let consumedCodeUnits = 0;
  let lastBreakCodeUnits = 0;
  let lastBreakWidth = 0;

  for (const character of characters) {
    const nextWidth = width + getCharacterEmWidth(character) * 10;
    const nextConsumedCodeUnits = consumedCodeUnits + character.length;
    if (nextWidth > maxLineWidth) {
      if (lastBreakCodeUnits > 0 && lastBreakWidth >= maxLineWidth * 0.42) {
        return lastBreakCodeUnits;
      }
      return Math.max(consumedCodeUnits, character.length);
    }

    width = nextWidth;
    consumedCodeUnits = nextConsumedCodeUnits;
    if (isBreakOpportunity(character)) {
      lastBreakCodeUnits = consumedCodeUnits;
      lastBreakWidth = width;
    }
  }

  return text.length;
}

function fitTextWithEllipsis(text: string, maxLineWidth: number): string {
  const ellipsis = "...";
  const ellipsisWidth = estimateTextWidth(ellipsis, 10);
  const availableWidth = Math.max(maxLineWidth - ellipsisWidth, 0);
  let width = 0;
  let result = "";

  for (const character of Array.from(text.trimEnd())) {
    const nextWidth = width + getCharacterEmWidth(character) * 10;
    if (nextWidth > availableWidth) {
      break;
    }
    width = nextWidth;
    result += character;
  }

  return `${result.trimEnd()}${ellipsis}`;
}

function isBreakOpportunity(character: string): boolean {
  return /\s/.test(character)
    || /[\u3000-\u303f\uff00-\uffef]/.test(character)
    || /[，。！？、；：,.!?:;)\]}]/.test(character)
    || isCjkCharacter(character);
}

function getCharacterEmWidth(character: string): number {
  if (/[\u0300-\u036f]/.test(character)) {
    return 0;
  }
  if (/\s/.test(character)) {
    return 0.32;
  }
  if (isCjkCharacter(character) || /[\u3000-\u303f\uff00-\uffef]/.test(character)) {
    return 1;
  }
  if (/[MW@#%&]/.test(character)) {
    return 0.88;
  }
  if (/[A-Z0-9]/.test(character)) {
    return 0.66;
  }
  if (/[ilI|.,'`!;:]/.test(character)) {
    return 0.34;
  }
  if (/[-_/\\()[\]{}]/.test(character)) {
    return 0.46;
  }
  return 0.56;
}

function isCjkCharacter(character: string): boolean {
  return /[\u3400-\u9fff\uf900-\ufaff]/.test(character);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
