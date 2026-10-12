import { SimulationRunner,type SimulationInit,type StepCommand,type SimulationPacket } from './simulation';

/** One queued batch at a time. A restarted flight cannot receive an old result. */
export class SimulationClient {
  private worker:Worker|null=null;private fallback:SimulationRunner|null=null;
  private workerFailed=false;
  private generation=0;private pending=false;private ready=false;
  private mode:StepCommand['controlMode'];private arm:boolean|undefined;private motors:number[]|null|undefined;
  private handling:SimulationInit['handling']|undefined;
  backend='Worker · 240 Hz';
  constructor(private onFrame:(packet:SimulationPacket)=>void,private onError:(message:string)=>void){
    this.createWorker();
  }
  private createWorker():void {
    this.workerFailed=false;
    try{
      const worker=new Worker(new URL('./simulation.worker.ts',import.meta.url),{type:'module'});this.worker=worker;this.backend='Worker · 240 Hz';
      worker.onmessage=event=>{if(this.worker!==worker)return;const message=event.data;if(message.generation!==this.generation)return;if(message.type==='ready')this.ready=true;else if(message.type==='frame'){this.pending=false;this.onFrame(message.packet);}else if(message.type==='error'){this.ready=false;this.pending=false;this.onError(message.error);}};
      worker.onerror=()=>{if(this.worker!==worker)return;this.ready=false;this.pending=false;this.worker=null;this.workerFailed=true;worker.terminate();this.onError('The physics worker stopped. Restart this flight to retry.');};
    }catch{this.worker=null;this.backend='Main thread · 240 Hz';}
  }
  initialize(init:SimulationInit):void {this.generation++;this.pending=false;this.ready=false;this.mode=undefined;this.arm=undefined;this.motors=undefined;this.handling=undefined;if(this.workerFailed)this.createWorker();if(this.worker){this.fallback=null;this.worker.postMessage({type:'init',generation:this.generation,value:init});}else{this.fallback=new SimulationRunner(init);this.ready=true;}}
  setControlMode(mode:NonNullable<StepCommand['controlMode']>){this.mode=mode;}
  setArmed(armed:boolean){this.arm=armed;}
  setMotors(motors:number[]|null){this.motors=motors;}
  setHandling(handling:SimulationInit['handling']){this.handling=handling;}
  get busy(){return this.pending||!this.ready;}
  advance(command:StepCommand):boolean {
    if(this.busy)return false;
    const value={...command,controlMode:this.mode??command.controlMode,armed:this.arm??command.armed,
      motors:this.motors===undefined?command.motors:this.motors,handling:this.handling??command.handling};
    this.mode=undefined;this.arm=undefined;this.motors=undefined;this.handling=undefined;
    if(this.worker){this.pending=true;this.worker.postMessage({type:'step',generation:this.generation,value});}
    else if(this.fallback)this.onFrame(this.fallback.advance(value));return true;
  }
  invalidate(){this.generation++;this.ready=false;this.pending=false;}
  dispose(){this.invalidate();const worker=this.worker;this.worker=null;this.fallback=null;worker?.terminate();}
}
