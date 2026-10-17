export const HTML_VIEWER_CSS = `
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#fff;color:#253247;font:14px/1.6 "Segoe UI",system-ui,sans-serif}
button{font:inherit;color:inherit;background:#fff;border:1px solid #dbe2ec;border-radius:7px;padding:7px 12px;cursor:pointer}
button:hover{background:#f1f5fb}button:focus-visible,a:focus-visible,article:focus-visible{outline:2px solid #315fce;outline-offset:3px}
[hidden]{display:none!important}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
#canvas-surface{width:100%;height:100%;touch-action:none;cursor:grab}#canvas-surface.is-panning{cursor:grabbing}
#export-canvas{display:block;width:100%;height:100%;max-width:none;max-height:none;outline:none}
#export-canvas .dag-group-header{cursor:pointer}#export-canvas [data-key]:focus-visible{outline:none}
#selection-actions{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:10px;max-width:calc(100% - 24px);padding:8px;background:#fff;border:1px solid #dbe2ec;border-radius:12px;box-shadow:0 8px 32px #25324722}
#selected-title{min-width:0;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-left:8px}#selection-actions button{white-space:nowrap}
#node-details{position:fixed;inset:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;padding:0;border:0;background:#fff;color:#253247}
#node-details[open]{display:flex;flex-direction:column}#node-details header{display:flex;align-items:center;gap:20px;padding:20px 32px;border-bottom:1px solid #e4e9f1}
#node-details h1{font-size:22px;margin:0;overflow-wrap:anywhere;line-height:1.3}#detail-key{color:#69788c;font:12px Consolas,monospace;overflow-wrap:anywhere;margin-left:auto}
#node-details nav{display:flex;gap:8px;padding:12px 32px;border-bottom:1px solid #e4e9f1}#node-details nav button{border-color:transparent}#node-details nav button[aria-pressed=true]{color:#234fae;background:#edf3ff}
#detail-content{flex:1;overflow:auto;padding:28px max(24px,calc((100% - 1000px)/2));overflow-wrap:anywhere}
.detail-field{display:grid;grid-template-columns:160px minmax(0,1fr);gap:24px;padding:18px 0;border-bottom:1px solid #e8edf4}.detail-field h2{font-size:13px;color:#627187;margin:0;font-weight:600}.detail-value>:first-child{margin-top:0}.detail-value>:last-child{margin-bottom:0}
pre{margin:0;background:#f6f8fb;border-radius:8px;padding:16px;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.7 Consolas,monospace}code{font-family:Consolas,monospace}a{color:#2456b8}table{border-collapse:collapse;display:block;max-width:100%;overflow:auto}td,th{padding:8px 12px;border:1px solid #e1e7f0}blockquote{margin-left:0;padding-left:16px;border-left:3px solid #d9e3f4}math{max-width:100%;overflow:auto}
.detail-edge{display:flex;align-items:center;flex-wrap:wrap;gap:12px;padding:14px 0;border-bottom:1px solid #e8edf4}.detail-edge span{color:#627187}.detail-edge code{white-space:pre-wrap}
@media(max-width:600px){#node-details header{flex-wrap:wrap;padding:16px;gap:12px}#node-details h1{width:100%;order:2}#detail-key{max-width:45%}#node-details nav{padding:10px 16px}.detail-field{grid-template-columns:1fr;gap:8px}#detail-content{padding:10px 20px}#selected-title{max-width:120px}}
@media(prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
`;
