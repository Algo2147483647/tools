import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { numberEditorStep, Workshop } from '../src/workshop';
import { defaultVehicleConfig, getVehicleFields } from '../src/vehicle-config';
import { createFlightState, getDynamicsTelemetry, ZERO_INPUT } from '../src/physics';
import { FlightRecorder } from '../src/recorder';

describe('workshop physical-value editors',()=>{
  it.each(['drone','plane','space'] as const)('accepts every %s factory value without HTML number step mismatch',mode=>{
    const values=defaultVehicleConfig(mode);
    for(const field of getVehicleFields(mode)){
      const step=numberEditorStep(values[field.key],field.step,field.min);
      expect(step).not.toBe('any');
      const multiple=(values[field.key]-field.min)/Number(step);
      expect(Math.abs(multiple-Math.round(multiple)),field.key).toBeLessThan(1e-5);
    }
  });

  it('preserves fractional thrust and drag defaults rather than rounding the flight model',()=>{
    expect(numberEditorStep(5.886,.01,1)).toBe('0.001');
    expect(numberEditorStep(.132,.01,0)).toBe('0.001');
    expect(numberEditorStep(1.2,.05,.3)).toBe('0.05');
  });

  it('accepts imported values beyond ordinary editor precision',()=>{
    const value=.123456789123;
    expect(numberEditorStep(value,.01,0)).toBe('any');
  });
});

describe('external firmware analysis labels',()=>{
  it.each([false,true])('only presents controller target/error data when external control is %s',external=>{
    const state=createFlightState('drone',{position:new Vector3(0,10,0),quaternion:new Quaternion(),velocity:new Vector3(),throttle:.5});
    const telemetry=getDynamicsTelemetry(state);telemetry.externalControl=external;telemetry.targetRates=[30,0,0];telemetry.measuredRates=[1,0,0];
    const recorder=new FlightRecorder();recorder.begin('drone',{},null);recorder.record(state,ZERO_INPUT,telemetry);
    const record=recorder.recording!;
    const body={innerHTML:'',insertAdjacentHTML:(_position:string,html:string)=>{body.innerHTML+=html;}};
    const nodes:Record<string,unknown>={'analysis-body':body,'analysis-axis':{value:'0'}};
    const strokes:string[]=[];
    const context={strokeStyle:'',fillStyle:'',lineWidth:1,font:'',clearRect:()=>{},fillRect:()=>{},beginPath:()=>{},moveTo:()=>{},lineTo:()=>{},fillText:()=>{},stroke:()=>{strokes.push(context.strokeStyle);}};
    const canvas={width:1000,height:280,getContext:()=>context};
    // Exercise the renderer with a minimal DOM adapter; the real controller data comes from physics.
    const workshop=Object.create(Workshop.prototype) as Workshop;
    Object.assign(workshop,{api:{recording:()=>record},imported:null,element:{querySelector:()=>canvas},get:(id:string)=>nodes[id]??=( {})});
    const renderer=workshop as unknown as {renderAnalysis:()=>void;drawAnalysis:()=>void};
    renderer.renderAnalysis();renderer.drawAnalysis();
    expect(body.innerHTML.includes('RMS RATE ERROR')).toBe(!external);
    expect(body.innerHTML.includes('PEAK ERROR')).toBe(!external);
    expect(body.innerHTML.includes('firmware tracking error is unavailable')).toBe(external);
    expect(strokes.includes('#d8fb90')).toBe(!external);
    expect(strokes.includes('#76cce8')).toBe(true);
  });
});
