import { SimulationRunner,type SimulationInit,type StepCommand } from './simulation';
let runner:SimulationRunner|null=null;let generation=0;
self.addEventListener('message',(event:MessageEvent<{type:'init';generation:number;value:SimulationInit}|{type:'step';generation:number;value:StepCommand}>)=>{
  try{
    const message=event.data;
    if(message.type==='init'){generation=message.generation;runner=new SimulationRunner(message.value);self.postMessage({type:'ready',generation});}
    else if(runner&&generation===message.generation)self.postMessage({type:'frame',generation,packet:runner.advance(message.value)});
  }catch(error){self.postMessage({type:'error',generation,error:error instanceof Error?error.message:'Simulation failed.'});}
});
