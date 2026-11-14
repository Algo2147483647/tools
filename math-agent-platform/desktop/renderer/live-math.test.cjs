const test=require('node:test');const assert=require('node:assert/strict');
const {formulas}=require('../build/backend/renderer/live-math.js');
test('live math finds inline, multiline display and LaTeX delimiters',()=>{
 const source='$x+1$\n$$\n\\frac{1}{2}\n$$\n\\(a+b\\) \\[x^2\\]';const found=formulas(source);
 assert.equal(found.length,4);assert.deepEqual(found.map(x=>x.display),[false,true,false,true]);
 assert.equal(source.slice(found[0].from,found[0].to),'$x+1$');
});
test('code, escaped dollars and unfinished formulas remain literal',()=>{
 assert.equal(formulas('`$x$`\n```js\n$x$\n```\n\\$x$\n$incomplete').length,0);
 assert.equal(formulas('~~~\n$x$\n~~~\n$y$')[0].tex,'y');
});

test('bold decorations preserve source positions and exclude code',()=>{
 const {boldRanges}=require('../build/backend/renderer/live-math.js');
 const text='**求解以下问题：**\n**带空格： **\n`**code**`\n```\n**literal**\n```';
 const ranges=boldRanges(text);assert.equal(ranges.length,2);assert.equal(text.slice(ranges[0].from,ranges[0].to),'**求解以下问题：**');
});

test('editor tables include blank-separated rows but exclude fenced code',()=>{
 const {tableRanges}=require('../build/backend/renderer/live-math.js');const table='| 项目 | 时段 |\n\n|---|---|\n\n|功率|3|';
 assert.equal(tableRanges(table).length,1);assert.equal(tableRanges(table)[0].source,table);assert.equal(tableRanges('```\n'+table+'\n```').length,0);
});
