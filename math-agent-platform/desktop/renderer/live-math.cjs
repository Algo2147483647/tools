const katex = require('katex');
// Source ranges are retained: decorations never rewrite the Markdown document.
function formulas(source) {
  const excluded = [];
  const code = /(^|\n)([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n\2\3[^\n]*(?=\n|$)|$)|(`+)[^\n]*?\4/g;
  let match;
  while ((match = code.exec(source))) excluded.push([match.index, code.lastIndex]);
  const pattern = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([^\n]+?)\\\)|(?<![\\$])\$(?![\s$])([^\n$]+?)(?<![\\\s])\$(?!\d)/g;
  const found = [];
  while ((match = pattern.exec(source))) {
    if (excluded.some(([a,b]) => match.index < b && pattern.lastIndex > a)) continue;
    let slashes=0; for(let i=match.index-1;i>=0 && source[i]==='\\';i--)slashes++;
    if(slashes%2)continue;
    const tex = match[1] ?? match[2] ?? match[3] ?? match[4];
    if(tex.length > 4096) continue;
    found.push({ from: match.index, to: pattern.lastIndex, tex, display: match[1] !== undefined || match[2] !== undefined });
  }
  return found;
}
function liveMath(context) {
  const { Plugin, TextSelection } = context.pmState;
  const { Decoration, DecorationSet } = context.pmView;
  function decorate(state) {
    const positions = [], lines = []; let index = 0;
    state.doc.forEach((node, offset) => {
      if (lines.length) { positions[index++] = offset; }
      const text = node.textContent;
      lines.push(text);
      for (let j=0;j<text.length;j++) positions[index++]=offset+1+j;
    });
    const source = lines.join('\n'), decorations=[];
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
        const edit=event=>{event.preventDefault();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,from+ (formula.display?2:1))));view.focus();};
        node.addEventListener('mousedown',edit);node.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')edit(event)});
        return node;
      },{side:1,key:formula.from+':'+formula.to+':'+formula.tex+':'+editing,stopEvent:()=>true}));
    }
    return DecorationSet.create(state.doc,decorations);
  }
  return { markdownPlugins: [() => new Plugin({ state: { init:(_,state)=>decorate(state), apply:(tr,old,_previous,state)=>tr.docChanged||tr.selectionSet?decorate(state):old }, props:{decorations(state){return this.getState(state)}} })] };
}
module.exports={formulas,liveMath};
