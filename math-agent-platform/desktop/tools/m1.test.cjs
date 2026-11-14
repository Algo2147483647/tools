const test=require('node:test'),assert=require('node:assert/strict');
const {ToolRegistry}=require('../build/backend/tools/registry.js');
const registry=new ToolRegistry();let id=0;
async function run(tool,operation,args){return registry.execute({schemaVersion:1,runId:'m1',callId:String(++id),tool,operation,arguments:args,limits:{timeoutMs:30000}},{signal:new AbortController().signal});}
test('LaTeX MathIR feeds symbolic calculation with original exclusions',async()=>{
 const parsed=await run('structure_math','parse',{expression:'\\frac{x^2-1}{x-1}',format:'latex'});
 assert.equal(parsed.status,'ok',JSON.stringify(parsed.error));assert.equal(parsed.result.ir.kind,'Divide');
 const result=await run('symbolic_math','simplify',{operation:'simplify',ir:parsed.result.ir});
 assert.equal(result.status,'ok',JSON.stringify(result.error));assert.equal(result.result.expression,'x + 1');assert.ok(result.result.domain.conditions.length);
});
test('exact rounding and LaTeX use full adapter instead of legacy evaluator',async()=>{
 const rounded=await run('exact_math','round',{operation:'round',expression:'-2.5',rounding:'half_away_from_zero'});
 assert.equal(rounded.status,'ok',JSON.stringify(rounded.error));assert.equal(rounded.result.value,'-3');
 const latex=await run('exact_math','evaluate',{expression:'\\frac{1}{3}',format:'latex'});
 assert.equal(latex.status,'ok',JSON.stringify(latex.error));assert.equal(latex.result.candidate.value,'1/3');
 const invalid=await run('exact_math','evaluate',{expression:'1',other:'2'});assert.equal(invalid.status,'error');
});
test('algebra and sets cross the generated wire contract',async()=>{
 const algebra=await run('algebra_math','minimal_polynomial',{operation:'minimal_polynomial',expression:'sqrt(2)'});
 assert.equal(algebra.status,'ok',JSON.stringify(algebra.error));assert.deepEqual(algebra.result.ir.polynomial,['1','0','-2']);
 const sets=await run('set_math','complement',{operation:'complement',set:{kind:'FiniteSet',elements:[{kind:'Integer',value:'1'}]},universe:{kind:'Universe',name:'Reals'}});
 assert.equal(sets.status,'ok',JSON.stringify(sets.error));assert.equal(sets.result.ir.kind,'Union');
});
test('schema alternatives reject mixed inputs and accept exact endpoint strings',async()=>{
 const bad=await run('symbolic_math','simplify',{operation:'simplify',expression:'1',ir:{kind:'Integer',value:'1'}});assert.equal(bad.error.code,'INVALID_ARGUMENT');
 const integral=await run('symbolic_math','integrate',{operation:'integrate',expression:'1',interval:['0','1/3']});
 assert.equal(integral.status,'ok',JSON.stringify(integral.error));assert.equal(integral.result.expression,'1/3');
});
