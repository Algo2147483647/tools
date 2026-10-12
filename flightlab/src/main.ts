import './style.css';
import * as THREE from 'three';
import { FlightWorld } from './world';
import { createFlightState, stepFlight, getTelemetry, setHandlingPreset } from './physics';
import { FlightInputManager, BUTTON_LABELS } from './input';
import type { ButtonAction, MenuAction } from './input';
import { navigateMenu } from './menu-controls';
import { TrainingSession } from './training';
import { FlightCameraRig } from './camera-rig';
import { getDockingGuidance } from './navigation';
import { FlightAudio } from './audio';
import { crossedGate, formatTime, loadRecord, saveRecord } from './challenges';
import type { FlightRecord, GhostFrame } from './challenges';
import type { FlightMode, CameraMode, Weather, InputSettings, InputAction } from './types';

const icons = {
  drone: '<svg viewBox="0 0 50 32" fill="none" stroke="currentColor" stroke-width="1.4"><path d="m12 7 26 18M12 25 38 7"/><rect x="20" y="11" width="10" height="10" rx="3"/><ellipse cx="11" cy="7" rx="8" ry="4"/><ellipse cx="39" cy="7" rx="8" ry="4"/><ellipse cx="11" cy="25" rx="8" ry="4"/><ellipse cx="39" cy="25" rx="8" ry="4"/></svg>',
  plane: '<svg viewBox="0 0 50 32" fill="none" stroke="currentColor" stroke-width="1.4"><path d="m25 2 3 12 18 8v3l-18-3v5l5 3H17l5-3v-5L4 25v-3l18-8Z"/></svg>',
  space: '<svg viewBox="0 0 50 32" fill="none" stroke="currentColor" stroke-width="1.4"><path d="m25 2 8 16 13 9-17-4-4 6-4-6-17 4 13-9Z"/><path d="m21 12 4-5 4 5m-8 17-1 3m9-3 1 3"/></svg>',
  controller: '<svg viewBox="0 0 24 20" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M7 4h10c4 0 6 12 3 13-2 1-4-4-5-4H9c-1 0-3 5-5 4C1 16 3 4 7 4Z"/><path d="M6 8h5M8.5 5.5v5M16 8h.1M18 10h.1"/></svg>',
};
const descriptions: Record<FlightMode, {name:string;region:string;coordinates:string;copy:string;hint:string}> = {
  drone: {name:'FPV Drone',region:'The coast is yours.',coordinates:'SECTOR 01 / COASTAL FLIGHT PARK',copy:'Salt air. Golden light. One perfect line.<br>Find your way through the harbor.',hint:'<b>W / S</b> adjust throttle · <b>Arrow keys</b> tilt to move.<br>Start near 50% throttle to hover. Lean forward to accelerate.'},
  plane: {name:'Fixed Wing',region:'Follow the horizon.',coordinates:'SECTOR 02 / HIGHLAND AIRFIELD',copy:'Trace the ridgeline. Bank over the bay.<br>Let the landscape guide you home.',hint:'<b>↑ / ↓</b> pitch · <b>← / →</b> bank · <b>W / S</b> throttle.<br>Keep airspeed above stall. Bank gently to turn.'},
  space: {name:'Spacecraft',region:'A different kind of freedom.',coordinates:'SECTOR 03 / ORBITAL SHIPYARD',copy:'Six degrees of freedom. An ocean of silence.<br>Every small correction takes you closer.',hint:'<b>W / S</b> forward / back · <b>A / D</b> strafe · <b>X / Z</b> up / down.<br>Arrows aim · <b>Q / E</b> roll · <b>Space</b> brake.'},
};
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <canvas class="scene" id="scene" aria-label="Interactive 3D flight environment"></canvas>
  <div class="vignette"></div>
  <header class="topbar">
    <div class="brand"><svg viewBox="0 0 32 32" fill="none"><path d="m4 26 12-21 12 21-12-6Z" stroke="#d8fb90" stroke-width="1.5"/><path d="M16 5v15" stroke="#d8fb90" stroke-width="1.5"/></svg>flight<em>lab</em></div>
    <div class="top-right"><span class="eyebrow" id="top-label">A FLIGHT PLAYGROUND</span><span class="live"><i class="dot"></i><span id="device-label">Keyboard ready</span></span><button class="icon-button" id="settings-button" title="Flight settings" aria-label="Open flight settings">⚙</button></div>
  </header>
  <main class="menu" id="menu">
    <div class="hero"><div class="eyebrow">LEAVE THE ORDINARY BEHIND</div><h1>Find your<br><span>flow.</span></h1><p>From the coastline to the cosmos.<br>Three ways to fly. A world to get lost in.</p><div class="hero-meta"><span>${icons.controller} GAMEPAD READY</span><span>↗ &nbsp; BUILT FOR EXPLORATION</span></div></div>
    <div class="world-tag"><div class="coordinate" id="region-code"></div><h2 id="region-title"></h2><div class="rule"></div><p id="region-copy"></p></div>
    <div class="menu-bottom"><div class="mode-label"><span class="eyebrow">01 — CHOOSE YOUR FLIGHT</span><span>Different physics. Same sense of freedom.</span></div>
      <div class="launch-layout"><div class="mode-list" role="group" aria-label="Flight mode">
        <button class="mode-card selected" data-mode="drone" aria-pressed="true"><div class="card-top">${icons.drone}<span class="number">01</span></div><h3>FPV Drone</h3><p>Close to the ground. In the moment.</p><div class="mode-badge">AGILE / ATMOSPHERIC</div></button>
        <button class="mode-card" data-mode="plane" aria-pressed="false"><div class="card-top">${icons.plane}<span class="number">02</span></div><h3>Fixed Wing</h3><p>Chase the horizon.</p><div class="mode-badge">LIFT / ATMOSPHERIC</div></button>
        <button class="mode-card" data-mode="space" aria-pressed="false"><div class="card-top">${icons.space}<span class="number">03</span></div><h3>Spacecraft</h3><p>Make room for the unknown.</p><div class="mode-badge">6 DOF / ORBITAL</div></button>
      </div><div class="launch-panel"><label for="activity">YOUR NEXT ADVENTURE</label><select id="activity" aria-label="Flight activity"><option value="free">Free exploration</option><option value="race">Gate run · Time trial</option></select><button class="primary" id="launch">Let's fly <span>↗</span></button><small>No downloads. Just you and the sky.</small></div></div>
      <div class="menu-footer"><span>FLIGHTLAB / EXPERIMENTAL FLIGHT SERIES</span><button class="text-button" id="controls-button">Flight controls &nbsp; ↗</button></div>
    </div>
  </main>
  <section class="hud" id="hud" aria-label="Flight instruments" hidden>
    <div class="flight-heading"><h2 id="flight-name">FPV Drone</h2><span class="pill" id="assist-label">ANGLE</span></div>
    <div class="compass"><div class="compass-rule"><span>W</span><span>·</span><span>N</span><span>·</span><span>E</span></div><div class="heading-value" id="heading">000°</div></div>
    <div class="reticle"><i></i></div><div class="flight-director" id="velocity-marker" hidden></div><div class="target-marker" id="target-marker" hidden><span id="target-distance"></span></div>
    <div class="mission"><div class="eyebrow" id="mission-label">FREE EXPLORATION</div><strong id="mission-time">00:00.00</strong><p id="mission-detail">Make your own flight path.</p><div class="mission-progress" id="mission-progress" hidden><i id="progress-bar"></i></div></div>
    <div class="warning" id="warning" hidden></div>
    <div class="hint" id="flight-hint"></div>
    <div class="telemetry"><div class="throttle" title="Throttle"><i id="throttle-bar"></i></div><div class="telemetry-item"><div class="eyebrow" id="speed-label">AIRSPEED</div><strong id="speed">0</strong><small>M/S</small></div><div class="telemetry-item"><div class="eyebrow" id="altitude-label">ALTITUDE</div><strong id="altitude">9</strong><small>M</small></div><div class="telemetry-item secondary"><div class="eyebrow">VERTICAL</div><strong id="vertical">0.0</strong><small>M/S</small></div><div class="telemetry-item secondary"><div class="eyebrow" id="fourth-label">THROTTLE</div><strong id="throttle">50</strong><small id="fourth-unit">%</small></div></div>
    <canvas id="minimap" class="minimap" width="304" height="304" aria-label="Navigation map showing the route and next gate"></canvas><span class="minimap-label">LOCAL NAVIGATION</span>
    <footer class="hud-bottom"><div class="commands"><button data-action="pause"><span class="key">ESC</span>Pause</button><button data-action="camera"><span class="key">C</span>Camera</button><button data-action="assist"><span class="key">F</span>Assist</button><button data-action="reset"><span class="key">R</span>Restart</button><button id="hud-controls"><span class="key">?</span>Controls</button></div><span id="flight-status">CHASE CAM · WIND CALM</span></footer>
  </section>
  <div class="toast" id="toast" role="status"></div>
  <div class="modal-backdrop" id="pause-modal" hidden><section class="modal" role="dialog" aria-modal="true" aria-labelledby="pause-title"><div class="eyebrow" id="pause-eyebrow">TAKE A BREATH</div><h2 id="pause-title">Flight paused.</h2><p id="pause-copy">Your next great line is waiting.</p><div class="result-grid" id="result-grid" hidden><div><span class="eyebrow">FLIGHT TIME</span><strong id="result-time"></strong></div><div><span class="eyebrow">PERSONAL BEST</span><strong id="result-best"></strong></div></div><button class="primary" id="resume">Resume flight <span>↗</span></button><button class="secondary-button" id="restart">Restart flight</button><button class="return-link" id="return-menu">Return to flight selection</button></section></div>
  <div class="modal-backdrop" id="settings-modal" hidden><section class="modal wide" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div class="modal-top"><div><div class="eyebrow">MAKE IT YOURS</div><h2 id="settings-title">Flight settings</h2></div><button class="icon-button" id="close-settings" aria-label="Close settings">×</button></div>
    <div class="settings-grid"><div class="setting"><label for="deadzone">Stick deadzone <span id="deadzone-value"></span></label><input id="deadzone" type="range" min="0.02" max="0.3" step="0.01" /></div><div class="setting"><label for="sensitivity">Sensitivity <span id="sensitivity-value"></span></label><input id="sensitivity" type="range" min="0.4" max="1.6" step="0.05" /></div><div class="setting"><label for="expo">Response curve <span id="expo-value"></span></label><input id="expo" type="range" min="0" max="0.85" step="0.05" /></div><div class="setting"><label for="volume">Audio volume <span id="volume-value"></span></label><input id="volume" type="range" min="0" max="1" step="0.05" /></div><div class="setting"><label for="weather">Atmosphere</label><select id="weather"><option value="dusk">Golden hour · Calm</option><option value="clear">Daylight · Calm</option><option value="windy">Coastal breeze · 5 m/s</option></select></div><div class="setting"><label for="quality">Render quality</label><select id="quality"><option value="balanced">Balanced</option><option value="high">High</option><option value="low">Performance</option></select></div><div class="setting check"><input type="checkbox" id="invertPitch"/><label for="invertPitch">Invert pitch</label></div><div class="setting check"><input type="checkbox" id="vibration"/><label for="vibration">Controller vibration</label></div><div class="setting check"><input type="checkbox" id="sound"/><label for="sound">Flight audio</label></div><div class="setting check"><input type="checkbox" id="showGhost"/><label for="showGhost">Personal best ghost</label></div></div>
    <div class="divider"></div><div class="controller-state"><span id="controller-name">Connect a controller and press any button.</span><button id="calibrate">Calibrate sticks</button></div><div class="axes">${[0,1,2,3].map(i=>`<div class="axis"><i id="axis-${i}"></i></div>`).join('')}</div><p class="controller-note">Release both sticks before calibrating. Standard Xbox-style mappings are supported. Some controllers need a button press before your browser detects them. Settings stay on this device.</p>
  </section></div>
  <div class="modal-backdrop" id="controls-modal" hidden><section class="modal wide" role="dialog" aria-modal="true" aria-labelledby="controls-title"><div class="modal-top"><div><div class="eyebrow">YOUR FLIGHT MANUAL</div><h2 id="controls-title">Take control.</h2></div><button class="icon-button" id="close-controls" aria-label="Close controls">×</button></div><table class="controls-table"><thead><tr><th>ACTION</th><th>KEYBOARD</th><th>GAMEPAD</th></tr></thead><tbody id="controls-body"></tbody></table><p id="controls-note"></p><p>Camera: C / X · Assist: F / B · Restart: R / Y · Pause: Esc / Start<br>Space brakes · Shift / Left stick click boosts (spacecraft).</p><button class="primary" id="controls-done">Ready to fly <span>↗</span></button></section></div>
