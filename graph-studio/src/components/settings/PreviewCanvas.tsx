import { useLayoutEffect,useRef } from "react";
import type { GraphAppearance } from "../../graph/appearance";
import type { StageData } from "../../layout/shared/types";
import GraphStage from "../../rendering/GraphStage";


const noop = () => {};


export function PreviewCanvas({
  stage,
  appearance,
  hideNodeBorders,
  zoom,
  onToggle,
  onEnter,
  mode,
}: {
  stage: StageData;
  appearance: GraphAppearance;
  hideNodeBorders: boolean;
  zoom: number;
  onToggle: (id: string) => void;
  onEnter: (id: string) => void;
  mode: "overview" | "detail";
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const svg = svgRef.current,
      viewport = viewportRef.current;
    if (!svg || !viewport) return;
    let disposed = false;
    const fit = () => {
      if (disposed || !viewport.clientWidth || !viewport.clientHeight) return;
      // Measure rendered text as well as geometry; shadows need padding beyond getBBox().
      let boxes = [...svg.children]
        .filter(
          (element) =>
            element.tagName.toLowerCase() === "g" &&
            !element.classList.contains("dag-backdrop") &&
            !element.classList.contains("timeline-floating"),
        )
        .map((element) => (element as SVGGraphicsElement).getBBox())
        .filter((box) => box.width > 0 || box.height > 0);
      svg.setAttribute("data-preview-detail", String(mode === "detail"));
      if (mode === "detail") {
        const node =
          svg.querySelector<SVGGraphicsElement>(
            '[data-key="api"], [data-key="review"], [data-key="validate"], [data-key="process"]',
          ) ?? svg.querySelector<SVGGraphicsElement>("[data-key]");
        const rootMatrix = svg.getCTM();
        if (node && rootMatrix) {
          // Timeline markers, hit targets and labels live in separate layers with the same key.
          boxes = [...svg.querySelectorAll<SVGGraphicsElement>("[data-key]")]
            .filter((element) => element.dataset.key === node.dataset.key && element.getCTM())
            .map((element) => {
              const box = element.getBBox(),
                transform = rootMatrix.inverse().multiply(element.getCTM()!);
              const points = [
                [box.x, box.y],
                [box.x + box.width, box.y],
                [box.x, box.y + box.height],
                [box.x + box.width, box.y + box.height],
              ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(transform));
              const x = Math.min(...points.map((point) => point.x)),
                y = Math.min(...points.map((point) => point.y));
              return {
                x,
                y,
                width: Math.max(...points.map((point) => point.x)) - x,
                height: Math.max(...points.map((point) => point.y)) - y,
              } as DOMRect;
            });
        }
      }
      const padding =
        20 + (appearance.display.nodeShadow ? appearance.display.shadowBlur * 2 + appearance.display.shadowOffset : 0);
      const x =
        stage.timeline && mode === "overview"
          ? 0
          : (boxes.length ? Math.min(...boxes.map((box) => box.x)) : 0) - padding;
      const y =
        mode === "overview" && (stage.timeline || stage.lanes.length)
          ? 0
          : (boxes.length ? Math.min(...boxes.map((box) => box.y)) : 0) - padding;
      const width = Math.max(
        1,
        stage.timeline && mode === "overview"
          ? stage.stageWidth
          : Math.max(...boxes.map((box) => box.x + box.width), 1) - x + padding,
      );
      const height = Math.max(
        1,
        stage.timeline && mode === "overview"
          ? stage.stageHeight
          : Math.max(...boxes.map((box) => box.y + box.height), 1) - y + padding,
      );
      const scale = Math.min((viewport.clientWidth - 1) / width, (viewport.clientHeight - 1) / height) * zoom;
      svg.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
      svg.setAttribute("width", String(width * scale));
      svg.setAttribute("height", String(height * scale));
    };
    const observer = new ResizeObserver(fit);
    observer.observe(viewport);
    fit();
    void svg.ownerDocument.fonts.ready.then(fit);
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [stage, appearance, hideNodeBorders, zoom, mode]);
  return (
    <div className="preview-viewport" ref={viewportRef}>
      <GraphStage
        stage={stage}
        focusedKey={null}
        appearance={appearance}
        hideNodeBorders={hideNodeBorders}
        svgRef={svgRef}
        onNodeClick={noop}
        onNodeDoubleClick={noop}
        onNodeContextMenu={(event) => event.preventDefault()}
        onBackgroundContextMenu={(event) => event.preventDefault()}
        onFocusChange={noop}
        onGroupToggle={onToggle}
        onGroupEnter={onEnter}
      />
    </div>
  );
}
