const { test } = require('node:test');
const assert = require('node:assert/strict');
const { renderMarkdown } = require('../build/backend/renderer/markdown.js');
test('dollar and LaTeX delimiters render formulas before Markdown escapes', () => {
  for (const source of ['$x^3+2x=1$', '$$\\frac{1}{2}$$', '\\(x=-5\\)', '\\[\n\\boxed{x=\\sqrt[3]{2}}\n\\]', '```math\nx^2\n```']) {
    const html = renderMarkdown(source); assert.match(html, /class="katex"/); assert.doesNotMatch(html, /katex-error/);
  }
});
test('Markdown structures and code literals survive', () => {
  const html = renderMarkdown('# Answer\n\n**Result**\n\n| x | y |\n|---|---|\n|1|2|\n\n`$x$`\n\n```js\n$y$\n```');
  assert.match(html, /<h1>Answer/); assert.match(html, /<strong>Result/); assert.match(html, /<table>/);
  assert.match(html, /<code>\$x\$/); assert.doesNotMatch(html, /class="katex"/);
});
test('untrusted HTML and math commands cannot introduce active content', () => {
  const html = renderMarkdown('<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n$\\href{javascript:alert(1)}{x}$');
  assert.doesNotMatch(html, /<script|href="javascript:/); assert.match(html, /&lt;script/);
});
test('invalid or unfinished formulas remain visible without throwing', () => {
  assert.doesNotThrow(() => renderMarkdown('$\\notacommand{x}$'));
  assert.match(renderMarkdown('Pending $x'), /Pending \$x/);
});


test('display delimiters embedded in prose render before Markdown removes backslashes', () => {
  const html=renderMarkdown(String.raw`令 \[x=p_{A1},\quad y=p_{B3}.\] 可行域为 \[1\le x\le3,\quad x+y\ge2.\] 成本为 \[J^\star=\frac92+\frac12\left(\frac52\right)^2.\]`);
  assert.equal((html.match(/class="katex-display"/g)||[]).length,3);
  assert.doesNotMatch(html,/katex-error/);
});
test('bracket math in code stays literal and incomplete delimiters remain recoverable',()=>{
  const code=renderMarkdown('`\\[x\\]`\n\n```text\n\\[y\\]\n```');
  assert.doesNotMatch(code,/class="katex"/);
  assert.doesNotThrow(()=>renderMarkdown(String.raw`等待 \[\frac{1}{`));
  assert.match(renderMarkdown(String.raw`结束 \[\frac{1}{2}\]。`),/class="katex"/);
  assert.doesNotMatch(renderMarkdown(String.raw`Literal \\[x\\] and [plain text]`),/class="katex"/);
});

test('blank lines inside a pipe table do not break rendering',()=>{
 const html=renderMarkdown('| 项目 | 第 1 小时 | 第 2 小时 |\n\n|---|---|---|\n\n| 电价 | 1 | 3 |\n\n| 功率 | 2 | 1 |');
 assert.match(html,/<table>/);assert.equal((html.match(/<tr>/g)||[]).length,3);
 const code=renderMarkdown('```text\n| a | b |\n\n|---|---|\n\n|1|2|\n```');assert.doesNotMatch(code,/<table>/);
});
