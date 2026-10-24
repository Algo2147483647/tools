import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { RelativeLinkRoot } from "../../adapters/relativeLinks";
import { isExternalUrl, isRelativeLink, resolveRelativeFile, resolveRelativePath } from "../../adapters/relativeLinks";

export default function MarkdownContent({
  value,
  emphasize = false,
  previewSurface = false,
  relativeLinkRoot = null,
  onOpenRelativeLink,
}: {
  value: string;
  emphasize?: boolean;
  previewSurface?: boolean;
  relativeLinkRoot?: RelativeLinkRoot | null;
  onOpenRelativeLink?: (url: string) => void;
}) {
  return (
    <div
      className={[
        "node-detail-markdown",
        emphasize ? "node-detail-markdown--define" : "",
        previewSurface ? "node-detail-markdown--preview" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeKatex]}
        components={{
          table: ({ children, node: _node, ...props }) => (
            <div className="node-detail-table-wrap">
              <table {...props}>{children}</table>
            </div>
          ),
          a: ({ href, children, ...props }) => {
            const url = String(href || "");
            if (!url || isExternalUrl(url) || !isRelativeLink(url)) {
              return (
                <a
                  href={href}
                  target={isExternalUrl(url) ? "_blank" : undefined}
                  rel={isExternalUrl(url) ? "noreferrer" : undefined}
                  {...props}
                >
                  {children}
                </a>
              );
            }
            const resolved = resolveRelativePath(url, relativeLinkRoot?.baseFile);
            return (
              <a
                href={href}
                title={
                  resolved.ok
                    ? `Resolves to: ${relativeLinkRoot?.name || "(open a workspace)"}/${resolved.path}`
                    : resolved.message
                }
                {...props}
                onClick={(event) => {
                  event.preventDefault();
                  onOpenRelativeLink?.(url);
                }}
              >
                {children}
              </a>
            );
          },
          img: ({ src, alt, ...props }) => (
            <RelativeMarkdownImage
              src={String(src || "")}
              alt={String(alt || "")}
              relativeLinkRoot={relativeLinkRoot}
              {...props}
            />
          ),
        }}
      >
        {value}
      </ReactMarkdown>
    </div>
  );
}

function RelativeMarkdownImage({
  src,
  alt,
  relativeLinkRoot,
  ...props
}: {
  src: string;
  alt: string;
  relativeLinkRoot: RelativeLinkRoot | null;
} & React.ImgHTMLAttributes<HTMLImageElement>) {
  const [resolvedSrc, setResolvedSrc] = useState(src);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    setUnavailable(false);

    if (!src || isExternalUrl(src) || !isRelativeLink(src)) {
      setResolvedSrc(src);
      return;
    }

    if (!relativeLinkRoot) {
      setResolvedSrc("");
      setUnavailable(true);
      return;
    }

    setResolvedSrc("");
    resolveRelativeFile(relativeLinkRoot, src).then((result) => {
      if (cancelled) {
        if (result.ok) {
          URL.revokeObjectURL(result.file.url);
        }
        return;
      }
      if (!result.ok) {
        setUnavailable(true);
        return;
      }
      objectUrl = result.file.url;
      setResolvedSrc(result.file.url);
    });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [relativeLinkRoot, src]);

  if (unavailable) {
    return null;
  }

  if (!resolvedSrc) {
    return <span className="node-detail-image-loading">Loading image: {src}</span>;
  }

  return <img src={resolvedSrc} alt={alt} {...props} onError={() => setUnavailable(true)} />;
}
