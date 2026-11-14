import type {Run,View} from './contracts';
export function answerMarkdown(run:Run):string{return run.blocks.filter(b=>b.kind==='text').map(b=>b.text||'').filter(Boolean).join('\n\n');}
function fenced(value:unknown){const text=JSON.stringify(value,null,2)??'null';const fence='`'.repeat(Math.max(3,...Array.from(text.matchAll(/`+/g),m=>m[0].length+1)));return `${fence}json\n${text}\n${fence}`;}
function cell(value:unknown){return String(value??'—').replace(/\\/g,'\\\\').replace(/\|/g,'\\|').replace(/\r?\n/g,'<br>');}
export function runMarkdown(run:Run,getView:(id:string)=>View):string{
 const parts=['# Mathematics Workbench',`Status: ${run.status}\n\nStarted: ${run.createdAt}`,'## Question',run.input,'## Solution',answerMarkdown(run)];
 for(const block of run.blocks)for(const artifact of block.output?.artifacts||[]){
  const view=getView(artifact.id);parts.push(`### ${view.title||'Result'}`);
  if(view.kind==='table')parts.push('| '+view.columns!.map(cell).join(' | ')+' |\n| '+view.columns!.map(()=>'---').join(' | ')+' |\n'+view.rows!.map(row=>'| '+row.map(cell).join(' | ')+' |').join('\n'));
  else if(view.kind==='image')parts.push(`![Chart](data:image/png;base64,${view.data})`);
  else if(view.kind==='math')parts.push(`$$\n${view.latex}\n$$`);
  else parts.push(fenced(view));
 }
 parts.push('## Detail');
 for(const block of run.blocks){if(block.reasoning)parts.push('### Model reasoning',block.reasoning);if(block.kind==='tool')parts.push(`### ${block.name} · ${block.operation} · ${block.status}`,'#### Parameters',fenced(block.input),'#### Full result',fenced(block.output),'#### Progress',fenced(block.progressEvents||[]));}
 if(run.error)parts.push('### Error',fenced(run.error));
 parts.push('### Event timeline',fenced(run.events),'### Attached datasets',fenced(run.datasets));
 return parts.join('\n\n')+'\n';
}
