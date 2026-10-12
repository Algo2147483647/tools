import { Euler, MathUtils, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { CameraMode, FlightState } from './types';

export interface CameraSettings { fov:number; cameraSmooth:number; shake:number; dynamicFov:boolean; horizonLock:boolean; }
export class FlightCameraRig {
  private initialized=false;
  private lastView:CameraMode='chase';
  private lastPreview=false;
  private forward=new Vector3();
  private desired=new Vector3();
  private look=new Vector3();
  private baseQuaternion=new Quaternion();
  private renderedQuaternion=new Quaternion();
  private sample=new Vector3();
  private offset=new Vector3();
  private safePoint=new Vector3();
  constructor(readonly camera:PerspectiveCamera){}
  reset(){this.initialized=false;}
  update(state:FlightState,position:Vector3,quaternion:Quaternion,view:CameraMode,preview:boolean,dt:number,time:number,settings:CameraSettings,
    ground:(x:number,z:number)=>number,collides:(point:Vector3,radius:number)=>boolean){
    const speed=state.velocity.length();
    const fov=settings.fov+(settings.dynamicFov&&!preview?Math.min(8,speed*.085):0);
    this.camera.fov=MathUtils.lerp(this.camera.fov,fov,1-Math.exp(-dt*5));this.camera.updateProjectionMatrix();
    this.forward.set(0,0,-1).applyQuaternion(quaternion);
    const snap=!this.initialized||this.lastView!==view||this.lastPreview!==preview;
    const response=settings.cameraSmooth<=.01?1000:MathUtils.lerp(20,3,settings.cameraSmooth);
    if(!preview&&view==='fpv'){
      this.offset.set(0,state.mode==='plane'?1.1:.3,-.8).applyQuaternion(quaternion);
      this.camera.position.copy(position).add(this.offset);
      this.baseQuaternion.copy(quaternion);
      if(settings.horizonLock){
        this.camera.up.set(0,1,0);this.look.copy(this.camera.position).add(this.forward);this.camera.lookAt(this.look);this.baseQuaternion.copy(this.camera.quaternion);
      }
      if(snap)this.renderedQuaternion.copy(this.baseQuaternion);
      else this.renderedQuaternion.slerp(this.baseQuaternion,1-Math.exp(-dt*(20+response)));
      this.camera.quaternion.copy(this.renderedQuaternion);
    }else{
      const distance=state.mode==='drone'?10:state.mode==='plane'?29:22;
      this.offset.copy(preview?new Vector3(12+Math.sin(time*.07)*5,state.mode==='drone'?9:17,state.mode==='drone'?26:45):new Vector3(0,state.mode==='drone'?3.3:8,distance));
      this.desired.copy(position).add(this.offset.applyQuaternion(quaternion));
      if(state.mode!=='space')this.desired.y=Math.max(this.desired.y,ground(this.desired.x,this.desired.z)+1.2);
      if(!preview){
        // Pull the camera in when a wall falls between the aircraft and its chase view.
        this.constrain(position,this.desired,state.mode==='space',ground,collides);
      }
      if(snap||this.camera.position.distanceTo(this.desired)>500)this.camera.position.copy(this.desired);
      else this.camera.position.lerp(this.desired,1-Math.exp(-dt*(preview?1.5:response)));
      // Smoothing can leave the actual camera beyond a newly encountered wall.
      // Sweep the final position too, with spacing below the collision sphere diameter.
      if(!preview)this.constrain(position,this.camera.position,state.mode==='space',ground,collides);
      this.look.copy(position).addScaledVector(this.forward,preview?55:state.mode==='drone'?12:40);
      this.camera.up.set(0,1,0);if(state.mode==='space'&&!preview)this.camera.up.applyQuaternion(quaternion);
      this.camera.lookAt(this.look);
    }
    if(!preview&&settings.shake>0){
      const amount=settings.shake*(Math.min(state.angularVelocity.length()*.3,.6)+(state.grounded?0:state.stall*.8)+Math.min(speed/100,.25));
      this.camera.quaternion.multiply(new Quaternion().setFromEuler(new Euler(Math.sin(time*29)*amount*.006,Math.sin(time*37)*amount*.003,Math.sin(time*21)*amount*.003)));
    }
    this.initialized=true;this.lastView=view;this.lastPreview=preview;
  }

  private constrain(origin:Vector3,destination:Vector3,space:boolean,ground:(x:number,z:number)=>number,collides:(point:Vector3,radius:number)=>boolean):void {
    const distance=origin.distanceTo(destination);
    const samples=Math.max(1,Math.ceil(distance/.3));
    this.safePoint.copy(origin);
    for(let i=1;i<=samples;i++){
      this.sample.lerpVectors(origin,destination,i/samples);
      if(collides(this.sample,.3)||(!space&&this.sample.y<ground(this.sample.x,this.sample.z)+.3)){
        destination.copy(this.safePoint);return;
      }
      this.safePoint.copy(this.sample);
    }
  }
}
