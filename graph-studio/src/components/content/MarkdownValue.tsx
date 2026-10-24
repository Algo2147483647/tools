import { Component,lazy,Suspense,type ComponentProps,type ReactNode } from "react";

const MarkdownContent = lazy(() => import("./MarkdownContent"));
type MarkdownValueProps = ComponentProps<typeof MarkdownContent>;

class MarkdownBoundary extends Component<{ value: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div>
          <p className="node-detail-empty" role="status">
            Markdown preview unavailable. Showing plain text.
          </p>
          <pre className="file-preview-text">{this.props.value}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function MarkdownValue(props: MarkdownValueProps) {
  if (!props.value.trim()) return <p className="node-detail-empty">(empty string)</p>;
  return (
    <MarkdownBoundary value={props.value}>
      <Suspense
        fallback={
          <p className="node-detail-empty" role="status">
            Loading preview…
          </p>
        }
      >
        <MarkdownContent {...props} />
      </Suspense>
    </MarkdownBoundary>
  );
}