`;

el('menu').querySelector('.menu-footer')!.insertAdjacentHTML('afterbegin','<button class="text-button training-link" id="training-button">↗ Start flight school <span id="training-badge">~3 MIN / GUIDED</span></button>');
el('menu').querySelector('.launch-panel small')!.textContent='D-pad to navigate · A select · B back';
el('settings-modal').querySelector('.settings-grid')!.insertAdjacentHTML('afterbegin',`<div class="setting"><label for="handling">Handling preset</label><select id="handling"><option value="gentle">Gentle · Learn the controls</option><option value="balanced">Balanced · Find your flow</option><option value="sport">Sport · Fast response</option></select></div><div class="setting"><label for="stick-layout">Stick layout</label><select id="stick-layout"><option value="standard">Standard · Right stick attitude</option><option value="southpaw">Southpaw · Left stick attitude</option></select></div>`);
el('settings-modal').querySelector('.divider')!.insertAdjacentHTML('beforebegin',`
  <div class="divider"></div><p class="settings-section-label">CAMERA & COMFORT</p>
  <div class="settings-grid"><div class="setting"><label for="fov">Field of view <span id="fov-value"></span></label><input id="fov" type="range" min="60" max="105" step="1"/></div><div class="setting"><label for="cameraSmooth">Camera smoothing <span id="cameraSmooth-value"></span></label><input id="cameraSmooth" type="range" min="0" max="1" step="0.05"/></div><div class="setting"><label for="shake">Camera vibration <span id="shake-value"></span></label><input id="shake" type="range" min="0" max="1" step="0.05"/></div><div class="setting check"><input id="dynamicFov" type="checkbox"/><label for="dynamicFov">Expand view with speed</label></div><div class="setting check"><input id="horizonLock" type="checkbox"/><label for="horizonLock">Stabilize FPV horizon</label></div><button class="comfort-button" id="comfort-preset">Apply comfort camera</button></div>
  <div class="divider"></div><p class="settings-section-label">CONTROLLER BUTTONS <span>Conflicts swap automatically</span></p><div class="bindings-grid" id="bindings-grid"></div><button class="text-button" id="reset-bindings">Restore default buttons</button>
