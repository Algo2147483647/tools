import {readFile,writeFile} from 'node:fs/promises';
import {normalizeDagInput} from './src/graph/normalize.ts';
import {layoutFixture} from './src/test/compoundLayout.test.ts';
import {executeCompoundDecision} from './src/layout/compound/ai/execute.ts';
import {createLayoutResult} from './src/schema/layoutResult.ts';
import {inspectLayout} from './src/layout/compound/ai/observation.ts';
const dag=normalizeDagInput(JSON.parse(await readFile('public/examples/commerce/commerce.json','utf8'))),stage=await layoutFixture(dag),problem=stage.compoundLayout;
const rows={root:[['experience','commerce','partners'],[null,'platform',null]],commerce:[['checkout','fulfillment'],['aftersales','payments']],experience:[['web','gateway'],['mobile',null]],checkout:[['cart','pricing','orders'],[null,'order-db',null]],aftersales:[['return-case','inspection'],['case-db',null]],payments:[['risk','settlement']],fulfillment:[['warehouse','delivery']],platform:[['messaging','observability']],partners:[['carrier'],['bank']],messaging:[['events','notifications','email']],observability:[['audit','synthetic-monitor'],['metrics',null]],risk:[['risk-rules','fraud']],settlement:[['authorize','capture'],['refund','payment-ledger']],warehouse:[['reserve','pick','pack'],['stock-db',null,null],['restock',null,null]],delivery:[['shipment','dispatch'],['tracking',null]]};
const design={purpose:'Commerce interfaces',readingPath:['gateway','orders'],regions:[],connections:[],scopes:Object.entries(rows).map(([id,rows])=>({groupId:id==='root'?null:id,direction:'RIGHT',rows,reason:'Composition'}))};
const begin=Date.now(),r=executeCompoundDecision({problem,baseLayout:createLayoutResult(stage,'compound'),decision:{action:'compose',design}});
console.log(JSON.stringify({elapsed:Date.now()-begin,error:r.error,issues:r.issues,routing:r.routingIssues?.map(i=>({kind:i.kind,e:i.edgeIds,reason:i.evidence}))}));
if(!r.error){const o=inspectLayout(problem,r.layout,design,null,[],false,{executionIssues:r.routingIssues});console.log(JSON.stringify({metrics:o.metrics,issues:o.issueCounts}));await writeFile('test-results/routing-preview.json',JSON.stringify({layout:r.layout,items:problem.projection.items,minimumSizes:problem.minimumSizes}));}
