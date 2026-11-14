const { executeMath } = require('./math-client.cjs');
const str=(maxLength=4096)=>({type:'string',maxLength});const num={type:'number'};
const list=(items,maxItems=40,minItems=1)=>({type:'array',items,maxItems,minItems});
const bounds=list(num,2,2);const choice=values=>({type:'string',enum:values});
const common={operation:str(30),expression:str(),variable:str(24),interval:bounds};
function definition(name,description,operations,properties,required,datasets,allowedDatasetIds) {
  return {name,version:'1.0.0',operations,timeoutMs:30000,description,
    parameters:{type:'object',properties:{...properties,operation:choice(operations)},required:['operation',...required],additionalProperties:false},
    async execute(args,{signal,progress}) {
      let dataset;
      const needsData=name==='analyze_data'||(name==='plot_math'&&args.operation!=='function');
      if(needsData){if(!args.datasetId||!allowedDatasetIds.includes(args.datasetId))throw Object.assign(Error('Dataset is not attached to this run.'),{code:'DATASET_REQUIRED'});const item=datasets.get(args.datasetId);dataset={columns:item.columns,rows:item.rows};}
      return executeMath({tool:name,arguments:args,dataset},signal,progress);
    }
  };
}
function mathDefinitions(datasets,allowedDatasetIds=[]) {
  const data={datasetId:str(80),columns:list(str(100)),missingPolicy:choice(['reject','drop'])};
  return [
    definition('symbolic_math','Symbolic algebra/calculus using SymPy. Explicit multiplication; powers use ^ or **. Operations: simplify, expand, factor, solve ONE variable equation, differentiate, integrate (optional finite interval), limit. Declare real/complex domain. Does not execute code.',['simplify','expand','factor','solve','differentiate','integrate','limit'],{...common,domain:choice(['real','complex']),order:{type:'integer',minimum:1,maximum:5},point:str(100),direction:choice(['+','-','+-'])},['expression'],datasets,allowedDatasetIds),
    definition('numeric_math','Floating-point numerical calculation. root requires a continuous function with a sign-changing interval; integrate uses finite bounds; minimize is bounded LOCAL minimization, not a global proof. linear_solve needs square matrix and vector; eigenvalues needs square matrix. Explicit multiplication.',['root','integrate','minimize','linear_solve','eigenvalues'],{...common,tolerance:{type:'number',minimum:1e-12,maximum:1e-2},matrix:list(list(num,50),50),vector:list(num,50)},[],datasets,allowedDatasetIds),
    definition('plot_math','Render a PNG chart directly in the answer. function: expression or expressions and interval. scatter/line/regression: attached datasetId, xColumn, yColumn. histogram: datasetId and xColumn. Missing/non-numeric rows require explicit missingPolicy=drop to exclude.',['function','scatter','line','histogram','regression'],{...common,...data,expressions:list(str(),5),xColumn:str(100),yColumn:str(100),title:str(160),samples:{type:'integer',minimum:50,maximum:2000},bins:{type:'integer',minimum:2,maximum:100}},[],datasets,allowedDatasetIds),
    definition('analyze_data','Analyze an ATTACHED CSV/TSV dataset. overview reports schema/missing values. describe/correlation take numeric columns; regression takes [predictor,response]; group_by takes groupColumn, numeric columns and aggregate. filter uses typed filters. Use missingPolicy=drop only when exclusion is appropriate and disclose it. Tables appear directly in answer.',['overview','describe','correlation','regression','group_by','filter'],{...data,groupColumn:str(100),aggregate:choice(['mean','sum','min','max','count']),filters:list({type:'object',properties:{column:str(100),operator:choice(['eq','ne','gt','ge','lt','le']),value:str(1000)},required:['column','operator','value'],additionalProperties:false},10)},['datasetId'],datasets,allowedDatasetIds)
  ];
}
module.exports={mathDefinitions};