`);
el('calibrate').textContent='Set stick center';
el('settings-modal').querySelector('.axes')!.insertAdjacentHTML('afterend','<div class="calibration-actions"><button id="calibrate-range">Calibrate full travel</button><button id="reset-calibration">Reset calibration</button></div><p id="calibration-status" class="controller-note" role="status">1. Release the sticks and set center. 2. Calibrate full travel by moving both sticks in full circles.</p>');
el('hud').insertAdjacentHTML('beforeend',`
  <div class="lesson-card" id="lesson-card" hidden><div class="eyebrow" id="lesson-step">FLIGHT SCHOOL / 01</div><h3 id="lesson-title"></h3><p id="lesson-description"></p><div class="lesson-control" id="lesson-control"></div><div class="lesson-progress"><i id="lesson-progress"></i></div><small id="lesson-progress-label"></small></div>
  <div class="attitude-display" id="attitude-display"><div class="attitude-window"><div class="attitude-ladder" id="attitude-ladder"><span>+10</span><i></i><span>−10</span></div><b>⌃</b></div><div class="attitude-readout" id="attitude-readout">P 0° · R 0°</div></div>
  <div class="dock-guidance" id="dock-guidance" hidden><div class="eyebrow">DOCKING GUIDANCE</div><div class="dock-cross"><i></i><b></b><span id="dock-offset"></span></div><strong id="approach-status">APPROACH</strong><div class="dock-values"><span>CLOSING <b id="closing-speed">0.0</b> m/s</span><span>DRIFT <b id="lateral-speed">0.0</b> m/s</span><span>ALIGN <b id="alignment-error">0</b>°</span></div><p id="dock-instruction">Center the diamond. Brake before the frame.</p></div>
  <div class="wind-indicator" id="wind-indicator"><span id="wind-arrow">↑</span><span id="wind-text">CALM AIR</span></div><div class="proximity-cue" id="proximity-cue"></div><div class="cockpit-frame" id="cockpit-frame" hidden></div><div class="offscreen-target" id="offscreen-target" hidden><span id="offscreen-arrow">↑</span><small id="offscreen-label"></small></div>
