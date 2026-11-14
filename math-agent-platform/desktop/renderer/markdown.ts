import MarkdownIt from 'markdown-it';
const texmath = require('markdown-it-texmath') as typeof import('markdown-it-texmath');
const katex = require('katex') as typeof import('katex');
const options: import("katex").KatexOptions = { throwOnError: false, trust: false, strict: 'ignore', maxExpand: 1000 };
const markdown = new MarkdownIt({ html: false, linkify: false, breaks: false }).use(texmath, {
  engine: katex, delimiters: ['dollars', 'brackets'], katexOptions: options
});
// Models sometimes place display delimiters inside a prose paragraph. The block
// plugin cannot consume them there, so handle them before Markdown's escape rule.
markdown.inline.ruler.before('escape', 'latex_in_prose', (state, silent) => {
  const open = state.src.slice(state.pos, state.pos + 2);
  if (open !== '\\[' && open !== '\\(') return false;
  const close = open === '\\[' ? '\\]' : '\\)';
  const end = state.src.indexOf(close, state.pos + 2);
  if (end < 0 || end >= state.posMax) return false;
  const content = state.src.slice(state.pos + 2, end);
  if (!content.trim()) return false;
  if (!silent) {
    const token = state.push('latex_in_prose', '', 0);
    token.content = content;
    token.meta = {display: open === '\\['};
  }
  state.pos = end + 2;
  return true;
});
markdown.renderer.rules.latex_in_prose = (tokens, index) => katex.renderToString(
  tokens[index].content, {...options, displayMode: tokens[index].meta?.display === true}
);
const defaultFence = markdown.renderer.rules.fence;
markdown.renderer.rules.fence = (tokens, index, opts, env, self) => {
  if (tokens[index].info.trim() === 'math') return katex.renderToString(tokens[index].content, { ...options, displayMode: true });
  return defaultFence!(tokens, index, opts, env, self);
};
// Remote images are intentionally not fetched from model output.
markdown.renderer.rules.image = (tokens, index) => markdown.utils.escapeHtml(tokens[index].content);
export const renderMarkdown = (source: string) => markdown.render(normalizeTables(source));
export const renderFormula = (source: string) => katex.renderToString(source, options);

function normalizeTables(source:string):string {
 const lines=source.split('\n');let fence='';
 for(let i=0;i<lines.length;i++){
  const marker=lines[i].match(/^\s*(`{3,}|~{3,})/);if(marker){fence=fence?'':marker[1];continue;}if(fence)continue;
  if(!/^\s*\|.*\|\s*$/.test(lines[i]))continue;
  let j=i+1;while(j<lines.length&&!lines[j].trim())j++;
  if(!/^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(lines[j]||''))continue;
  lines.splice(i+1,j-i-1);j=i+2;
  while(j<lines.length){let next=j;while(next<lines.length&&!lines[next].trim())next++;if(!/^\s*\|.*\|\s*$/.test(lines[next]||''))break;lines.splice(j,next-j);j++;}i=j-1;
 }
 return lines.join('\n');
}
