const { test } = require('node:test');
const assert = require('node:assert/strict');
const { renderMarkdown } = require('./markdown.cjs');
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
