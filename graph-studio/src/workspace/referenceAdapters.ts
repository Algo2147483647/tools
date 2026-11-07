import { parseTree, getNodeValue, getNodePath, modify, applyEdits, type Node as JsonNode } from "jsonc-parser";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { parse as parseHtml } from "parse5";
import postcss from "postcss";
import valueParser from "postcss-value-parser";
import { linkPath, resolveWorkspacePath } from "./paths";
import type { ReferenceLocation } from "./fileContracts";

type Edit = { start: number; end: number; text: string };
type Token = { raw: string; start: number; end: number; remove: Edit; encode?: (s: string) => string };
export const referenceTextFile = /\.(json|md|markdown|mdown|html?|css|svg)$/i;
const markdown = unified().use(remarkParse).use(remarkGfm);
export function referenceTarget(source: string, raw: string): string | null {
  if (!raw || /^(?:[a-z][\w+.-]*:|\/|#)/i.test(raw)) return null;
  try {
    return linkPath(raw, source);
  } catch {
    return null;
  }
}
function rewritePath(source: string, target: string, raw: string, direct = false) {
  const from = source.split("/").slice(0, -1),
    to = target.split("/");
  while (from.length && from[0] === to[0]) {
    from.shift();
    to.shift();
  }
  const path = [...from.map(() => ".."), ...to].join("/");
  if (direct) return path;
  const encoded = path
    .split("/")
    .map((p) => encodeURIComponent(p))
    .join("/");
  return (/%[\da-f]{2}/i.test(raw) || /[ #?]/.test(path) ? encoded : path) + (raw.match(/[?#].*$/)?.[0] || "");
}
function applyText(text: string, edits: Edit[]) {
  const unique = [...new Map(edits.map((e) => [`${e.start}:${e.end}`, e])).values()].sort(
    (a, b) => b.start - a.start || b.end - a.end,
  );
  let boundary = text.length;
  for (const edit of unique) {
    if (edit.end > boundary) continue;
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
    boundary = edit.start;
  }
  return text;
}
function htmlTokens(text: string): Token[] {
  const tree: any = parseHtml(text, { sourceCodeLocationInfo: true });
  const tokens: Token[] = [];
  function walk(node: any) {
    if (node.tagName === "base") throw new Error("HTML base URLs require manual review.");
    if (
      (node.attrs || []).some(
        (attr: any) => attr.name === "srcset" || (attr.name === "style" && /url\(/i.test(attr.value)),
      )
    )
      throw new Error("HTML srcset and inline CSS resources require manual review before file operations.");
    if (
      node.tagName === "style" &&
      (node.childNodes || []).some((child: any) => /url\(|@import/i.test(child.value || ""))
    )
      throw new Error("Embedded CSS resources require manual review before file operations.");
    for (const attr of node.attrs || []) {
      if (!["src", "href", "poster", "data"].includes(attr.name)) continue;
      const loc = node.sourceCodeLocation?.attrs?.[attr.prefix ? `${attr.prefix}:${attr.name}` : attr.name];
      if (!loc) continue;
      const part = text.slice(loc.startOffset, loc.endOffset);
      const match = /=\s*(["']?)([\s\S]*?)\1$/.exec(part);
      if (!match) continue;
      const start =
        loc.startOffset + part.indexOf("=") + 1 + part.slice(part.indexOf("=") + 1).search(/\S/) + (match[1] ? 1 : 0);
      const whole = node.sourceCodeLocation;
      tokens.push({
        raw: attr.value,
        start,
        end: start + match[2].length,
        encode: (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"),
        remove: ["img", "link", "source"].includes(node.tagName)
          ? { start: whole.startOffset, end: whole.endOffset, text: "" }
          : { start: loc.startOffset, end: loc.endOffset, text: "" },
      });
    }
    for (const child of node.childNodes || []) walk(child);
    if (node.content) walk(node.content);
  }
  walk(tree);
  return tokens;
}
function cssTokens(text: string): Token[] {
  const root = postcss.parse(text),
    tokens: Token[] = [];
  root.walkDecls((decl) => {
    const value = valueParser(decl.value);
    const start = decl.source!.start!.offset! + decl.prop.length + (decl.raws.between || ": ").length;
    value.walk((node) => {
      if (node.type !== "function" || node.value.toLowerCase() !== "url") return;
      const child = node.nodes.find((n) => n.type === "string" || n.type === "word");
      if (!child) return false;
      const quote = child.type === "string" ? 1 : 0;
      tokens.push({
        raw: child.value,
        start: start + child.sourceIndex + quote,
        end: start + child.sourceEndIndex - quote,
        remove: { start: start + node.sourceIndex, end: start + node.sourceEndIndex, text: "none" },
      });
      return false;
    });
  });
  root.walkAtRules("import", (rule) => {
    const parsed = valueParser(rule.params),
      first = parsed.nodes[0];
    const item = first?.type === "function" ? first.nodes[0] : first;
    if (!item || !(item.type === "string" || item.type === "word")) return;
    const base = rule.source!.start!.offset! + 1 + rule.name.length + (rule.raws.afterName || " ").length;
    const quote = item.type === "string" ? 1 : 0;
    tokens.push({
      raw: item.value,
      start: base + item.sourceIndex + quote,
      end: base + item.sourceEndIndex - quote,
      remove: { start: rule.source!.start!.offset!, end: rule.source!.end!.offset! + 1, text: "" },
    });
  });
  return tokens;
}
function markdownTokens(text: string): Token[] {
  const tree: any = markdown.parse(text),
    tokens: Token[] = [],
    definitions = new Map<string, any>();
  function collect(node: any) {
    if (node.type === "definition") definitions.set(node.identifier, node);
    for (const child of node.children || []) collect(child);
  }
  collect(tree);
  function walk(node: any) {
    const start = node.position?.start.offset,
      end = node.position?.end.offset;
    if (node.type === "html") {
      for (const token of htmlTokens(node.value))
        tokens.push({
          ...token,
          start: token.start + start,
          end: token.end + start,
          remove: { ...token.remove, start: token.remove.start + start, end: token.remove.end + start },
        });
    }
    if (["link", "image", "definition"].includes(node.type)) {
      const part = text.slice(start, end),
        raw = node.url;
      // The parser establishes semantics; locate the URL only within its parsed node.
      const offset = part.indexOf(raw, node.type === "definition" ? part.indexOf(":") + 1 : part.indexOf("](") + 2);
      if (offset < 0) throw new Error("Escaped Markdown destinations require manual review.");
      const label =
        node.children?.map((n: any) => text.slice(n.position.start.offset, n.position.end.offset)).join("") || "";
      tokens.push({
        raw,
        start: start + offset,
        end: start + offset + raw.length,
        remove: { start, end, text: node.type === "link" ? label : "" },
      });
    }
    if (["linkReference", "imageReference"].includes(node.type)) {
      const definition = definitions.get(node.identifier);
      if (definition)
        tokens.push({
          raw: definition.url,
          start,
          end,
          encode: () => text.slice(start, end),
          remove: {
            start,
            end,
            text:
              node.type === "linkReference"
                ? node.children.map((n: any) => text.slice(n.position.start.offset, n.position.end.offset)).join("")
                : "",
          },
        });
    }
    for (const child of node.children || []) walk(child);
  }
  walk(tree);
  return tokens;
}
export function analyzeReferences(path: string, content: string) {
  const json = /\.json$/i.test(path);
  type Group = { pointer?: (string | number)[]; offset: number; text: string; tokens: Token[]; direct?: boolean };
  const groups: Group[] = [];
  if (json) {
    JSON.parse(content);
    const tree = parseTree(content)!;
    const value = getNodeValue(tree);
    function visit(node: JsonNode) {
      if (node.type === "string" && !(node.parent?.type === "property" && node.parent.children?.[0] === node)) {
        const pointer = getNodePath(node),
          key = pointer.join(".");
        const direct =
          (value.format === "graph-studio" && /^metadata\.(style|layout)$/.test(key)) ||
          (value.format === "graph-studio-workspace" && /^graphs\.\d+$/.test(key));
        const md =
          value.format === "graph-studio" && pointer.length === 3 && pointer[0] === "nodes" && pointer[2] === "define";
        if (direct)
          groups.push({
            pointer,
            offset: node.offset,
            text: node.value,
            direct: true,
            tokens: [
              {
                raw: node.value,
                start: 0,
                end: node.value.length,
                remove: { start: 0, end: node.value.length, text: "" },
              },
            ],
          });
        if (md) groups.push({ pointer, offset: node.offset, text: node.value, tokens: markdownTokens(node.value) });
      }
      for (const child of node.children || []) visit(child);
    }
    visit(tree);
  } else {
    const tokens = /\.md(?:own|arkdown)?$/i.test(path)
      ? markdownTokens(content)
      : /\.css$/i.test(path)
        ? cssTokens(content)
        : htmlTokens(content);
    groups.push({ offset: 0, text: content, tokens });
  }
  const targetOf = (group: Group, raw: string) => {
    if (!group.direct) return referenceTarget(path, raw);
    try {
      return resolveWorkspacePath(raw, path);
    } catch {
      return null;
    }
  };
  const links: ReferenceLocation[] = [];
  for (const group of groups)
    for (const token of group.tokens) {
      const target = targetOf(group, token.raw);
      if (!target) continue;
      const offset = group.pointer ? group.offset : token.start;
      const line = content.slice(0, offset).split("\n").length;
      links.push({
        source: path,
        target,
        raw: token.raw,
        line,
        context: content.split("\n")[line - 1],
        locator: group.pointer ? "/" + group.pointer.join("/") : String(offset),
      });
    }
  return {
    links,
    rewrite(target: string, newPath?: string, caseInsensitive = false) {
      let result = content;
      // Reverse traversal preserves JSON array indices during removal.
      for (const group of [...groups].reverse()) {
        const edits: Edit[] = [];
        for (const token of group.tokens)
          if (
            (caseInsensitive ? targetOf(group, token.raw)?.toLowerCase() : targetOf(group, token.raw)) ===
            (caseInsensitive ? target.toLowerCase() : target)
          ) {
            edits.push(
              newPath
                ? {
                    start: token.start,
                    end: token.end,
                    text: token.encode
                      ? token.encode(rewritePath(path, newPath, token.raw, group.direct))
                      : rewritePath(path, newPath, token.raw, group.direct),
                  }
                : token.remove,
            );
          }
        if (!edits.length) continue;
        const next = applyText(group.text, edits);
        if (group.pointer) {
          let pointer = group.pointer;
          let value: unknown = group.direct && !newPath ? undefined : next;
          if (value === undefined && typeof pointer[pointer.length - 1] === "number") {
            const index = pointer[pointer.length - 1] as number;
            pointer = pointer.slice(0, -1);
            const array = pointer.reduce((node: any, key) => node[key], JSON.parse(result)) as unknown[];
            value = array.filter((_, i) => i !== index);
          }
          result = applyEdits(
            result,
            modify(result, pointer, value, {
              formattingOptions: { insertSpaces: true, tabSize: 2, eol: content.includes("\r\n") ? "\r\n" : "\n" },
            }),
          );
        } else result = next;
      }
      return result;
    },
  };
}
