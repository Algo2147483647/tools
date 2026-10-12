import { Euler, MathUtils, Quaternion, Vector3 } from 'three';
import type { FlightInput, FlightMode, FlightState } from './types';

export interface Lesson {
  title: string;
  description: string;
  keyboard: string;
  gamepad: string;
}
const lessons: Record<FlightMode, Lesson[]> = {
  drone: [
    {title:'Lift off', description:'Climb to 6 m above the pad. Then ease the throttle toward 50%.',keyboard:'Hold W to increase throttle. Tap S to reduce it.',gamepad:'Push the throttle stick up. Return it to center to hold throttle.'},
    {title:'Find a steady hover', description:'Stay between 4 and 16 m, moving slower than 2 m/s, for 4 seconds.',keyboard:'Use W / S for height. Release the arrows to level out.',gamepad:'Make small throttle corrections. Release the attitude stick to level out.'},
    {title:'Look to the right', description:'Turn your heading to 090° (east) and hold it briefly.',keyboard:'Use D to yaw right. Keep the wings level.',gamepad:'Move the yaw stick right. Watch the compass reach 090°.'},
    {title:'Build a little speed', description:'Lean forward until your horizontal speed reaches 6 m/s.',keyboard:'Hold Up Arrow briefly. Add a little throttle to maintain height.',gamepad:'Push the attitude stick forward. Add a little throttle as you lean.'},
    {title:'Bring it to a stop', description:'Use the brake to stop below 1.2 m/s. Stay airborne for 2 seconds.',keyboard:'Hold Space to brake. Use W / S to stay above the ground.',gamepad:'Hold your Brake button. Keep throttle around hover power.'},
  ],
  plane: [
    {title:'Take the runway', description:'Increase power. Above 28 m/s, gently raise the nose and climb past 45 m for maneuvering room.',keyboard:'Hold W for power. At 28 m/s, use Down Arrow to rotate.',gamepad:'Increase throttle. At 28 m/s, gently pull the attitude stick back.'},
    {title:'Make a gentle right turn', description:'Bank right until the heading reaches 040°–090°. Keep airspeed above 28 m/s.',keyboard:'Hold Right Arrow gently. Release it as you approach the new heading.',gamepad:'Move the attitude stick right, then return it toward center.'},
    {title:'Settle into cruise', description:'Level the wings and hold vertical speed within ±2 m/s for 4 seconds.',keyboard:'Release the arrows. Adjust throttle with W / S.',gamepad:'Release the attitude stick. Make small throttle adjustments.'},
    {title:'Prepare an approach', description:'Reduce airspeed to 28–36 m/s and descend gently at 0.5–4 m/s for 3 seconds.',keyboard:'Reduce power with S. Use a small Up Arrow input to lower the nose.',gamepad:'Reduce throttle. Gently push the attitude stick forward.'},
  ],
  space: [
    {title:'Translate toward the station', description:'Move at least 20 m forward. Notice that moving and pointing are independent.',keyboard:'Hold W to move forward. Keep your orientation steady.',gamepad:'Squeeze the forward trigger. Keep the attitude stick centered.'},
    {title:'Stop your drift', description:'Brake below 0.5 m/s and hold for 2 seconds.',keyboard:'Release W, then hold Space to brake.',gamepad:'Release the trigger. Hold your Brake button to stop.'},
    {title:'Point, then realign', description:'Turn at least 25° away from the dock, then align within 10° again.',keyboard:'Use Left / Right Arrow to yaw. Follow the alignment indicator.',gamepad:'Use the attitude stick to turn away, then back toward the docking frame.'},
    {title:'Make a precise arrival', description:'Enter the docking frame below 1.4 m/s, aligned within 13°, and hold for 2 seconds.',keyboard:'Use W / S in short taps, A / D and X / Z to center. Brake early.',gamepad:'Use light trigger pressure, lateral/vertical stick corrections, and your Brake button.'},
  ],
};