`);

function el<T extends HTMLElement = HTMLElement>(id: string): T { return document.getElementById(id) as T; }
interface Settings extends InputSettings { volume:number; sound:boolean; weather:Weather; quality:'balanced'|'high'|'low'; showGhost:boolean; handling:'gentle'|'balanced'|'sport';fov:number;cameraSmooth:number;shake:number;dynamicFov:boolean;horizonLock:boolean; }
const defaults: Settings = {deadzone:.09,sensitivity:1,expo:.3,invertPitch:false,vibration:true,volume:.3,sound:true,weather:'dusk',quality:'balanced',showGhost:true,handling:'balanced',fov:78,cameraSmooth:.45,shake:.15,dynamicFov:true,horizonLock:false};
function readSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem('flightlab.settings.v1') || '{}');
    const result = {...defaults};
    for (const key of ['deadzone','sensitivity','expo','volume'] as const) if (typeof saved[key] === 'number' && Number.isFinite(saved[key])) result[key] = Math.max(key==='sensitivity'?.4:0,Math.min(key==='sensitivity'?1.6:key==='deadzone'?.3:1,saved[key]));
    for (const key of ['fov','cameraSmooth','shake'] as const) if(typeof saved[key]==='number'&&Number.isFinite(saved[key]))result[key]=THREE.MathUtils.clamp(saved[key],key==='fov'?60:0,key==='fov'?105:1);
    for (const key of ['invertPitch','vibration','sound','showGhost','dynamicFov','horizonLock'] as const) if (typeof saved[key] === 'boolean') result[key] = saved[key];
    if(['gentle','balanced','sport'].includes(saved.handling))result.handling=saved.handling;
    if (['clear','windy','dusk'].includes(saved.weather)) result.weather=saved.weather;
    if (['balanced','high','low'].includes(saved.quality)) result.quality=saved.quality;
    return result;
  } catch { return {...defaults}; }
}
const settings = readSettings();
let mode:FlightMode = 'drone';
let cameraMode:CameraMode = 'chase';
let activity = 'free';
let phase:'menu'|'flying'|'paused'|'crashed'|'complete' = 'menu';
let modalWasFlying = false;
let toastUntil = 0;
let gateIndex = 0;
let dockingHold = 0;
let ghostFrames:GhostFrame[] = [];
let best:FlightRecord|null = null;
let ghostCursor = 0;
let lastRecordTime = -1;
let training:TrainingSession|null=null;
let previousGrounded=false;
let proximityDistance=80;
let lastController='';
const audio = new FlightAudio();
const input = new FlightInputManager(settings, handleAction, () => { if (phase==='flying') {pause(); toast('Controller disconnected. Flight paused.');} });
const wind = new THREE.Vector3();
let renderer:THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({canvas:el<HTMLCanvasElement>('scene'),antialias:true,powerPreference:'high-performance'});
} catch {
  app.innerHTML='<div class="error-screen"><article><div class="eyebrow">FLIGHTLAB</div><h1>Your browser needs WebGL 2.</h1><p>Enable hardware acceleration in Chrome or Edge, then reload this page. FlightLab needs a graphics-enabled browser to render its flight environments.</p><button class="primary" onclick="location.reload()">Try again ↗</button></article></div>';
  throw new Error('WebGL 2 is required to run FlightLab.');
}
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.12;
renderer.shadowMap.enabled=false;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const world=new FlightWorld(mode);
let state=createFlightState(mode,world.spawn(mode));
const environment={wind,groundHeight:(x:number,z:number)=>world.groundHeight(x,z),collides:(p:THREE.Vector3,r:number)=>world.collides(p,r)};
const camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.1,20000);
const renderPosition=new THREE.Vector3();
const renderQuaternion=new THREE.Quaternion();
const cameraRig=new FlightCameraRig(camera);
const forward=new THREE.Vector3();
const ghost=new THREE.Group();
const ghostBody=new THREE.Mesh(new THREE.ConeGeometry(1,4,4),new THREE.MeshBasicMaterial({color:0xa5faff,transparent:true,opacity:.32,depthWrite:false,wireframe:true}));
ghostBody.rotation.x=-Math.PI/2;ghost.add(ghostBody);ghost.visible=false;world.scene.add(ghost);
const mini=el<HTMLCanvasElement>('minimap').getContext('2d')!;
let accumulator=0;
let previousTime=performance.now()/1000;
let visualTime=0;
let hudClock=0;
let frames=0, fpsClock=0, fps=0;

function toast(message:string) { el('toast').textContent=message;el('toast').classList.add('visible');toastUntil=performance.now()+3300; }
function recordKey(){return `v03.${mode}.${activity}.${settings.weather}.${settings.handling}.${state.assist?'assisted':'manual'}`;}
function persistSettings(){try{localStorage.setItem('flightlab.settings.v1',JSON.stringify(settings));}catch{toast('Local storage is unavailable. Settings apply for this session.');}}
function applySettings(){
  input.updateSettings(settings);audio.setEnabled(settings.sound&&phase==='flying');audio.setVolume(settings.volume);
  world.setWeather(activity==='training'&&phase!=='menu'?(settings.weather==='dusk'?'dusk':'clear'):settings.weather);
  wind.set(settings.weather==='windy'&&activity!=='training'?4:0,0,settings.weather==='windy'&&activity!=='training'?3:0);
  renderer.setPixelRatio(Math.min(devicePixelRatio,settings.quality==='high'?2:settings.quality==='low'?1:1.35));
  renderer.shadowMap.enabled=settings.quality!=='low';
  renderer.setSize(innerWidth,innerHeight);
}
function updateModeUI(){
  const data=descriptions[mode];
  el<HTMLSelectElement>('weather').disabled=mode==='space';
  el('region-code').textContent=data.coordinates;el('region-title').textContent=data.region;el('region-copy').innerHTML=data.copy;
  el('flight-name').textContent=data.name;el('flight-hint').innerHTML=data.hint;
  el('speed-label').textContent=mode==='space'?'REL. SPEED':'AIRSPEED';el('altitude-label').textContent=mode==='space'?'DOCK RANGE':'HEIGHT AGL';
  el('fourth-label').textContent=mode==='space'?'EST. STOP':'THROTTLE';el('fourth-unit').textContent=mode==='space'?'M':'%';
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b=>{b.classList.toggle('selected',b.dataset.mode===mode);b.setAttribute('aria-pressed',String(b.dataset.mode===mode));});
  const select=el<HTMLSelectElement>('activity');select.innerHTML='<option value="free">Free exploration</option><option value="training">Flight school · Guided lessons</option><option value="race">Gate run · Time trial</option>'+(mode==='space'?'<option value="dock">Precision docking</option>':mode==='plane'?'<option value="departure">Runway departure</option>':'');select.value='free';
  let trained=false;try{trained=localStorage.getItem(`flightlab.training.v03.${mode}`)==='complete';}catch{}
  el('training-badge').textContent=trained?'✓ COURSE COMPLETE':'~3 MIN / GUIDED';
  updateAssist();updateControls();
}
function updateAssist(){el('assist-label').textContent=mode==='drone'?(state.assist?'ANGLE':'ACRO'):state.assist?'ASSIST ON':'ASSIST OFF';}
function selectMode(next:FlightMode){
  if (next===mode)return;
  mode=next;world.scene.remove(ghost);world.setMode(mode);world.scene.add(ghost);state=createFlightState(mode,world.spawn(mode));
  ghost.visible=false;cameraMode='chase';world.setGateProgress(-1);world.setDockGuidance(false);cameraRig.reset();applySettings();updateModeUI();
}
async function startFlight(){
  activity=el<HTMLSelectElement>('activity').value;
  const spawn=activity==='training'||activity==='departure'?world.trainingSpawn(mode):world.spawn(mode);
  state=createFlightState(mode,spawn);state.assist=true;setHandlingPreset(state,activity==='training'?'gentle':settings.handling);
  training=activity==='training'?new TrainingSession(mode,spawn.position,spawn.quaternion,world.dock,environment.groundHeight):null;
  previousGrounded=spawn.position.y-environment.groundHeight(spawn.position.x,spawn.position.z)<3;
  gateIndex=0;dockingHold=0;ghostFrames=[];lastRecordTime=-1;ghostCursor=0;
  world.setGateProgress(activity==='race'?0:-1);world.setDockGuidance(mode==='space'&&(activity==='dock'||activity==='training'));best=loadRecord(recordKey());
  phase='flying';accumulator=0;cameraRig.reset();applySettings();
  el('menu').hidden=true;el('hud').hidden=false;el('pause-modal').hidden=true;el('settings-modal').hidden=true;el('controls-modal').hidden=true;
  el('top-label').textContent='LIVE FLIGHT / 0.3';el('mission-label').textContent=activity==='training'?'FLIGHT SCHOOL':activity==='race'?'GATE RUN / TIME TRIAL':activity==='dock'?'PRECISION DOCKING':activity==='departure'?'RUNWAY DEPARTURE':'FREE EXPLORATION';
  el('mission-progress').hidden=activity==='free'||activity==='departure';el('flight-hint').hidden=false;el('lesson-card').hidden=!training;updateAssist();input.setContext('flight');
  (document.activeElement as HTMLElement)?.blur();
  try{await audio.start();audio.setEnabled(settings.sound&&phase==='flying');audio.setVolume(settings.volume);}catch{/* Audio is optional. */}
}
function pause(){
  if(phase!=='flying')return;
  phase='paused';audio.setEnabled(false);showPause('Flight paused.','Your next great line is waiting.','TAKE A BREATH');
}
function showPause(title:string,copy:string,eyebrow:string){
  input.setContext('menu');
  el('pause-title').textContent=title;el('pause-copy').textContent=copy;el('pause-eyebrow').textContent=eyebrow;
  el('pause-modal').hidden=false;el('resume').hidden=phase!=='paused';el('result-grid').hidden=phase!=='complete';
  el<HTMLButtonElement>(phase==='paused'?'resume':'restart').focus();
}
function resume(){if(phase!=='paused')return;phase='flying';accumulator=0;el('pause-modal').hidden=true;audio.setEnabled(settings.sound);input.setContext('flight');void audio.start().catch(()=>{});(document.activeElement as HTMLElement)?.blur();}
function toMenu(){phase='menu';training=null;audio.setEnabled(false);el('pause-modal').hidden=true;el('settings-modal').hidden=true;el('controls-modal').hidden=true;el('menu').hidden=false;el('hud').hidden=true;el('top-label').textContent='A FLIGHT PLAYGROUND';state=createFlightState(mode,world.spawn(mode));ghost.visible=false;world.setGateProgress(-1);world.setDockGuidance(false);cameraRig.reset();input.setContext('menu');applySettings();updateModeUI();el<HTMLButtonElement>('launch').focus();}
function handleAction(action:InputAction){
  if(!el('settings-modal').hidden||!el('controls-modal').hidden){if(action==='pause'){if(!el('settings-modal').hidden)closeAux('settings-modal');else closeAux('controls-modal');}return;}
  if(action==='pause'){if(phase==='flying')pause();else if(phase==='paused')resume();else if(phase==='menu')void startFlight();return;}
  if(phase==='menu')return;
  if(action==='reset'){void startFlight();return;}
  if(phase!=='flying')return;
  if(action==='camera'){cameraMode=cameraMode==='chase'?'fpv':'chase';toast(cameraMode==='fpv'?'First-person view':'Chase camera');}
  if(action==='assist'){
    if(activity!=='free'&&activity!=='departure'){toast('Assistance is locked during a lesson or challenge. Try Free exploration to switch.');return;}
    state.assist=!state.assist;updateAssist();toast(mode==='drone'?(state.assist?'Angle mode · Auto-level enabled':'Acro mode · Rate control'):(state.assist?'Flight assistance enabled':'Flight assistance disabled'));
  }
}
function openAux(id:string){modalWasFlying=phase==='flying';if(modalWasFlying){phase='paused';audio.setEnabled(false);}input.setContext('menu');el(id).hidden=false;refreshBindings();(el(id).querySelector('button') as HTMLButtonElement)?.focus();}
function closeAux(id:string){
  if(id==='settings-modal'&&input.rangeCalibrating){input.cancelRangeCalibration();el('calibration-status').textContent='Unfinished sweep canceled. Your saved calibration is unchanged.';}
  el(id).hidden=true;if(modalWasFlying){phase='flying';accumulator=0;audio.setEnabled(settings.sound);input.setContext('flight');}modalWasFlying=false;(document.activeElement as HTMLElement)?.blur();
}
function completeFlight(){
  phase='complete';audio.cue('complete');input.rumble(.5,260);
  el('result-best').previousElementSibling!.textContent=activity==='training'?'LESSONS COMPLETE':'PERSONAL BEST';
  if(activity==='training'){
    try{localStorage.setItem(`flightlab.training.v03.${mode}`,'complete');}catch{}
    el('result-time').textContent=formatTime(state.flightTime);el('result-best').textContent=`${training!.count} / ${training!.count}`;
    showPause('Your wings are ready.','You have completed the fundamentals. Explore freely, or put your new skills to work on the gate run.','FLIGHT SCHOOL COMPLETE');
    return;
  }
  const isBest=!best||state.flightTime<best.time;
  let saved=true;
  if(isBest){best={time:state.flightTime,frames:ghostFrames};saved=saveRecord(recordKey(),best);}
  el('result-time').textContent=formatTime(state.flightTime);el('result-best').textContent=formatTime(best!.time);
  showPause(activity==='dock'?'A perfect arrival.':'You found your flow.',isBest?(saved?'A new personal best. Your flight is saved on this device.':'A new personal best. Storage is full; this flight could not be saved.'):'A good flight. Your best line is waiting for another run.',isBest?'NEW PERSONAL BEST':'FLIGHT COMPLETE');
}
function updateChallenge(){
  if(activity==='race'&&gateIndex<world.gates.length&&crossedGate(state.previousPosition,state.position,world.gates[gateIndex])){
    gateIndex++;world.setGateProgress(gateIndex);audio.cue('gate');input.rumble(.25,100);
    if(gateIndex===world.gates.length){completeFlight();return;}toast(`${world.routeLabels[gateIndex]||`Gate ${gateIndex+1}`} · ${world.gates.length-gateIndex} to go`);
  }
  if(activity==='dock'){
    const distance=state.position.distanceTo(world.dock.position);
    const aligned=state.quaternion.angleTo(world.dock.quaternion)<.23;
    if(distance<world.dock.radius&&state.velocity.length()<1.4&&aligned){dockingHold+=1/120;if(dockingHold>=2)completeFlight();}else dockingHold=0;
  }
  if((activity==='race'||activity==='dock')&&state.flightTime-lastRecordTime>=.1&&ghostFrames.length<18000){ghostFrames.push({t:state.flightTime,p:state.position.toArray(),q:state.quaternion.toArray()});lastRecordTime=state.flightTime;}
}
function updateGhost(){
  ghost.visible=phase==='flying'&&activity==='race'&&settings.showGhost&&!!best?.frames.length;
  if(!ghost.visible||!best)return;
  while(ghostCursor<best.frames.length-2&&best.frames[ghostCursor+1].t<state.flightTime)ghostCursor++;
  const a=best.frames[ghostCursor], b=best.frames[Math.min(ghostCursor+1,best.frames.length-1)];
  const t=b.t===a.t?0:THREE.MathUtils.clamp((state.flightTime-a.t)/(b.t-a.t),0,1);
  ghost.position.fromArray(a.p).lerp(new THREE.Vector3().fromArray(b.p),t);ghost.quaternion.fromArray(a.q).slerp(new THREE.Quaternion().fromArray(b.q),t);
  ghost.scale.setScalar(mode==='plane'?2.5:mode==='space'?2:1);
}
function updateCamera(dt:number){
  renderPosition.copy(state.previousPosition).lerp(state.position,phase==='flying'?accumulator*120:1);
  renderQuaternion.copy(state.previousQuaternion).slerp(state.quaternion,phase==='flying'?accumulator*120:1);
  world.vehicle.position.copy(renderPosition);world.vehicle.quaternion.copy(renderQuaternion);
  const preview=phase==='menu';world.vehicle.visible=preview||cameraMode==='chase';
  cameraRig.update(state,renderPosition,renderQuaternion,cameraMode,preview,dt,visualTime,settings,environment.groundHeight,environment.collides);
  el('cockpit-frame').hidden=preview||cameraMode!=='fpv';
  el('cockpit-frame').classList.toggle('space-cockpit',mode==='space');
}
function projectMarker(){
  const dockTarget=mode==='space'&&(activity==='dock'||activity==='training');
  const target=dockTarget?world.dock.position:activity==='race'?world.gates[gateIndex]?.position:mode==='drone'&&activity==='free'?world.landingPad.position:undefined;
  const marker=el('target-marker');marker.hidden=!target;
  const offscreen=el('offscreen-target');offscreen.hidden=true;
  if(target){
    const local=target.clone().applyMatrix4(camera.matrixWorldInverse);const projected=target.clone().project(camera);
    const outside=local.z>=0||Math.abs(projected.x)>.82||Math.abs(projected.y)>.65;
    marker.hidden=outside;offscreen.hidden=!outside;
    marker.style.left=`${THREE.MathUtils.clamp((projected.x*.5+.5)*innerWidth,65,innerWidth-65)}px`;
    marker.style.top=`${THREE.MathUtils.clamp((-projected.y*.5+.5)*innerHeight,125,innerHeight-140)}px`;
    const label=`${dockTarget?'DOCK':activity==='race'?`GATE ${gateIndex+1}`:'LANDING PAD'} · ${Math.round(state.position.distanceTo(target))} m`;
    el('target-distance').textContent=label;el('offscreen-label').textContent=label;
    const dx=local.x,dy=-local.y;
    const angle=Math.atan2(dy,Math.abs(dx)+Math.abs(dy)<.01?1:dx);
    el('offscreen-arrow').style.transform=`rotate(${angle+Math.PI/2}rad)`;
    offscreen.style.left=`${innerWidth/2+Math.cos(angle)*Math.min(innerWidth*.35,410)}px`;
    offscreen.style.top=`${innerHeight/2+Math.sin(angle)*innerHeight*.25}px`;
  }
  const velocityMarker=el('velocity-marker');velocityMarker.hidden=phase!=='flying'||state.velocity.length()<2;
  if(!velocityMarker.hidden){
    const position=renderPosition.clone().add(state.velocity.clone().normalize().multiplyScalar(80));
    const local=position.clone().applyMatrix4(camera.matrixWorldInverse);const p=position.project(camera);
    velocityMarker.hidden=local.z>=0||Math.abs(p.x)>.85||Math.abs(p.y)>.8;
    velocityMarker.style.left=`${(p.x*.5+.5)*innerWidth}px`;velocityMarker.style.top=`${(-p.y*.5+.5)*innerHeight}px`;
  }
}
function updateHud(){
  const telemetry=getTelemetry(state,wind);
  const guidance=getDockingGuidance(state,world.dock);
  el('speed').textContent=(mode==='space'?state.velocity.length():state.airspeed).toFixed(mode==='space'?1:0);
  const range=state.position.distanceTo(world.dock.position);
  el('altitude').textContent=mode==='space'?range.toFixed(range<20?1:0):Math.round(state.position.y-world.groundHeight(state.position.x,state.position.z)).toString();
  el('vertical').textContent=`${state.velocity.y>=0?'+':''}${state.velocity.y.toFixed(1)}`;
  el('throttle').textContent=mode==='space'?guidance.stoppingDistance.toFixed(guidance.stoppingDistance<20?1:0):Math.round(state.throttle*100).toString();
  el('throttle-bar').style.height=`${state.throttle*100}%`;
  const heading=(telemetry.heading+360)%360;
  el('heading').textContent=`${String(Math.round(heading)%360).padStart(3,'0')}°`;
  const compassLabels=document.querySelectorAll('.compass-rule span');
  const cardinals=['N','NE','E','SE','S','SW','W','NW'];
  compassLabels[0].textContent=cardinals[Math.round((heading+270)%360/45)%8];
  compassLabels[2].textContent=cardinals[Math.round(heading/45)%8];
  compassLabels[4].textContent=cardinals[Math.round((heading+90)%360/45)%8];
  el('mission-time').textContent=formatTime(state.flightTime);
  el('flight-hint').hidden=!!training||state.flightTime>24;
  el('mission-detail').textContent=training?`${Math.min(training.step+1,training.count)} / ${training.count} lessons · Gentle handling`:activity==='race'?`${gateIndex} / ${world.gates.length} · ${world.routeLabels[gateIndex]||'Finish'} · Best ${best?formatTime(best.time):'—'}`:activity==='dock'?(dockingHold>0?`Hold position · ${(2-dockingHold).toFixed(1)} s`:'Center · Align < 13° · Speed < 1.4 m/s'):activity==='departure'?'Build speed · Rotate above 28 m/s · Return to land':'Make your own flight path.';
  el('progress-bar').style.width=`${training?(training.step+training.progress)/training.count*100:activity==='dock'?dockingHold/2*100:gateIndex/world.gates.length*100}%`;
  if(training){
    el('lesson-step').textContent=`FLIGHT SCHOOL / ${String(Math.min(training.step+1,training.count)).padStart(2,'0')}`;
    el('lesson-title').textContent=training.lesson.title;el('lesson-description').textContent=training.lesson.description;
    el('lesson-control').textContent=input.connected?training.lesson.gamepad:training.lesson.keyboard;
    el('lesson-progress').style.width=`${training.progress*100}%`;
    el('lesson-progress-label').textContent=training.progress>0?`Maneuver progress · ${Math.round(training.progress*100)}%`:'Follow the cue to begin';
  }
  el('attitude-display').hidden=mode==='space';
  el('attitude-ladder').style.transform=`translateY(${THREE.MathUtils.clamp(telemetry.pitch*1.5,-45,45)}px) rotate(${-telemetry.roll}deg)`;
  el('attitude-readout').textContent=`P ${telemetry.pitch.toFixed(0)}° · R ${telemetry.roll.toFixed(0)}°`;
  el('dock-guidance').hidden=mode!=='space'||(activity!=='dock'&&activity!=='training');
  if(!el('dock-guidance').hidden){
    el('closing-speed').textContent=guidance.closingSpeed.toFixed(1);el('lateral-speed').textContent=guidance.lateralSpeed.toFixed(1);el('alignment-error').textContent=guidance.alignmentDegrees.toFixed(0);
    el('dock-offset').style.transform=`translate(${THREE.MathUtils.clamp(guidance.offsetX*3,-38,38)}px,${THREE.MathUtils.clamp(-guidance.offsetY*3,-38,38)}px) rotate(45deg)`;
    el('approach-status').textContent=guidance.behind?'RETURN TO APPROACH':guidance.safeApproach?'APPROACH STABLE':guidance.stoppingDistance>=Math.max(0,guidance.distance-world.dock.radius)&&state.velocity.length()>1.4?'BRAKE NOW':'CORRECT ALIGNMENT';
    el('approach-status').classList.toggle('caution',!guidance.safeApproach);
    el('dock-instruction').textContent=`Offset X ${guidance.offsetX.toFixed(1)} / Y ${guidance.offsetY.toFixed(1)} m · Stop ${guidance.stoppingDistance.toFixed(1)} m`;
  }
  el('wind-indicator').hidden=mode==='space';
  el('wind-text').textContent=wind.length()<.1?'CALM AIR':`WIND ${wind.length().toFixed(1)} M/S`;
  el('wind-arrow').style.transform=`rotate(${wind.length()<.1?0:Math.atan2(wind.x,-wind.z)-THREE.MathUtils.degToRad(heading)}rad)`;
  proximityDistance=world.proximity(state.position,80);
  el('proximity-cue').style.opacity=String(phase==='flying'?Math.max(0,1-proximityDistance/12)*Math.min(1,state.velocity.length()/16)*.45:0);
  const warning=state.grounded?(mode==='plane'?'RUNWAY · ROTATE ABOVE 28 M/S':'ON GROUND'):state.stall>.48&&mode==='plane'?'STALL · LOWER NOSE / ADD POWER':mode==='space'&&!state.assist?'INERTIAL FLIGHT · BRAKE EARLY':'';
  el('warning').hidden=!warning;el('warning').textContent=warning;
  el('flight-status').textContent=`${cameraMode==='chase'?'CHASE':'FPV'} CAM · ${mode==='space'?'VACUUM':wind.length()>.1?`WIND ${wind.length().toFixed(1)} M/S`:'WIND CALM'} · ${fps} FPS`;
  const device=input.connected?'Gamepad connected':'Keyboard ready';el('device-label').textContent=device;
  const bindings=input.getBindings();
  document.querySelectorAll<HTMLElement>('[data-action]').forEach(button=>{const action=button.dataset.action as InputAction;const key=button.querySelector('.key');if(key)key.textContent=input.connected?BUTTON_LABELS[bindings[action]].split(' / ')[0]:({pause:'ESC',camera:'C',assist:'F',reset:'R'}[action]);});
  el('controller-name').textContent=input.connected?input.controllerName:'Connect a controller and press any button.';
  for(let i=0;i<4;i++)el(`axis-${i}`).style.width=`${((input.rawAxes[i]||0)+1)*50}%`;
  if(lastController!==input.controllerName){lastController=input.controllerName;refreshBindings();updateControls();}
  for(const id of ['calibrate','calibrate-range','reset-calibration'])el<HTMLButtonElement>(id).disabled=!input.connected;
  el('calibrate-range').textContent=input.rangeCalibrating?'Finish full travel':'Calibrate full travel';
  drawMinimap();
}
function drawMinimap(){
  const ctx=mini;const size=304;ctx.clearRect(0,0,size,size);ctx.save();ctx.translate(size/2,size/2);
  ctx.strokeStyle='#b9dcca20';ctx.lineWidth=1;
  for(const r of [45,95,145]){ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke();}
  ctx.beginPath();ctx.moveTo(-145,0);ctx.lineTo(145,0);ctx.moveTo(0,-145);ctx.lineTo(0,145);ctx.stroke();
  const scale=mode==='drone'?.35:mode==='plane'?.08:.18;
  const point=(p:THREE.Vector3)=>({x:THREE.MathUtils.clamp((p.x-state.position.x)*scale,-136,136),y:THREE.MathUtils.clamp((p.z-state.position.z)*scale,-136,136)});
  if(activity==='race'){
    ctx.strokeStyle='#d8fb9060';ctx.setLineDash([4,7]);ctx.beginPath();world.gates.forEach((g,i)=>{const p=point(g.position);if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);});ctx.stroke();ctx.setLineDash([]);
    world.gates.forEach((g,i)=>{const p=point(g.position);ctx.fillStyle=i===gateIndex?'#d8fb90':i<gateIndex?'#748b82':'#a7d4d8';ctx.beginPath();ctx.arc(p.x,p.y,i===gateIndex?6:3,0,Math.PI*2);ctx.fill();});
  }else if(mode==='space'){const p=point(world.dock.position);ctx.strokeStyle='#d8fb90';ctx.strokeRect(p.x-5,p.y-5,10,10);}
  ctx.fillStyle='#edf7e7';forward.set(0,0,-1).applyQuaternion(state.quaternion);ctx.rotate(Math.atan2(forward.x,-forward.z));ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(6,7);ctx.lineTo(0,3);ctx.lineTo(-6,7);ctx.closePath();ctx.fill();ctx.restore();
}
function updateControls(){
  const bindings=input.getBindings();const attitude=input.stickLayout==='standard'?'Right stick':'Left stick';const translation=input.stickLayout==='standard'?'Left stick':'Right stick';
  const rows=mode==='space'?[['Pitch / yaw','Arrow keys',attitude],['Forward / backward','W / S','RT / LT'],['Strafe left / right','A / D',`${translation} X`],['Move up / down','X / Z',`${translation} Y`],['Roll left / right','Q / E','LB / RB']]:[['Pitch / roll','Arrow keys',attitude],['Yaw left / right','A / D',`${translation} X`],['Increase / decrease throttle','W / S',`${translation} Y`]];
  rows.push(['Brake / hover assist','Space',BUTTON_LABELS[bindings.brake]],['Camera','C',BUTTON_LABELS[bindings.camera]],['Toggle assistance','F',BUTTON_LABELS[bindings.assist]],['Restart','R',BUTTON_LABELS[bindings.reset]],['Pause','Esc',BUTTON_LABELS[bindings.pause]],['Spacecraft boost','Shift',BUTTON_LABELS[bindings.boost]]);
  el('controls-body').innerHTML=rows.map(row=>`<tr>${row.map(t=>`<td>${t}</td>`).join('')}</tr>`).join('');
  el('controls-note').textContent=mode==='drone'?'The throttle stays where you leave it. Around 50% balances gravity when level. Angle mode self-levels; Acro mode holds your attitude.':mode==='plane'?'Free exploration begins airborne. Flight school and Runway departure begin on the runway. Maintain airspeed, bank to turn, and control your descent before landing.':'Flight Assist brakes drift when sticks are released. With assistance off, momentum persists. Rotation stabilization remains enabled.';
  el('controls-note').nextElementSibling!.textContent='Menus: D-pad or left stick to move · A to select · B to go back. Left / right adjusts the focused setting. Button remapping applies during flight.';
}

function refreshBindings(){
  const names:Record<ButtonAction,string>={brake:'Brake / hover assist',assist:'Toggle assistance',camera:'Change camera',reset:'Restart flight',boost:'Spacecraft boost',pause:'Pause flight'};
  const bindings=input.getBindings();
  if(!el('bindings-grid').childElementCount){
    el('bindings-grid').innerHTML=(Object.keys(names) as ButtonAction[]).map(action=>`<div class="setting"><label for="bind-${action}">${names[action]}</label><select id="bind-${action}" data-binding="${action}">${BUTTON_LABELS.map((name,i)=>[4,5,6,7].includes(i)?'':`<option value="${i}">${name}</option>`).join('')}</select></div>`).join('');
    el('bindings-grid').querySelectorAll<HTMLSelectElement>('select').forEach(control=>control.addEventListener('change',()=>{input.setBinding(control.dataset.binding as ButtonAction,Number(control.value));refreshBindings();updateControls();}));
  }
  for(const action of Object.keys(names) as ButtonAction[])el<HTMLSelectElement>(`bind-${action}`).value=String(bindings[action]);
  el<HTMLSelectElement>('stick-layout').value=input.stickLayout;
}
function handleMenu(action:MenuAction){
  const modal=['settings-modal','controls-modal','pause-modal'].map(id=>el(id)).find(node=>!node.hidden);
  navigateMenu(modal||app,action,()=>{
    if(modal?.id==='settings-modal'||modal?.id==='controls-modal')closeAux(modal.id);
    else if(phase==='paused')resume();else if(phase==='crashed'||phase==='complete')toMenu();
  });
}

document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button=>button.addEventListener('click',()=>selectMode(button.dataset.mode as FlightMode)));
document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button=>button.addEventListener('click',()=>{handleAction(button.dataset.action as InputAction);if(phase==='flying')button.blur();}));
el('launch').addEventListener('click',()=>void startFlight());el('resume').addEventListener('click',resume);el('restart').addEventListener('click',()=>void startFlight());el('return-menu').addEventListener('click',toMenu);
el('training-button').addEventListener('click',()=>{el<HTMLSelectElement>('activity').value='training';void startFlight();});
el('settings-button').addEventListener('click',()=>openAux('settings-modal'));el('close-settings').addEventListener('click',()=>closeAux('settings-modal'));
for(const id of ['controls-button','hud-controls'])el(id).addEventListener('click',()=>{updateControls();openAux('controls-modal');});
for(const id of ['close-controls','controls-done'])el(id).addEventListener('click',()=>closeAux('controls-modal'));
el('calibrate').addEventListener('click',()=>toast(input.calibrate()?'Neutral stick position calibrated.':'Connect a standard gamepad first.'));
el('calibrate-range').addEventListener('click',()=>{
  if(!input.rangeCalibrating){if(input.beginRangeCalibration())el('calibration-status').textContent='Move both sticks slowly through full circles. Then release them and select Finish full travel.';}
  else el('calibration-status').textContent=input.finishRangeCalibration()?'Full travel calibrated and saved for this controller.':'Keep sweeping: every stick axis must reach both sides before finishing.';
});
el('reset-calibration').addEventListener('click',()=>{input.resetCalibration();el('calibration-status').textContent='Calibration reset. Release the sticks, set center, then calibrate full travel.';});
el('reset-bindings').addEventListener('click',()=>{input.resetBindings();refreshBindings();updateControls();toast('Default flight buttons restored.');});
el('stick-layout').addEventListener('change',()=>{input.stickLayout=el<HTMLSelectElement>('stick-layout').value as 'standard'|'southpaw';updateControls();});
for(const key of ['deadzone','sensitivity','expo','volume','fov','cameraSmooth','shake'] as const){
  const control=el<HTMLInputElement>(key);control.value=String(settings[key]);el(`${key}-value`).textContent=Number(control.value).toFixed(2);
  control.addEventListener('input',()=>{settings[key]=Number(control.value);el(`${key}-value`).textContent=settings[key].toFixed(2);input.updateSettings(settings);audio.setVolume(settings.volume);persistSettings();});
}
for(const key of ['invertPitch','vibration','sound','showGhost','dynamicFov','horizonLock'] as const){const control=el<HTMLInputElement>(key);control.checked=settings[key];control.addEventListener('change',()=>{settings[key]=control.checked;input.updateSettings(settings);if(key==='sound')audio.setEnabled(settings.sound&&phase==='flying');persistSettings();});}
el('comfort-preset').addEventListener('click',()=>{
  settings.fov=78;settings.cameraSmooth=.7;settings.shake=0;settings.dynamicFov=false;settings.horizonLock=true;
  for(const key of ['fov','cameraSmooth','shake'] as const){el<HTMLInputElement>(key).value=String(settings[key]);el(`${key}-value`).textContent=settings[key].toFixed(2);}
  for(const key of ['dynamicFov','horizonLock'] as const)el<HTMLInputElement>(key).checked=settings[key];
  persistSettings();toast('Comfort camera applied.');
});
el<HTMLSelectElement>('handling').value=settings.handling;
el('handling').addEventListener('change',()=>{
  if(phase!=='menu'&&activity!=='free'&&activity!=='departure'){el<HTMLSelectElement>('handling').value=settings.handling;toast('Handling is locked during a lesson or challenge.');return;}
  settings.handling=el<HTMLSelectElement>('handling').value as Settings['handling'];setHandlingPreset(state,settings.handling);persistSettings();
});
el<HTMLSelectElement>('weather').value=settings.weather;el<HTMLSelectElement>('quality').value=settings.quality;
el('weather').addEventListener('change',()=>{if(phase!=='menu'&&activity!=='free'){el<HTMLSelectElement>('weather').value=settings.weather;toast('Weather is locked during a challenge. Return to flight selection to change it.');return;}settings.weather=el<HTMLSelectElement>('weather').value as Weather;applySettings();persistSettings();});
el('quality').addEventListener('change',()=>{settings.quality=el<HTMLSelectElement>('quality').value as Settings['quality'];applySettings();persistSettings();});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&phase==='flying')pause();});
addEventListener('blur',()=>{if(phase==='flying')pause();});
document.addEventListener('keydown',event=>{
  if(event.code==='KeyR'&&!event.repeat&&!el('pause-modal').hidden&&el('settings-modal').hidden&&el('controls-modal').hidden){event.preventDefault();event.stopPropagation();void startFlight();return;}
  if(event.key==='Tab'){
    const visible=['settings-modal','controls-modal','pause-modal'].map(id=>el(id)).find(node=>!node.hidden);if(!visible)return;
    const controls=Array.from(visible.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)')).filter(node=>!node.closest('[hidden]')&&node.getBoundingClientRect().width>0);
    const first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
});
input.setMenuHandler(handleMenu);input.setContext('menu');refreshBindings();
applySettings();updateModeUI();world.setGateProgress(-1);world.setDockGuidance(false);camera.position.set(99999,99999,99999);
renderer.setAnimationLoop(()=>{
  const now=performance.now()/1000;const dt=Math.min(.075,Math.max(0,now-previousTime));previousTime=now;visualTime+=dt;
  input.setContext(phase==='flying'?'flight':'menu');const controls=input.poll(mode);
  if(phase==='flying'){
    accumulator+=dt;let steps=0;
    while(accumulator>=1/120&&steps<10&&phase==='flying'){
      if(mode!=='space'&&settings.weather==='windy'&&activity!=='training')wind.set(4+Math.sin(state.flightTime*.33)*.65,Math.sin(state.flightTime*.51)*.16,3+Math.cos(state.flightTime*.27)*.5);else wind.set(0,0,0);
      stepFlight(state,controls,environment,1/120);accumulator-=1/120;steps++;
      if(state.grounded&&world.isWater(state.position.x,state.position.z)){state.crashed=true;state.velocity.set(0,0,0);}
      if(state.crashed){phase='crashed';audio.cue('crash');input.rumble(.8,350);showPause('A little too close.','Every great flight starts with another try. Reset and find your line.','FLIGHT ENDED');break;}
      if(state.grounded&&!previousGrounded&&state.flightTime>1){audio.cue('land');input.rumble(.2,100);toast('Touchdown. Smooth work.');}previousGrounded=state.grounded;
      if(training?.update(state,controls,1/120)){
        if(training.completed){completeFlight();break;}
        audio.cue('gate');input.rumble(.2,80);toast(`Lesson complete · ${training.lesson.title}`);
      }
      updateChallenge();
    }
    audio.update(phase==='flying'?state:{...state,crashed:true},dt,{proximity:Math.max(0,1-proximityDistance/35),wind:wind.length()});
  }else accumulator=0;
  world.update(dt,visualTime,state,wind);updateCamera(dt);updateGhost();
  renderer.render(world.scene,camera);projectMarker();
  frames++;fpsClock+=dt;if(fpsClock>=1){fps=Math.round(frames/fpsClock);frames=0;fpsClock=0;}
  hudClock+=dt;if(hudClock>.1){updateHud();hudClock=0;}
  if(performance.now()>toastUntil)el('toast').classList.remove('visible');
});
Object.assign(window,{flightlab:{snapshot:()=>({version:'0.3.0',mode,phase,activity,camera:cameraMode,assist:state.assist,position:state.position.toArray(),velocity:state.velocity.toArray(),throttle:state.throttle,gateIndex,gateCount:world.gates.length,lesson:training?{step:training.step,progress:training.progress,completed:training.completed}:null,flightTime:state.flightTime,crashed:state.crashed,controller:input.connected,fps,drawCalls:renderer.info.render.calls})}});
