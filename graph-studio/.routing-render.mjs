import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/29753/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const d=JSON.parse(await readFile('test-results/routing-preview.json','utf8')),g=d.layout.geometry;
const escape=s=>s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
let svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${g.size.join(' ')}" width="1800" height="1000"><rect width="100%" height="100%" fill="white"/>`;
for(const n of g.groups){const t=d.items.find(i=>i.id===n.id);svg+=`<rect x="${n.position[0]}" y="${n.position[1]}" width="${n.size[0]}" height="${n.size[1]}" fill="${t.depth===0?'#f5f7fa':'#fff9df'}" stroke="#d9dde3" rx="6"/><text x="${n.position[0]+12}" y="${n.position[1]+22}" font-size="14">${escape(t.title)}</text>`;}
for(const e of g.edges)svg+=`<polyline points="${e.points.map(p=>p.join(',')).join(' ')}" fill="none" stroke="#69829b" stroke-width="1.5"/>`;
for(const n of g.nodes){const s=d.minimumSizes[n.id],t=d.items.find(i=>i.id===n.id);svg+=`<rect x="${n.position[0]-s.width/2}" y="${n.position[1]-s.height/2}" width="${s.width}" height="${s.height}" fill="white" stroke="#b8c4d2" rx="8"/><text x="${n.position[0]}" y="${n.position[1]}" text-anchor="middle" font-size="14">${escape(t.title)}</text>`;}
svg+='</svg>';const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1800,height:1000}});await page.setContent(svg);await page.screenshot({path:'test-results/routing-preview.png'});await browser.close();
