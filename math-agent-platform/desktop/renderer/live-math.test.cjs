const test=require('node:test');const assert=require('node:assert/strict');
const {formulas}=require('./live-math.cjs');
test('live math finds inline, multiline display and LaTeX delimiters',()=>{
 const source='$x+1$\n$$\n\\frac{1}{2}\n$$\n\\(a+b\\) \\[x^2\\]';const found=formulas(source);
 assert.equal(found.length,4);assert.deepEqual(found.map(x=>x.display),[false,true,false,true]);
 assert.equal(source.slice(found[0].from,found[0].to),'$x+1$');
});
test('code, escaped dollars and unfinished formulas remain literal',()=>{
 assert.equal(formulas('`$x$`\n```js\n$x$\n```\n\\$x$\n$incomplete').length,0);
 assert.equal(formulas('~~~\n$x$\n~~~\n$y$')[0].tex,'y');
});