/** A small skill-based lesson sequence. Time alone cannot complete an active maneuver. */
export class TrainingSession {
  step = 0;
  progress = 0;
  completed = false;
  private held = 0;
  private rotatedAway = false;
  private origin: Vector3;
  private moved = false;
  private initialHeading: number;
  private initialForward: Vector3;
  constructor(
    readonly mode: FlightMode,
    spawnPosition: Vector3,
    spawnQuaternion: Quaternion,
    private readonly dock: {position:Vector3;quaternion:Quaternion;radius:number},
    private readonly groundHeight: (x:number,z:number)=>number,
  ) {
    this.origin = spawnPosition.clone();
    this.initialHeading = this.heading(spawnQuaternion);
    this.initialForward = new Vector3(0,0,-1).applyQuaternion(spawnQuaternion);
  }
  get lesson(): Lesson {
    const lesson=lessons[this.mode][Math.min(this.step,this.count-1)];
    if(this.mode==='drone'&&this.step===2){
      const heading=`${Math.round(this.targetHeading).toString().padStart(3,'0')}°`;
      return {...lesson,description:`Turn your heading to ${heading} and hold it briefly.`,gamepad:`Move the yaw stick right. Watch the compass reach ${heading}.`};
    }
    return lesson;
  }
  get count(): number { return lessons[this.mode].length; }
  get targetHeading(): number { return (this.initialHeading + (this.mode==='drone'?90:60))%360; }
  private heading(q:Quaternion):number {
    const forward=new Vector3(0,0,-1).applyQuaternion(q);
    return (MathUtils.radToDeg(Math.atan2(forward.x,-forward.z))+360)%360;
  }
  update(state:FlightState,input:FlightInput,dt:number): boolean {
    if(this.completed||state.crashed||state.mode!==this.mode||dt<=0||!Number.isFinite(dt))return false;
    const height=state.position.y-this.groundHeight(state.position.x,state.position.z);
    const speed=state.velocity.length();
    const horizontal=Math.hypot(state.velocity.x,state.velocity.z);
    const heading=(this.heading(state.quaternion)-this.initialHeading+360)%360;
    const attitude=new Euler().setFromQuaternion(state.quaternion,'YXZ');
    let condition=false,hold=1;
    if(this.mode==='drone'){
      if(this.step===0){condition=height>=6&&height<30;hold=.5;this.progress=Math.min(1,height/6);}
      if(this.step===1){condition=height>=4&&height<=16&&speed<2;hold=4;}
      if(this.step===2){condition=heading>78&&heading<102&&height>2;hold=1;}
      if(this.step===3){condition=horizontal>=6&&height>2;hold=.35;this.progress=Math.min(1,horizontal/6);}
      if(this.step===4){condition=horizontal<1.2&&Math.abs(state.velocity.y)<2&&height>2&&input.brake;hold=2;}
    }else if(this.mode==='plane'){
      if(this.step===0){condition=height>45&&state.airspeed>28&&!state.grounded;hold=1;this.progress=Math.min(1,height/45);}
      if(this.step===1){condition=heading>=40&&heading<=90&&state.airspeed>28;hold=1;}
      if(this.step===2){condition=Math.abs(attitude.z)<MathUtils.degToRad(8)&&Math.abs(state.velocity.y)<2&&state.airspeed>28;hold=4;}
      if(this.step===3){condition=state.airspeed>=28&&state.airspeed<=36&&state.velocity.y<-.5&&state.velocity.y>-4&&height>10;hold=3;}
    }else{
      if(this.step===0){
        this.moved ||= input.moveZ>.1;
        const distance=state.position.clone().sub(this.origin).dot(this.initialForward);
        condition=this.moved&&distance>=20;hold=.2;this.progress=Math.min(1,Math.max(0,distance/20));
      }
      if(this.step===1){condition=speed<.5;hold=2;}
      if(this.step===2){
        const alignment=state.quaternion.angleTo(this.dock.quaternion);
        this.rotatedAway ||= alignment>MathUtils.degToRad(25);
        condition=this.rotatedAway&&alignment<MathUtils.degToRad(10);hold=1;
      }
      if(this.step===3){condition=state.position.distanceTo(this.dock.position)<this.dock.radius&&speed<1.4&&state.quaternion.angleTo(this.dock.quaternion)<.23;hold=2;}
    }
    this.held=condition?this.held+dt:0;
    if(!(this.mode==='drone'&&(this.step===0||this.step===3))&&!(this.mode==='plane'&&this.step===0)&&!(this.mode==='space'&&this.step===0))this.progress=Math.min(1,this.held/hold);
    if(this.held+1e-8<hold)return false;
    this.step++;this.held=0;this.progress=0;
    this.completed=this.step>=this.count;
    return true;
  }
}
