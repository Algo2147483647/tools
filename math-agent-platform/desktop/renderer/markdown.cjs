const MarkdownIt = require('markdown-it');
const texmath = require('markdown-it-texmath');
const katex = require('katex');
const options = { throwOnError: false, trust: false, strict: 'ignore', maxExpand: 1000 };
const markdown = new MarkdownIt({ html: false, linkify: false, breaks: false }).use(texmath, {
  engine: katex, delimiters: ['dollars', 'brackets'], katexOptions: options
});
const defaultFence = markdown.renderer.rules.fence;
markdown.renderer.rules.fence = (tokens, index, opts, env, self) => {
  if (tokens[index].info.trim() === 'math') return katex.renderToString(tokens[index].content, { ...options, displayMode: true });
  return defaultFence(tokens, index, opts, env, self);
};
// Remote images are intentionally not fetched from model output.
markdown.renderer.rules.image = (tokens, index) => markdown.utils.escapeHtml(tokens[index].content);
module.exports = {
  renderMarkdown: source => markdown.render(source),
  renderFormula: source => katex.renderToString(source, options)
};
