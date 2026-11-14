import {renderMarkdown} from './markdown';
import type {EditorState,Transaction} from 'prosemirror-state';
import type {Decoration} from 'prosemirror-view';
interface PluginContext {pmState:typeof import('prosemirror-state');pmView:typeof import('prosemirror-view')}
const katex = require('katex') as typeof import('katex');
// Source ranges are retained: decorations never rewrite the Markdown document.
function formulas(source: string) {
  const excluded = [];
  const code = /(^|\n)([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n\2\3[^\n]*(?=\n|$)|$)|(`+)[^\n]*?\4/g;
  let match;
  while ((match = code.exec(source))) excluded.push([match.index, code.lastIndex]);
  const pattern = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([^\n]+?)\\\)|(?<![\\$])\$(?![\s$])([^\n$]+?)(?<![\\\s])\$(?!\d)/g;
  const found = [];
  while ((match = pattern.exec(source))) {
    if (excluded.some(([a,b]) => match!.index < b && pattern.lastIndex > a)) continue;
    let slashes=0; for(let i=match.index-1;i>=0 && source[i]==='\\';i--)slashes++;
    if(slashes%2)continue;
    const tex = match[1] ?? match[2] ?? match[3] ?? match[4];
    if(tex.length > 4096) continue;
    found.push({ from: match.index, to: pattern.lastIndex, tex, display: match[1] !== undefined || match[2] !== undefined });
  }
  return found;
}
function boldRanges(source:string) {
  const excluded:[number,number][]=[];
  const code=/(^|\n)([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n\2\3[^\n]*(?=\n|$)|$)|(`+)[^\n]*?\4/g;
  let match;while((match=code.exec(source)))excluded.push([match.index,code.lastIndex]);
  const pattern=/(?<![\\*])\*\*([^\n]+?)\*\*(?!\*)/g;const ranges=[];
  while((match=pattern.exec(source)))if(match[1].trim()&&!excluded.some(([a,b])=>match!.index<b&&pattern.lastIndex>a))ranges.push({from:match.index,to:pattern.lastIndex});
  return ranges;
}
function tableRanges(source:string){
 const lines=source.split('\n'), offsets:number[]=[];let offset=0,fence=false;const ranges=[];
 for(const line of lines){offsets.push(offset);offset+=line.length+1;}
 for(let i=0;i<lines.length;i++){
  if(/^\s*(`{3,}|~{3,})/.test(lines[i])){fence=!fence;continue;}if(fence||!/^\s*\|.*\|\s*$/.test(lines[i]))continue;
  let j=i+1;while(j<lines.length&&!lines[j].trim())j++;
  if(!/^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(lines[j]||''))continue;
  let end=j; j++;
  while(j<lines.length){let next=j;while(next<lines.length&&!lines[next].trim())next++;if(!/^\s*\|.*\|\s*$/.test(lines[next]||''))break;end=next;j=next+1;}
  const from=offsets[i],to=offsets[end]+lines[end].length;ranges.push({from,to,source:source.slice(from,to)});i=end;
 }
 return ranges;
}
function liveMath(context: PluginContext) {
  const { Plugin, TextSelection } = context.pmState;
  const { Decoration, DecorationSet } = context.pmView;
  function decorate(state: EditorState) {
    const positions: number[] = [], lines: string[] = []; let index = 0;
    state.doc.forEach((node, offset) => {
      if (lines.length) { positions[index++] = offset; }
      const text = node.textContent;
      lines.push(text);
      for (let j=0;j<text.length;j++) positions[index++]=offset+1+j;
    });
    const source = lines.join('\n'), decorations: Decoration[]=[];
    for(const table of tableRanges(source)){
      const from=positions[table.from],to=positions[table.to-1]+1;
      if(!Number.isInteger(from)||!Number.isInteger(to))continue;
      const editing=state.selection.from<=to&&state.selection.to>=from;
      if(!editing){
        decorations.push(Decoration.inline(from,to,{class:'math-source-hidden'}));
        state.doc.forEach((node,offset)=>{if(offset>=from-1&&offset<to){const end=offset+node.nodeSize;decorations.push(Decoration.node(offset,end,{class:end<=to?'table-source-collapsed':'table-source-anchor'}));}});
      }
      decorations.push(Decoration.widget(to,view=>{
        const node=document.createElement('span');node.className='editor-table markdown-result';node.contentEditable='false';node.tabIndex=0;node.setAttribute('role','button');node.setAttribute('aria-label','Edit table');node.innerHTML=renderMarkdown(table.source);
        const edit=(event:Event)=>{event.preventDefault();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,from)));view.focus();};node.addEventListener('mousedown',edit);node.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')edit(event)});return node;
      },{side:1,key:'table:'+table.from+':'+table.source,stopEvent:()=>true}));
    }
    for (const bold of boldRanges(source)) {
      const from=positions[bold.from],to=positions[bold.to-1]+1;
      if(!Number.isInteger(from)||!Number.isInteger(to))continue;
      decorations.push(Decoration.inline(from+2,to-2,{class:'editor-strong'}));
      if(!(state.selection.from<=to&&state.selection.to>=from)){
        decorations.push(Decoration.inline(from,from+2,{class:'math-source-hidden'}));
        decorations.push(Decoration.inline(to-2,to,{class:'math-source-hidden'}));
      }
    }
    for (const formula of formulas(source)) {
      const from=positions[formula.from], to=positions[formula.to-1]+1;
      if(!Number.isInteger(from)||!Number.isInteger(to))continue;
      const editing=state.selection.from<=to && state.selection.to>=from;
      let html;
      try { html=katex.renderToString(formula.tex,{displayMode:formula.display,throwOnError:true,trust:false,strict:'ignore',maxExpand:1000,maxSize:20}); }
      catch { continue; } // Incomplete or invalid formulas remain editable source.
      if(!editing) decorations.push(Decoration.inline(from,to,{class:'math-source-hidden'}));
      decorations.push(Decoration.widget(to, view=>{
        const node=document.createElement('span');node.className='editor-math'+(formula.display?' editor-math-display':'')+(editing?' editor-math-editing':'');
        node.innerHTML=html;node.contentEditable='false';node.tabIndex=0;node.setAttribute('role','button');node.setAttribute('aria-label','Edit formula: '+formula.tex);node.title='Click to edit formula';
        const edit=(event:Event)=>{event.preventDefault();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,from+ (formula.display?2:1))));view.focus();};
        node.addEventListener('mousedown',edit);node.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')edit(event)});
        return node;
      },{side:1,key:formula.from+':'+formula.to+':'+formula.tex+':'+editing,stopEvent:()=>true}));
    }
    return DecorationSet.create(state.doc,decorations);
  }
  return { markdownPlugins: [() => new Plugin({ state: { init:(_,state)=>decorate(state), apply:(tr,old,_previous,state)=>tr.docChanged||tr.selectionSet?decorate(state):old }, props:{decorations(state: any){return this.getState(state)}} })] };
}
export { formulas,boldRanges,tableRanges,liveMath };
