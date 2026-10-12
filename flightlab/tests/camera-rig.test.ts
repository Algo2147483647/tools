import { describe, expect, it } from 'vitest';
import { Euler, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { FlightCameraRig } from '../src/camera-rig';
import type { CameraSettings } from '../src/camera-rig';
import { createFlightState } from '../src/physics';

const settings: CameraSettings = {fov:78,cameraSmooth:.5,shake:0,dynamicFov:true,horizonLock:false};
const ground=()=>0;
const clear=()=>false;
const state=()=>createFlightState('drone',{
  position:new Vector3(0,20,0),quaternion:new Quaternion(),velocity:new Vector3(),throttle:.5,
});

describe('flight camera comfort and collision',()=>{
  it('keeps FPV attached and horizon lock removes roll without changing the viewing direction',()=>{
    const vessel=state();
    vessel.quaternion.setFromEuler(new Euler(.2,-.5,-.8,'YXZ'));
    const camera=new PerspectiveCamera(78,1,.1,1000);
    const rig=new FlightCameraRig(camera);
    rig.update(vessel,vessel.position,vessel.quaternion,'fpv',false,1/60,0,settings,ground,clear);
    expect(camera.quaternion.angleTo(vessel.quaternion)).toBeLessThan(1e-7);
    expect(camera.position.distanceTo(vessel.position.clone().add(new Vector3(0,.3,-.8).applyQuaternion(vessel.quaternion)))).toBeLessThan(1e-8);
    rig.reset();
    rig.update(vessel,vessel.position,vessel.quaternion,'fpv',false,1/60,0,{...settings,horizonLock:true},ground,clear);
    const actualForward=new Vector3(0,0,-1).applyQuaternion(camera.quaternion);
    expect(actualForward.distanceTo(new Vector3(0,0,-1).applyQuaternion(vessel.quaternion))).toBeLessThan(1e-8);
    expect(new Vector3(1,0,0).applyQuaternion(camera.quaternion).y).toBeCloseTo(0,8);
  });

  it('pulls the rendered chase camera ahead of a newly encountered thin wall immediately',()=>{
    const vessel=state();vessel.mode='plane';
    const camera=new PerspectiveCamera(78,1,.1,1000);
    const rig=new FlightCameraRig(camera);
    rig.update(vessel,vessel.position,vessel.quaternion,'chase',false,1/60,0,settings,ground,clear);
    expect(camera.position.z).toBe(29);
    const wall=(p:Vector3,radius:number)=>Math.abs(p.z-17.2)<radius+.005;
    rig.update(vessel,vessel.position,vessel.quaternion,'chase',false,1/60,0,{...settings,cameraSmooth:1},ground,wall);
    expect(camera.position.z).toBeLessThan(16.9);
    expect(wall(camera.position,.3)).toBe(false);
    expect(camera.position.z).toBeGreaterThan(15);
  });

  it('keeps the chase sightline from passing through intervening terrain',()=>{
    const vessel=state();vessel.position.y=2;
    const camera=new PerspectiveCamera(78,1,.1,1000);
    const rig=new FlightCameraRig(camera);
    const ridge=(_x:number,z:number)=>z>4&&z<6?10:0;
    rig.update(vessel,vessel.position,vessel.quaternion,'chase',false,1/60,0,settings,ridge,clear);
    expect(camera.position.z).toBeLessThanOrEqual(4);
    expect(camera.position.y).toBeGreaterThan(ridge(camera.position.x,camera.position.z));
  });

  it('bounds speed-driven FOV and returns to the requested comfort FOV',()=>{
    const vessel=state();vessel.velocity.z=-250;
    const camera=new PerspectiveCamera(78,1,.1,1000);
    const rig=new FlightCameraRig(camera);
    for(let i=0;i<300;i++)rig.update(vessel,vessel.position,vessel.quaternion,'chase',false,1/60,i/60,settings,ground,clear);
    expect(camera.fov).toBeCloseTo(86,5);
    for(let i=0;i<300;i++)rig.update(vessel,vessel.position,vessel.quaternion,'chase',false,1/60,i/60,{...settings,dynamicFov:false,fov:70},ground,clear);
    expect(camera.fov).toBeCloseTo(70,5);
  });

  it('snaps cleanly between views and does not accumulate procedural camera shake',()=>{
    const vessel=state();vessel.velocity.z=-30;
    const camera=new PerspectiveCamera(78,1,.1,1000);
    const rig=new FlightCameraRig(camera);
    rig.update(vessel,vessel.position,vessel.quaternion,'chase',true,1/60,1,settings,ground,clear);
    vessel.quaternion.setFromAxisAngle(new Vector3(0,1,0),1.2);
    rig.update(vessel,vessel.position,vessel.quaternion,'fpv',false,1/60,1,settings,ground,clear);
    expect(camera.quaternion.angleTo(vessel.quaternion)).toBeLessThan(1e-7);
    rig.update(vessel,vessel.position,vessel.quaternion,'fpv',false,1/60,1,{...settings,shake:1},ground,clear);
    const shaken=camera.quaternion.clone();
    for(let i=0;i<100;i++)rig.update(vessel,vessel.position,vessel.quaternion,'fpv',false,1/60,1,{...settings,shake:1},ground,clear);
    expect(camera.quaternion.angleTo(shaken)).toBeLessThan(1e-7);
  });
});
