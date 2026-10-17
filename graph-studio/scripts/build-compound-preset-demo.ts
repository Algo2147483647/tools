import { readFileSync, writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ELK from "elkjs/lib/elk.bundled.js";
import { normalizeDagInput } from "../src/graph/normalize";
import { getDefaultChartStyle } from "../src/state/chartStyles";
import { getStageAppearance } from "../src/layout/appearance";
import { buildCompoundStage } from "../src/layout/compound-layout";
import GraphStage from "../src/rendering/GraphStage";

const style = getDefaultChartStyle("compound");
const dag = normalizeDagInput({
  format: "graph-studio",
  version: 3,
  nodes: {
    client: { title: "Client", define: "Submit an order" },
    web: { title: "Web app", define: "Receive customer requests" },
    api: { title: "Order API", define: "Validate and dispatch" },
    cache: { title: "Cache", define: "Frequently used records" },
    database: { title: "Database", define: "Persistent order records" },
    partner: { title: "Partner", define: "Delivery notifications" },
  },
  edges: [
    { id: "client-web", source: "client", target: "web", value: "submit" },
    { id: "web-api", source: "web", target: "api", value: "request" },
    { id: "api-cache", source: "api", target: "cache", value: "read" },
    { id: "api-database", source: "api", target: "database", value: "write" },
    { id: "cache-database", source: "cache", target: "database", value: "refresh" },
    { id: "api-partner", source: "api", target: "partner", value: "notify" },
    { id: "partner-api", source: "partner", target: "api", value: "ack" },
  ],
  hierarchy: {
    id: "compound-default",
    groups: { app: { title: "Application" }, storage: { title: "Storage" } },
    parentById: { web: "app", api: "app", storage: "app", cache: "storage", database: "storage" },
  },
});
const elk = new ELK();
const groupIds = ["app", "storage"];
const views: Record<string, string> = {};
const noop = () => {};
for (const focusGroupId of [null, ...groupIds]) {
  for (let mask = 0; mask < 4; mask++) {
    const stage = await buildCompoundStage(
      {
        dag,
        view: { focusGroupId, collapsedGroupIds: groupIds.filter((_, i) => mask & (1 << i)) },
        ...style,
        appearance: getStageAppearance(style.appearance),
        showEdgeLabels: style.appearance.display.showEdgeLabels,
      },
      elk,
    );
    views[`${focusGroupId ?? "root"}:${mask}`] = renderToStaticMarkup(
      createElement(GraphStage, {
        ...style,
        stage,
        focusedKey: null,
        svgRef: { current: null },
        onNodeClick: noop,
        onNodeDoubleClick: noop,
        onNodeContextMenu: noop,
        onBackgroundContextMenu: noop,
        onFocusChange: noop,
        onGroupToggle: noop,
        onGroupEnter: noop,
      }),
    );
    const points = [
      ...stage.nodes.flatMap((n) => [
        { x: n.x - n.width / 2, y: n.y - n.height / 2 },
        { x: n.x + n.width / 2, y: n.y + n.height / 2 },
      ]),
      ...(stage.groups ?? []).flatMap((g) => [
        { x: g.x, y: g.y },
        { x: g.x + g.width, y: g.y + g.height },
      ]),
      ...stage.edges.flatMap((e) => e.points ?? []),
    ];
    const left = Math.min(...points.map((p) => p.x)) - 40;
    const top = Math.min(...points.map((p) => p.y)) - 40;
    const width = Math.max(...points.map((p) => p.x)) - left + 40;
    const height = Math.max(...points.map((p) => p.y)) - top + 40;
    const viewKey = `${focusGroupId ?? "root"}:${mask}`;
    views[viewKey] = views[viewKey].replace(/viewBox="[^"]*"/, `viewBox="${left} ${top} ${width} ${height}"`);
  }
}
const base = readFileSync(new URL("../docs/design/node-link-presets.html", import.meta.url), "utf8");
const css = base.match(/<style>([\s\S]*?)<\/style>/)![1];
const data = JSON.stringify(views).replace(/</g, "\\u003c");
const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Graph Studio · 嵌套图默认预设</title><style>${css}
.views{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}.views button{border:1px solid #dce2eb;border-radius:7px;background:white;color:#607087;padding:7px 14px;font-size:12px}.views button[aria-pressed="true"]{background:#eaf1ff;color:#234fae;border-color:#a9bee4}.canvas{height:460px}.toolbar{flex-wrap:wrap;gap:12px}.toolbar strong{margin-right:12px}.graph-host{min-width:100%;min-height:100%}#back{font-size:12px;border:0;background:none;color:#526d96;padding:8px}#back:disabled{opacity:.35}.selection{min-height:43px} @media(max-width:650px){.canvas{height:360px}}
</style></head><body><main>
<header><div><small>GRAPH STUDIO / NESTED NODE-LINK</small><h1>嵌套图 · 默认预设</h1><p>同一套 Default · 查看收起与展开的层级效果</p></div><span class="badge">Nested node-link · 唯一预设</span></header>
<div class="views" role="group" aria-label="展开状态"><button data-mask="3">全部收起</button><button data-mask="2">默认层级</button><button data-mask="0">全部展开</button></div>
<section class="preview" aria-label="嵌套图默认预设预览"><div class="toolbar"><div><strong>Default</strong><small>6 个节点 · 2 个分组 · 7 条关系</small></div><div class="zoom" role="group" aria-label="预览缩放"><button id="back" disabled>返回总览</button><button id="zoom-out" aria-label="缩小">−</button><span id="zoom-level">适配</span><button id="zoom-in" aria-label="放大">+</button><button id="fit">适配</button></div></div>
<div class="canvas"><div class="graph-host"></div></div><div class="selection" role="status" id="selection-status"></div>
<dl class="specs"><div><dt>节点</dt><dd>${style.appearance.layout.nodeHeight} px 高<small>${style.appearance.display.nodeCornerRadius} px 圆角 · ${style.alignNodeWidthsToMax ? "等宽" : "宽度随内容调整"}</small></dd></div><div><dt>内容</dt><dd>${style.showNodeDetail ? "标题 + 详情" : "仅标题"}<small>${style.hideNodeBorders ? "无节点边框" : "节点边框"} · ${style.appearance.display.showGroupStats ? "显示分组统计" : "隐藏分组统计"}</small></dd></div><div><dt>分组</dt><dd>两级嵌套<small>浅色容器 · 可收起、展开和进入</small></dd></div><div><dt>连线</dt><dd>${style.appearance.display.showEdgeLabels ? "显示关系标签" : "隐藏关系标签"}<small>收起后汇总跨组关系</small></dd></div></dl></section>
<footer><span>点击节点查看高亮 · + / − 切换分组 · ↗ 进入分组</span><span>使用当前嵌套图默认值 · 与正式渲染一致</span></footer></main>
<script>
const views=${data};
const host=document.querySelector('.graph-host'), canvas=document.querySelector('.canvas'),root=host.attachShadow({mode:'open'});
let mask=3,focus=null,zoom=1,svg;
function setZoom(value){zoom=Math.max(1,Math.min(3,value));host.style.width=zoom*100+'%';host.style.height=zoom*100+'%';canvas.classList.toggle('zoomed',zoom>1);document.getElementById('zoom-level').textContent=zoom===1?'适配':Math.round(zoom*100)+'%';document.getElementById('zoom-out').disabled=zoom===1;document.getElementById('zoom-in').disabled=zoom===3;if(zoom===1){canvas.scrollTop=0;canvas.scrollLeft=0;}}
function highlight(key){const neighbors=new Set();svg.querySelectorAll('.dag-edge').forEach(e=>{const active=!!key&&(e.dataset.source===key||e.dataset.target===key);e.dataset.active=String(active);if(active){neighbors.add(e.dataset.source);neighbors.add(e.dataset.target)}});svg.dataset.hasInteractiveNode=String(!!key);svg.querySelectorAll('.dag-node').forEach(n=>{n.dataset.focused=String(n.dataset.key===key);n.dataset.connected=String(n.dataset.key!==key&&neighbors.has(n.dataset.key))});document.getElementById('selection-status').textContent=key?'已选中：'+svg.querySelector('[data-key="'+key+'"] .dag-node__title').textContent:'点击节点查看关联高亮 · 点击空白处取消';}
function render(){root.innerHTML='<style>:host{display:block}svg{width:100%;height:100%;display:block;font-family:"Segoe UI",sans-serif}</style>'+views[(focus||'root')+':'+mask];svg=root.querySelector('svg');const b=svg.viewBox.baseVal;const width=Math.max(b.width,900),height=Math.max(b.height,360);svg.setAttribute('viewBox',[b.x-(width-b.width)/2,b.y-(height-b.height)/2,width,height].join(' '));document.querySelectorAll('[data-mask]').forEach(b=>b.setAttribute('aria-pressed',String(!focus&&Number(b.dataset.mask)===mask)));document.getElementById('back').disabled=!focus;highlight(null);setZoom(1);}
function activate(target){const button=target.closest('.dag-group-controls [role="button"]');if(button){const label=button.getAttribute('aria-label'),id=button.closest('[data-group-id]').dataset.groupId;if(label.startsWith('Enter ')){focus=id;mask&=~(1<<['app','storage'].indexOf(id));}else{mask^=1<<['app','storage'].indexOf(id);}render();return;}highlight(target.closest('.dag-node')?.dataset.key||null);}
root.addEventListener('click',e=>activate(e.target));root.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate(e.target)}if(e.key==='Escape')highlight(null)});
document.querySelectorAll('[data-mask]').forEach(b=>b.onclick=()=>{focus=null;mask=Number(b.dataset.mask);render()});document.getElementById('back').onclick=()=>{focus=null;render()};document.getElementById('zoom-in').onclick=()=>setZoom(zoom+.25);document.getElementById('zoom-out').onclick=()=>setZoom(zoom-.25);document.getElementById('fit').onclick=()=>setZoom(1);render();
</script></body></html>`;
writeFileSync(new URL("../docs/design/compound-presets.html", import.meta.url), html);
console.log("Generated docs/design/compound-presets.html with 12 interactive hierarchy views.");
