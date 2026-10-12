import * as THREE from 'three';
import type { FlightMode, FlightState, Gate, SpawnPoint, Weather } from './types';
import type { WorldPhysics } from './environment';

const UP = new THREE.Vector3(0, 1, 0);
const FRONT = new THREE.Vector3(0, 0, 1);

interface Solid { box: THREE.Box3 }
interface GateVisual { group: THREE.Group; ring: THREE.Mesh; material: THREE.MeshStandardMaterial }
interface Hill { x: number; z: number; rx: number; rz: number; height: number }
interface WindCue { pivot: THREE.Group; cloth: THREE.Object3D; phase: number }

/** Authored, asset-free flight environments. Distances are in metres. */
export class FlightWorld {
  scene = new THREE.Scene();
  vehicle = new THREE.Group();
  gates: Gate[] = [];
  routeLabels: string[] = [];
  landingPad = { position: new THREE.Vector3(0, 0.25, 120), radius: 8 };
  dock = { position: new THREE.Vector3(0, 8, -470), quaternion: new THREE.Quaternion(), radius: 9 };
  private mode: FlightMode;
  private weather: Weather = 'clear';
  private solids: Solid[] = [];
  private hills: Hill[] = [];
  private gateVisuals: GateVisual[] = [];
  private propellers: THREE.Object3D[] = [];
  private waterMaterial?: THREE.ShaderMaterial;
  private skyMaterial?: THREE.ShaderMaterial;
  private engineMaterial?: THREE.MeshBasicMaterial;
  private sun = new THREE.DirectionalLight();
  private ambient = new THREE.HemisphereLight();
  private stationRotor?: THREE.Group;
  private dockGuidance?: THREE.Group;
  private serviceTug?: THREE.Group;
  private windCues: WindCue[] = [];
  private foliage: THREE.Group[] = [];
  private readonly windDirection = new THREE.Vector3();
  private activeGate = 0;
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private geometries = new Map<string, THREE.BufferGeometry>();
  private surfaceTextures = new Map<string, THREE.CanvasTexture>();

  constructor(mode: FlightMode = 'drone') {
    this.mode = mode;
    this.setMode(mode);
  }

  setMode(mode: FlightMode): void {
    this.dispose();
    this.scene = new THREE.Scene();
    this.mode = mode;
    this.solids = [];
    this.hills = [];
    this.gates = [];
    this.routeLabels = [];
    this.windCues = [];
    this.foliage = [];
    this.gateVisuals = [];
    this.propellers = [];
    this.materials.clear();
    this.geometries.clear();
    this.surfaceTextures.clear();
    this.waterMaterial = undefined;
    this.skyMaterial = undefined;
    this.stationRotor = undefined;
    this.dockGuidance = undefined;
    this.serviceTug = undefined;
    this.engineMaterial = undefined;
    this.activeGate = 0;
    this.ambient = new THREE.HemisphereLight(0xc6e9ff, 0x34464a, 2.1);
    this.sun = new THREE.DirectionalLight(0xffd3a2, 3.5);
    this.sun.position.set(-400, 450, -700);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -100;
    this.sun.shadow.camera.right = 100;
    this.sun.shadow.camera.top = 100;
    this.sun.shadow.camera.bottom = -100;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 1700;
    this.sun.shadow.bias = -0.00035;
    this.sun.shadow.normalBias = 0.07;
    const shadowRange = mode === 'plane' ? 180 : 105;
    this.sun.shadow.camera.left = this.sun.shadow.camera.bottom = -shadowRange;
    this.sun.shadow.camera.right = this.sun.shadow.camera.top = shadowRange;
    this.scene.add(this.ambient, this.sun, this.sun.target);
    if (mode === 'space') this.buildSpace();
    else this.buildCoast();
    this.buildVehicle();
    this.scene.add(this.vehicle);
    this.setWeather(this.weather);
    this.setGateProgress(0);
    const spawn = this.spawn();
    this.vehicle.position.copy(spawn.position);
    this.vehicle.quaternion.copy(spawn.quaternion);
  }

  spawn(mode: FlightMode = this.mode): SpawnPoint {
    if (mode === 'space') return { position: new THREE.Vector3(0, 8, 150), quaternion: new THREE.Quaternion(), velocity: new THREE.Vector3(0, 0, -3), throttle: 0 };
    if (mode === 'plane') return { position: new THREE.Vector3(-80, 95, 450), quaternion: new THREE.Quaternion(), velocity: new THREE.Vector3(0, 0, -38), throttle: 0.4 };
    return { position: new THREE.Vector3(0, 9, 120), quaternion: new THREE.Quaternion(), velocity: new THREE.Vector3(), throttle: 0.5 };
  }

  /** Calm, unobstructed starts for lessons; free-flight spawns stay airborne. */
  trainingSpawn(mode: FlightMode = this.mode): SpawnPoint {
    if (mode === 'space') return { position: this.dock.position.clone().add(new THREE.Vector3(0, 0, 150)), quaternion: new THREE.Quaternion(), velocity: new THREE.Vector3(), throttle: 0 };
    if (mode === 'plane') return { position: new THREE.Vector3(-75, this.groundHeight(-75, 330) + 2.5, 330), quaternion: new THREE.Quaternion(), velocity: new THREE.Vector3(), throttle: 0 };
    return { position: this.landingPad.position.clone().add(new THREE.Vector3(0, 0.65, 0)), quaternion: new THREE.Quaternion(), velocity: new THREE.Vector3(), throttle: 0 };
  }

  private mat(color: number, metalness = 0, roughness = 0.8, emissive = 0): THREE.MeshStandardMaterial {
    const key = `${color}-${metalness}-${roughness}-${emissive}`;
    let material = this.materials.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, metalness, roughness, emissive, emissiveIntensity: emissive ? 2 : 0 });
      this.materials.set(key, material);
    }
    return material;
  }

  private geom(key: string, factory: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let geometry = this.geometries.get(key);
    if (!geometry) { geometry = factory(); this.geometries.set(key, geometry); }
    return geometry;
  }

  private surfaceTexture(kind: 'grass' | 'concrete' | 'asphalt' | 'metal'): THREE.CanvasTexture | null {
    // Geometry-only tests can construct environments without a browser canvas.
    if (typeof document === 'undefined') return null;
    const cached = this.surfaceTextures.get(kind);
    if (cached) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    let seed = 81731;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    ctx.fillStyle = kind === 'asphalt' ? '#d3d7d5' : '#e4e5d8';
    ctx.fillRect(0, 0, 256, 256);
    if (kind === 'grass') {
      // Broad, irregular vegetation patches survive minification at aircraft altitude.
      for (let i = 0; i < 110; i++) {
        ctx.fillStyle = `rgba(${random() > 0.5 ? '111,133,95' : '211,207,151'},${0.05 + random() * 0.11})`;
        ctx.fillRect(random() * 256, random() * 256, 10 + random() * 72, 8 + random() * 46);
      }
      for (let i = 0; i < 4300; i++) {
        ctx.fillStyle = random() > 0.45 ? 'rgba(80,107,69,0.11)' : 'rgba(255,247,210,0.2)';
        ctx.fillRect(random() * 256, random() * 256, 1 + random() * 3, 1 + random() * 5);
      }
    } else {
      for (let i = 0; i < 3800; i++) {
        ctx.fillStyle = random() > 0.5 ? 'rgba(48,64,65,0.065)' : 'rgba(255,255,241,0.11)';
        ctx.fillRect(random() * 256, random() * 256, 1 + random() * 2, 1 + random() * 2);
      }
      if (kind === 'concrete') {
        for (let y = 0; y < 256; y += 64) for (let x = 0; x < 256; x += 64) {
          ctx.fillStyle = `rgba(69,85,84,${random() * 0.065})`;
          ctx.fillRect(x + 2, y + 2, 61, 61);
          ctx.fillStyle = 'rgba(50,69,70,0.22)';
          ctx.fillRect(x, y, 1, 64); ctx.fillRect(x, y, 64, 1);
          ctx.fillStyle = 'rgba(255,255,235,0.25)';
          ctx.fillRect(x + 1, y + 1, 1, 62); ctx.fillRect(x + 1, y + 1, 62, 1);
        }
      } else if (kind === 'metal') {
        for (let x = 0; x < 256; x += 16) {
          ctx.fillStyle = 'rgba(38,57,65,0.20)'; ctx.fillRect(x, 0, 2, 256);
          ctx.fillStyle = 'rgba(255,255,245,0.38)'; ctx.fillRect(x + 2, 0, 2, 256);
        }
        ctx.fillStyle = 'rgba(38,57,65,0.12)'; ctx.fillRect(0, 0, 256, 2);
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    this.surfaceTextures.set(kind, texture);
    return texture;
  }

  private detailSurface(mesh: THREE.Mesh, kind: 'grass' | 'concrete' | 'asphalt' | 'metal', tileMetres: number): void {
    const texture = this.surfaceTexture(kind);
    if (!texture) return;
    const source = mesh.material as THREE.MeshStandardMaterial;
    const key = `surface-${kind}-${source.uuid}`;
    let material = this.materials.get(key);
    if (!material) {
      material = source.clone(); material.map = texture;
      this.materials.set(key, material);
    }
    mesh.material = material;
    const size = mesh.scale;
    const geometryKey = `surface-box-${kind}-${size.x}-${size.y}-${size.z}-${tileMetres}`;
    mesh.geometry = this.geom(geometryKey, () => {
      const geometry = mesh.geometry.clone();
      const uv = geometry.getAttribute('uv'), normal = geometry.getAttribute('normal');
      for (let i = 0; i < uv.count; i++) {
        const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i));
        const width = nx > 0.5 ? size.z : size.x;
        const height = ny > 0.5 ? size.z : size.y;
        uv.setXY(i, uv.getX(i) * width / tileMetres, uv.getY(i) * height / tileMetres);
      }
      uv.needsUpdate = true;
      return geometry;
    });
  }

  private box(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, parent: THREE.Object3D = this.scene, collision = false, metalness = 0): THREE.Mesh {
    const mesh = new THREE.Mesh(this.geom('box', () => new THREE.BoxGeometry(1, 1, 1)), this.mat(color, metalness));
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    if (collision) this.solids.push({ box: new THREE.Box3(new THREE.Vector3(x - sx / 2, y - sy / 2, z - sz / 2), new THREE.Vector3(x + sx / 2, y + sy / 2, z + sz / 2)) });
    return mesh;
  }

  private cylinder(x: number, y: number, z: number, radius: number, height: number, color: number, parent: THREE.Object3D = this.scene, sides = 16): THREE.Mesh {
    const mesh = new THREE.Mesh(this.geom(`cylinder-${sides}`, () => new THREE.CylinderGeometry(1, 1, 1, sides)), this.mat(color, 0.1));
    mesh.position.set(x, y, z);
    mesh.scale.set(radius, height, radius);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private beam(a: THREE.Vector3, b: THREE.Vector3, radius: number, color: number, parent: THREE.Object3D = this.scene): THREE.Mesh {
    const centre = a.clone().add(b).multiplyScalar(0.5);
    const mesh = this.cylinder(centre.x, centre.y, centre.z, radius, a.distanceTo(b), color, parent, 6);
    mesh.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
    return mesh;
  }

  private instances(geometry: THREE.BufferGeometry, material: THREE.Material, matrices: THREE.Matrix4[], parent: THREE.Object3D = this.scene, shadow = true): void {
    if (!matrices.length) return;
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    parent.add(mesh);
  }

  private transform(x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0): THREE.Matrix4 {
    return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, ry), new THREE.Vector3(sx, sy, sz));
  }

  private buildCoast(): void {
    this.scene.background = new THREE.Color(0x94bfca);
    this.scene.fog = new THREE.FogExp2(0x94bfca, this.mode === 'plane' ? 0.00028 : 0.0006);
    this.buildSky();
    this.buildWater();

    // Dry land, quays and a deliberately open centreline for the training route.
    this.detailSurface(this.box(-665, -8, -700, 1470, 16, 3000, 0x718369, this.scene, false), 'grass', 48);
    this.detailSurface(this.box(40, -1.18, -150, 72, 2.4, 960, 0xa8ab99), 'concrete', 12);
    this.box(76, -0.9, -150, 4, 3.5, 960, 0x5a6570);
    this.detailSurface(this.box(1, 0.04, -150, 18, 0.09, 1000, 0x465154), 'asphalt', 9);
    this.detailSurface(this.box(-75, 0.05, -190, 24, 0.1, 1420, 0x434c4d), 'asphalt', 12);
    const markings: THREE.Matrix4[] = [];
    for (let z = -850; z < 500; z += 23) markings.push(this.transform(-75, 0.12, z, 0.8, 0.06, 9));
    for (let z = -600; z < 350; z += 19) markings.push(this.transform(1, 0.12, z, 0.25, 0.06, 6));
    for (let x = -85; x < -64; x += 3) {
      markings.push(this.transform(x, 0.14, 365, 1.3, 0.07, 24));
      markings.push(this.transform(x, 0.14, -745, 1.3, 0.07, 24));
    }
    markings.push(this.transform(-86.1, 0.13, -190, 0.22, 0.03, 1420));
    markings.push(this.transform(-63.9, 0.13, -190, 0.22, 0.03, 1420));
    markings.push(this.transform(-7.25, 0.11, -150, 0.16, 0.03, 1000));
    markings.push(this.transform(9.25, 0.11, -150, 0.16, 0.03, 1000));
    for (let z = 55; z <= 190; z += 9) {
      markings.push(this.transform(24, 0.075, z, 12, 0.025, 0.16));
      markings.push(this.transform(18, 0.075, z + 4.5, 0.16, 0.025, 9));
    }
    this.instances(this.geom('box', () => new THREE.BoxGeometry(1, 1, 1)), this.mat(0xe6e0bc), markings, this.scene, false);
    this.buildPort();
    this.buildLighthouse();
    this.buildLandscape();
    this.buildBridge();
    this.buildFlightReferences();

    // Landing pad at spawn, with inset cross and a readable ring from altitude.
    this.cylinder(0, 0.13, 120, 9, 0.2, 0x293e43);
    const padRing = new THREE.Mesh(new THREE.RingGeometry(7.7, 8.15, 64), this.mat(0xffdb85));
    padRing.rotation.x = -Math.PI / 2;
    padRing.position.set(0, 0.25, 120);
    this.scene.add(padRing);
    this.box(-2, 0.25, 120, 0.5, 0.04, 5, 0xe8e4cb);
    this.box(2, 0.25, 120, 0.5, 0.04, 5, 0xe8e4cb);
    this.box(0, 0.25, 120, 4, 0.04, 0.5, 0xe8e4cb);

    if (this.mode === 'drone') {
      this.routeLabels = ['Harbor departure', 'Warehouse cut', 'Warehouse exit', 'Quayside run', 'Harbor bend', 'Bridge approach', 'Under the bridge', 'Lighthouse turn', 'Cliffside', 'Open bay', 'Bay sweep', 'Homeward leg', 'Harbor return', 'Final turn', 'Landing approach'];
      this.route([[0, 10, 72], [0, 10, 6], [0, 10, -46], [8, 14, -170], [8, 14, -345], [50, 14, -455], [50, 14, -500], [95, 18, -565], [113, 20, -670], [190, 15, -710], [265, 13, -420], [230, 12, -120], [130, 13, 120], [0, 8, 160], [0, 7, 125]], 6);
    } else {
      this.routeLabels = ['Departure', 'Harbor overflight', 'Coastal climb', 'Outer headland', 'Bay crossing', 'Downwind', 'Airfield return'];
      this.route([[-80, 95, 120], [-50, 110, -350], [60, 150, -950], [520, 165, -1500], [1050, 130, -800], [800, 105, 100], [250, 100, 550]], 36);
    }
  }

  private buildSky(): void {
    this.skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x20778d) },
        horizonColor: { value: new THREE.Color(0xd8cdb6) },
        sunColor: { value: new THREE.Color(0xffdc9a) },
        sunDirection: { value: new THREE.Vector3(-0.42, 0.23, -0.85).normalize() },
      },
      vertexShader: `varying vec3 vDirection; void main(){vDirection=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `uniform vec3 topColor,horizonColor,sunColor,sunDirection; varying vec3 vDirection;
        void main(){ vec3 d=normalize(vDirection); float h=pow(max(d.y,0.0),0.45); vec3 col=mix(horizonColor,topColor,h);
        float s=max(dot(d,sunDirection),0.0); col+=sunColor*pow(s,18.0)*0.21; col+=sunColor*pow(s,620.0)*0.48;
        col=mix(col,sunColor*2.0,smoothstep(0.99935,0.99965,s)); gl_FragColor=vec4(col,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(14000, 32, 20), this.skyMaterial);
    sky.frustumCulled = false;
    this.scene.add(sky);
  }

  private buildWater(): void {
    this.waterMaterial = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, deepColor: { value: new THREE.Color(0x123f4e) }, sunColor: { value: new THREE.Color(0xf5c68c) }, wave: { value: 0.17 } },
      vertexShader: `uniform float time,wave; varying vec3 vWorld; void main(){vec3 p=position; p.z+=sin(p.x*0.029+time*0.6)*wave+cos(p.y*0.05+time*0.75)*wave*0.55; vec4 w=modelMatrix*vec4(p,1.0); vWorld=w.xyz; gl_Position=projectionMatrix*viewMatrix*w;}`,
      fragmentShader: `uniform float time,wave; uniform vec3 deepColor,sunColor; varying vec3 vWorld;
        void main(){vec2 p=vWorld.xz; float a=sin(p.x*0.043+time*0.72),b=cos(p.y*0.078+time*0.64);
        vec3 n=normalize(vec3(a*0.055,1.0,b*0.07)); vec3 v=normalize(cameraPosition-vWorld); vec3 l=normalize(vec3(-0.42,0.23,-0.85));
        float fresnel=pow(1.0-max(dot(n,v),0.0),3.0); float shine=pow(max(dot(reflect(-l,n),v),0.0),100.0);
        float lines=pow(max(0.0,sin(p.x*0.19+sin(p.y*0.08+time)*1.5+time*1.4)),12.0);
        vec3 c=mix(deepColor,vec3(0.34,0.52,0.55),fresnel*0.75); c+=sunColor*shine*1.5; c+=vec3(0.12,0.28,0.28)*lines*0.16;
        float dist=length(cameraPosition-vWorld); c=mix(c,vec3(0.48,0.64,0.66),1.0-exp(-dist*0.00012)); gl_FragColor=vec4(c,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(25000, 25000, 140, 140), this.waterMaterial);
    water.rotation.x = -Math.PI / 2;
    water.position.y = -3;
    this.scene.add(water);
  }

  private buildPort(): void {
    // Warehouses sit either side of an unobstructed road; roofs provide height cues.
    const roofMatrices: THREE.Matrix4[] = [];
    const windowMatrices: THREE.Matrix4[] = [];
    const stripeMatrices: THREE.Matrix4[] = [];
    const doorSeams: THREE.Matrix4[] = [];
    const loadingTrim: THREE.Matrix4[] = [];
    for (let i = 0; i < 7; i++) {
      const x = i % 2 ? 40 : -31;
      const z = 35 - i * 67;
      const height = 9 + (i % 3) * 2;
      this.detailSurface(this.box(x, height / 2, z, 26, height, 39, i % 2 ? 0x72868a : 0x96a498, this.scene, true), 'metal', 4);
      this.detailSurface(this.box(x, height + 0.45, z, 29, 0.9, 42, 0x49616a, this.scene, false, 0.25), 'metal', 5);
      for (let j = -1; j <= 1; j++) {
        roofMatrices.push(this.transform(x + j * 7, height + 1.15, z, 4, 1.4, 8));
        const doorX = x + (x < 0 ? 13.08 : -13.08);
        stripeMatrices.push(this.transform(doorX, 4, z + j * 11, 0.13, 7, 7));
        for (let h = 0.8; h < 7.5; h += 0.65) doorSeams.push(this.transform(doorX + (x < 0 ? 0.075 : -0.075), h, z + j * 11, 0.035, 0.04, 6.85));
        loadingTrim.push(this.transform(doorX, 7.7, z + j * 11, 1.3, 0.18, 8.2));
        loadingTrim.push(this.transform(doorX, 1.1, z + j * 11 - 4, 0.5, 2.2, 0.32));
        loadingTrim.push(this.transform(doorX, 1.1, z + j * 11 + 4, 0.5, 2.2, 0.32));
      }
      for (let j = -2; j <= 2; j++) windowMatrices.push(this.transform(x + j * 4.5, height - 2.1, z + 19.55, 2.8, 1.6, 0.08));
    }
    this.instances(this.geom('box', () => new THREE.BoxGeometry(1, 1, 1)), this.mat(0x9aa6a1, 0.4), roofMatrices);
    this.instances(this.geom('box', () => new THREE.BoxGeometry(1, 1, 1)), this.mat(0xc7e9d6, 0.2, 0.4, 0x34473e), windowMatrices, this.scene, false);
    this.instances(this.geom('box', () => new THREE.BoxGeometry(1, 1, 1)), this.mat(0x273b44), stripeMatrices);
    this.instances(this.geom('box', () => new THREE.BoxGeometry(1, 1, 1)), this.mat(0x698087, 0.25), doorSeams, this.scene, false);
    this.instances(this.geom('box', () => new THREE.BoxGeometry(1, 1, 1)), this.mat(0xcab27c, 0.2), loadingTrim);

    // An actual open-ended warehouse: collision follows side walls and roof,
    // leaving a 19 m wide, 20 m high flight corridor along the road.
    for (const side of [-1, 1]) {
      this.detailSurface(this.box(side * 10.5, 10, 6, 2, 20, 74, 0x567378, this.scene, true), 'metal', 4);
      for (const z of [-30, -6, 18, 42]) this.box(side * 9.4, 10, z, 0.45, 20, 0.7, 0xd5b77b);
    }
    this.detailSurface(this.box(0, 21, 6, 24, 2, 77, 0x354d58, this.scene, true), 'metal', 5);
    const aisleLights: THREE.Matrix4[] = [], aisleLines: THREE.Matrix4[] = [];
    for (let z = -25; z <= 37; z += 10) {
      aisleLights.push(this.transform(-6.5, 19.85, z, 0.22, 0.12, 3));
      aisleLights.push(this.transform(6.5, 19.85, z, 0.22, 0.12, 3));
      aisleLines.push(this.transform(-7, 0.17, z, 0.25, 0.02, 5));
      aisleLines.push(this.transform(7, 0.17, z, 0.25, 0.02, 5));
    }
    this.instances(this.geom('box', () => new THREE.BoxGeometry(1, 1, 1)), this.mat(0xffdfae, 0, 0.5, 0xffb967), aisleLights, this.scene, false);
    this.instances(this.geom('box', () => new THREE.BoxGeometry(1, 1, 1)), this.mat(0xe7c978), aisleLines, this.scene, false);
    const warehouseLabel = this.makeLabel('HANGAR 04', '#fff0c9', 'rgba(15,37,44,0.95)');
    warehouseLabel.position.set(0, 24.8, 44.7); warehouseLabel.scale.set(20, 7, 1); this.scene.add(warehouseLabel);

    const containers: THREE.Matrix4[][] = [[], [], []];
    for (let i = 0; i < 30; i++) {
      const x = -125 - (i % 4) * 8;
      const z = 100 - Math.floor(i / 4) * 22;
      containers[i % 3].push(this.transform(x, 2.3, z, 6.5, 4.6, 15));
      if (i % 5 === 0) containers[(i + 1) % 3].push(this.transform(x, 6.9, z, 6.5, 4.6, 15));
      this.solids.push({ box: new THREE.Box3(new THREE.Vector3(x - 3.25, 0, z - 7.5), new THREE.Vector3(x + 3.25, i % 5 === 0 ? 9.2 : 4.6, z + 7.5)) });
    }
    [0xb96845, 0x3f7478, 0xbca263].forEach((color, index) => this.instances(this.geom('box', () => new THREE.BoxGeometry(1, 1, 1)), this.mat(color, 0.25), containers[index]));

    // Two working piers and cranes, kept beside the water-side racing route.
    for (let i = 0; i < 2; i++) {
      const z = -68 - i * 355;
      this.detailSurface(this.box(110, -0.8, z, 75, 2.2, 22, 0x8b9b95), 'concrete', 12);
      this.box(99, 13, z, 2.2, 26, 2.2, 0xe6b465, this.scene, true);
      this.box(103, 27, z, 4, 3.2, 4.2, 0x43565b);
      this.box(118, 29, z, 52, 1.5, 1.5, 0xe6b465);
      this.beam(new THREE.Vector3(99, 32, z), new THREE.Vector3(144, 29, z), 0.15, 0x4d6265);
      this.beam(new THREE.Vector3(141, 29, z), new THREE.Vector3(141, 7, z), 0.07, 0x42545b);
      this.box(141, 6.3, z, 1.5, 1.2, 1, 0x394950);
    }

    const lights: THREE.Matrix4[] = [];
    const bulbs: THREE.Matrix4[] = [];
    const bollards: THREE.Matrix4[] = [];
    for (let z = 220; z > -620; z -= 42) {
      lights.push(this.transform(69, 5, z, 0.22, 10, 0.22));
      bulbs.push(this.transform(69, 10, z, 1.1, 0.22, 1.1));
      bollards.push(this.transform(79, 0.45, z, 0.8, 0.9, 0.8));
    }
    this.instances(this.geom('box', () => new THREE.BoxGeometry(1, 1, 1)), this.mat(0x3b535c, 0.3), lights);
    this.instances(this.geom('box', () => new THREE.BoxGeometry(1, 1, 1)), this.mat(0xffd6a0, 0, 0.5, 0xffa14c), bulbs, this.scene, false);
    this.instances(this.geom('box', () => new THREE.BoxGeometry(1, 1, 1)), this.mat(0xcba85f, 0.3), bollards);

    // A low cargo ship offshore provides useful parallax without blocking gates.
    const ship = new THREE.Group();
    ship.position.set(300, -1, -210);
    ship.rotation.y = -0.25;
    this.box(0, 0, 0, 17, 5, 66, 0x293e4e, ship);
    this.box(0, 3, 0, 15, 1, 61, 0x929b8e, ship);
    this.box(0, 7, 22, 13, 8, 10, 0xd5d4bb, ship);
    this.box(0, 10, 16.8, 11, 2, 0.4, 0x405c67, ship);
    this.box(-3, 6, -7, 5, 5, 23, 0xa95f42, ship);
    this.box(3, 6, -7, 5, 5, 23, 0x56766a, ship);
    this.scene.add(ship);
  }

  private buildLighthouse(): void {
    const x = 67, z = -610;
    this.cylinder(x, 1, z, 15, 2, 0x7d8980);
    this.cylinder(x, 13, z, 4.3, 25, 0xe5debd);
    this.cylinder(x, 18, z, 4.4, 4, 0xb95e46);
    this.cylinder(x, 27, z, 6.3, 1.1, 0x304853);
    this.cylinder(x, 29, z, 3.8, 3.6, 0xd0e3c7);
    this.cylinder(x, 31.2, z, 5.2, 0.8, 0x304853);
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(1.7, 12, 8), this.mat(0xffe6b0, 0, 0.4, 0xffc06a));
    lantern.position.set(x, 29, z);
    this.scene.add(lantern);
    this.solids.push({ box: new THREE.Box3(new THREE.Vector3(x - 5, 0, z - 5), new THREE.Vector3(x + 5, 32, z + 5)) });
  }

  private buildBridge(): void {
    const z = -500;
    this.box(-22, 29, z, 220, 3.3, 13, 0x84968e);
    const rails: THREE.Matrix4[] = [];
    for (let x = -132; x < 90; x += 8) {
      rails.push(this.transform(x, 32, z - 6, 0.25, 3, 0.25));
      rails.push(this.transform(x, 32, z + 6, 0.25, 3, 0.25));
    }
    this.box(-22, 33.5, z - 6, 220, 0.3, 0.3, 0xcbd0af);
    this.box(-22, 33.5, z + 6, 220, 0.3, 0.3, 0xcbd0af);
    this.instances(this.geom('box', () => new THREE.BoxGeometry(1, 1, 1)), this.mat(0xaebaa2), rails);
    for (const x of [-125, -55, 20, 85]) this.box(x, 13, z, 5, 27, 10, 0x657e7c, this.scene, true);
    this.solids.push({ box: new THREE.Box3(new THREE.Vector3(-132, 27.35, z - 6.5), new THREE.Vector3(88, 30.65, z + 6.5)) });
  }

  private buildFlightReferences(): void {
    const cube = this.geom('box', () => new THREE.BoxGeometry(1, 1, 1));
    const runwayLights: THREE.Matrix4[] = [], approachLights: THREE.Matrix4[] = [];
    for (let z = -850; z <= 450; z += 40) for (const side of [-1, 1]) {
      runwayLights.push(this.transform(-75 + side * 12.8, 0.3, z, 0.4, 0.3, 0.65));
    }
    // Threshold and approach lights remain below the wheels and outside the runway.
    for (let z = 500; z <= 740; z += 40) {
      for (const side of [-1, 1]) approachLights.push(this.transform(-75 + side * 15, 0.35, z, 0.65, 0.35, 1.2));
    }
    this.instances(cube, this.mat(0xd5e4bf, 0, 0.5, 0x527d63), runwayLights, this.scene, false);
    this.instances(cube, this.mat(0xffe3a1, 0, 0.5, 0xb78b46), approachLights, this.scene, false);
    const airfield = this.makeLabel('RUNWAY 36', '#e8f0d6', 'rgba(28,52,49,0.9)');
    airfield.position.set(-102, 3.5, 390); airfield.scale.set(17, 5, 1); this.scene.add(airfield);

    // The headland is a deliberate close-range wall on the lighthouse-to-bay leg.
    // Instancing gives strong vertical striations and parallax at modest draw cost.
    const cliffs: THREE.Matrix4[] = [], cliffCaps: THREE.Matrix4[] = [];
    for (let i = 0; i < 14; i++) {
      const x = 68 + Math.sin(i * 0.8) * 4, z = -631 - i * 9;
      const height = 12 + Math.sin(i * 0.57) * 4;
      cliffs.push(this.transform(x, height / 2 - 3, z, 24, height, 11));
      cliffCaps.push(this.transform(x - 1, height - 2.85, z, 22, 0.35, 10));
      this.solids.push({ box: new THREE.Box3(new THREE.Vector3(x - 12, -3, z - 5.5), new THREE.Vector3(x + 12, height - 3, z + 5.5)) });
    }
    this.instances(cube, this.mat(0x667870), cliffs);
    this.instances(cube, this.mat(0x879776), cliffCaps);
    const edgeMarks: THREE.Matrix4[] = [];
    for (let z = -450; z <= 240; z += 12) edgeMarks.push(this.transform(75.2, 0.95, z, 0.7, 0.5, 2.5));
    this.instances(cube, this.mat(0xd8c48e), edgeMarks, this.scene, false);

    // Wind cues consume the exact wind vector passed to the flight model.
    // No animation implies air movement when the weather model reports calm.
    for (const [x, z] of [[25, 145], [-54, 295], [69, -200], [55, -570]]) {
      this.cylinder(x, 3.5, z, 0.1, 7, 0xabb7a5, this.scene, 6);
      const pivot = new THREE.Group(); pivot.position.set(x, 6.8, z); this.scene.add(pivot);
      const cloth = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const segment = new THREE.Mesh(this.geom(`sock-${i}`, () => new THREE.CylinderGeometry(0.5 - i * 0.08, 0.42 - i * 0.08, 0.72, 8, 1, true)), this.mat(i % 2 ? 0xe9dfc0 : 0xce794c));
        segment.rotation.z = Math.PI / 2; segment.position.x = 0.36 + i * 0.68; cloth.add(segment);
      }
      pivot.add(cloth);
      this.windCues.push({ pivot, cloth, phase: x * 0.03 });
    }
    for (let i = 0; i < 12; i++) {
      const x = -194 - (i % 3) * 13, z = 90 - Math.floor(i / 3) * 68;
      const crown = new THREE.Group(); crown.position.set(x, 4, z); this.scene.add(crown);
      this.cylinder(x, 2, z, 0.25, 4, 0x655e4a, this.scene, 6);
      const leaves = new THREE.Mesh(this.geom('near-tree', () => new THREE.ConeGeometry(2.6, 8, 7)), this.mat(0x3c7562));
      leaves.position.y = 2; leaves.castShadow = true; crown.add(leaves); this.foliage.push(crown);
      this.solids.push({ box: new THREE.Box3(new THREE.Vector3(x - 0.35, 0, z - 0.35), new THREE.Vector3(x + 0.35, 10, z + 0.35)) });
    }
  }

  private buildLandscape(): void {
    const trunks: THREE.Matrix4[] = [], crowns: THREE.Matrix4[] = [], darkCrowns: THREE.Matrix4[] = [];
    let seed = 97131;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 300; i++) {
      const x = -210 - random() * 960;
      const z = -1550 + random() * 2500;
      const height = 7 + random() * 12;
      trunks.push(this.transform(x, height * 0.3, z, 0.5, height * 0.6, 0.5));
      crowns.push(this.transform(x, height * 0.7, z, height * 0.3, height * 0.7, height * 0.3));
      darkCrowns.push(this.transform(x, height * 0.9, z, height * 0.22, height * 0.6, height * 0.22));
      this.solids.push({ box: new THREE.Box3(new THREE.Vector3(x - 0.45, 0, z - 0.45), new THREE.Vector3(x + 0.45, height * 0.95, z + 0.45)) });
    }
    this.instances(this.geom('cylinder-6', () => new THREE.CylinderGeometry(1, 1, 1, 6)), this.mat(0x655e4a), trunks);
    const cone = this.geom('tree', () => new THREE.ConeGeometry(1, 1, 7));
    this.instances(cone, this.mat(0x2e6255), crowns);
    this.instances(cone, this.mat(0x3c7562), darkCrowns);

    // Broad, faceted ridgelines, far enough from the initial circuit to leave room.
    const hills: THREE.Matrix4[] = [], farHills: THREE.Matrix4[] = [];
    for (let i = 0; i < 28; i++) {
      const x = -1000 - random() * 1450;
      const z = -2500 + random() * 5300;
      const height = 120 + random() * 330;
      const rx = 300 + random() * 290, rz = 300 + random() * 260;
      hills.push(this.transform(x, -height * 0.22, z, rx, height, rz));
      this.hills.push({ x, z, rx, rz, height });
    }
    for (let i = 0; i < 16; i++) {
      const x = -2200 + i * 460;
      const height = 260 + random() * 430;
      farHills.push(this.transform(x, -height * 0.24, -3400 - random() * 900, 550, height, 650, random() * 6));
    }
    const rock = this.geom('rock', () => new THREE.IcosahedronGeometry(1, 1));
    this.instances(rock, this.mat(0x4b6e67), hills, this.scene, false);
    this.instances(rock, this.mat(0x668b87), farHills, this.scene, false);

    const shoreline: THREE.Matrix4[] = [];
    for (let i = 0; i < 95; i++) {
      const size = 2.5 + random() * 4;
      shoreline.push(this.transform(80 + random() * 7, -1.1, -650 + i * 11, size, size * 0.8, size, random() * 6));
    }
    this.instances(rock, this.mat(0x77857a), shoreline);

    // Broad cloud banks add both altitude and scale cues for the fixed-wing route.
    const cloudPuffs: THREE.Matrix4[] = [];
    for (let i = 0; i < 14; i++) {
      const x = -1600 + random() * 4600, z = -3300 + random() * 4400;
      const altitude = 310 + random() * 250;
      for (let p = 0; p < 5; p++) cloudPuffs.push(this.transform(x + (p - 2) * 55, altitude + Math.sin(p * 1.4) * 16, z + random() * 35, 74 + random() * 26, 25 + random() * 19, 48 + random() * 28));
    }
    const cloudMaterial = this.mat(0xe3e8e2, 0, 1, 0x879bac);
    cloudMaterial.emissiveIntensity = 0.45;
    this.instances(this.geom('cloud', () => new THREE.SphereGeometry(1, 10, 7)), cloudMaterial, cloudPuffs, this.scene, false);
  }

  private route(points: number[][], radius: number): void {
    let previous = this.spawn().position.clone();
    points.forEach((p, index) => {
      const position = new THREE.Vector3(p[0], p[1], p[2]);
      const normal = position.clone().sub(previous).normalize();
      this.gates.push({ position, normal, radius });
      previous = position;
      const group = new THREE.Group();
      group.position.copy(position);
      group.quaternion.setFromUnitVectors(FRONT, normal);
      const material = new THREE.MeshStandardMaterial({ color: 0x5ebfc4, roughness: 0.35, metalness: 0.25, emissive: 0x2b7f83, emissiveIntensity: 0.8 });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, radius > 20 ? 0.38 : 0.18, 6, 64), material);
      group.add(ring);
      // Four angular anchor details distinguish the race rings from decoration.
      for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2;
        const marker = this.box(Math.cos(angle) * radius, Math.sin(angle) * radius, 0, radius * 0.2, radius * 0.045, radius * 0.055, 0xdee8d9, group);
        marker.rotation.z = angle;
        marker.material = material;
      }
      const label = this.makeLabel(`${String(index + 1).padStart(2, '0')}`, '#f1e7ce', 'rgba(11,30,35,0.72)');
      label.position.set(0, radius + Math.max(1.8, radius * 0.13), 0);
      label.scale.set(radius * 0.45, radius * 0.23, 1);
      group.add(label);
      this.scene.add(group);
      this.gateVisuals.push({ group, ring, material });
    });
  }

  private makeLabel(text: string, color: string, background: string): THREE.Sprite {
    if (typeof document === 'undefined') return new THREE.Sprite();
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = background;
    ctx.beginPath(); ctx.roundRect(12, 12, 232, 104, 18); ctx.fill();
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.min(78, Math.floor(340 / Math.max(1, text.length)))}px monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 70);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  }

  private buildSpace(): void {
    this.scene.background = new THREE.Color(0x030912);
    this.scene.fog = null;
    this.ambient.color.set(0x537caf);
    this.ambient.groundColor.set(0x122a40);
    this.ambient.intensity = 1.6;
    this.sun.color.set(0xd8eaff);
    this.sun.intensity = 3;
    this.sun.position.set(-600, 500, 700);
    this.sun.castShadow = false;

    let seed = 41672;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const positions = new Float32Array(3500 * 3);
    const colors = new Float32Array(3500 * 3);
    for (let i = 0; i < 3500; i++) {
      const direction = new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize().multiplyScalar(7000 + random() * 7000);
      positions.set(direction.toArray(), i * 3);
      const intensity = 0.35 + random() * 0.65;
      colors.set([intensity * 0.8, intensity * 0.9, intensity], i * 3);
    }
    const stars = new THREE.BufferGeometry();
    stars.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    stars.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ size: 1.8, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false })));

    // A planet below the station provides a stable, unmistakable reference frame.
    const planetMaterial = new THREE.ShaderMaterial({
      uniforms: { lightDirection: { value: new THREE.Vector3(-0.5, 0.45, 0.7).normalize() } },
      vertexShader: `varying vec3 vNormal,vLocal; void main(){vNormal=normalize(normalMatrix*normal);vLocal=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `uniform vec3 lightDirection; varying vec3 vNormal,vLocal;
      float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f); return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      void main(){vec3 p=normalize(vLocal);float n=noise(p*5.)*.58+noise(p*13.)*.25+noise(p*35.)*.12+noise(p*95.)*.05;
      float land=smoothstep(.50,.55,n);vec3 c=mix(vec3(.015,.16,.24),vec3(.12,.31,.23),land);
      float clouds=smoothstep(.55,.69,noise(p*16.+vec3(9.))+noise(p*42.)*.24);c=mix(c,vec3(.72,.83,.85),clouds*.88);
      float pole=smoothstep(.79,.99,abs(p.y));c=mix(c,vec3(.74,.88,.91),pole);
      float light=max(dot(normalize(vNormal),normalize(vec3(-.5,.5,1.))),0.);c*=.12+light*1.2;gl_FragColor=vec4(c,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
    });
    const planet = new THREE.Mesh(new THREE.SphereGeometry(1450, 96, 64), planetMaterial);
    planet.position.set(1900, -1850, -3800);
    planet.rotation.z = 0.35;
    this.scene.add(planet);
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1495, 64, 48), new THREE.ShaderMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
      vertexShader: `varying vec3 vNormal,vView;void main(){vec4 p=modelViewMatrix*vec4(position,1.);vNormal=normalize(normalMatrix*normal);vView=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`,
      fragmentShader: `varying vec3 vNormal,vView;void main(){float rim=pow(clamp(1.+dot(normalize(vNormal),normalize(vView)),0.,1.),3.5);gl_FragColor=vec4(vec3(.1,.48,.83)*rim,rim*.52);}`,
    }));
    atmosphere.position.copy(planet.position);
    this.scene.add(atmosphere);

    this.buildStation();
    const debris: THREE.Matrix4[] = [];
    for (let i = 0; i < 120; i++) {
      let x = (random() - 0.5) * 1900;
      if (Math.abs(x) < 170) x += x < 0 ? -190 : 190;
      const size = 0.8 + random() * 7;
      debris.push(this.transform(x, (random() - 0.5) * 700, -1600 + random() * 2300, size, size * (0.5 + random()), size * 0.8, random() * 6));
    }
    this.instances(this.geom('asteroid', () => new THREE.IcosahedronGeometry(1, 0)), this.mat(0x627782, 0.1, 0.95), debris, this.scene, false);
    this.routeLabels = ['Departure lane', 'Station acquisition', 'Offset translation', 'Velocity matching', 'Final alignment', 'Dock approach'];
    this.route([[0, 8, 70], [0, 8, -30], [30, 15, -135], [0, 8, -250], [0, 8, -350], [0, 8, -425]], 13);
  }

  private buildStation(): void {
    const station = new THREE.Group();
    station.position.set(0, 8, -550);
    this.scene.add(station);
    this.stationRotor = new THREE.Group();
    station.add(this.stationRotor);
    const outerRing = new THREE.Mesh(new THREE.TorusGeometry(112, 6.2, 10, 96), this.mat(0x526b7a, 0.7, 0.48));
    this.stationRotor.add(outerRing);
    const trim = new THREE.Mesh(new THREE.TorusGeometry(113, 0.8, 6, 96), this.mat(0x75c9d4, 0.2, 0.35, 0x157b93));
    trim.position.z = 6;
    this.stationRotor.add(trim);
    const outerTrim = new THREE.Mesh(new THREE.TorusGeometry(119, 0.55, 5, 96), this.mat(0x1e3444, 0.7, 0.5));
    this.stationRotor.add(outerTrim);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      const x = Math.sin(a) * 112, y = Math.cos(a) * 112;
      const module = this.box(x, y, 0, 17, 25, 17, i % 3 ? 0xa6b4b6 : 0xbf8e57, this.stationRotor, false, 0.55);
      module.rotation.z = -a;
      const window = this.box(x, y, 8.7, 9, 12, 0.25, 0x77dce5, this.stationRotor);
      window.material = this.mat(0x76cad0, 0.2, 0.35, 0x1f879e);
      window.rotation.z = -a;
      const bay = this.makeLabel(`B${String(i + 1).padStart(2, '0')}`, '#dbebde', 'rgba(15,30,42,0.95)');
      bay.position.set(x, y, 10); bay.scale.set(12, 6, 1); this.stationRotor.add(bay);
      if (i % 3 === 0) {
        this.beam(new THREE.Vector3(Math.sin(a) * 22, Math.cos(a) * 22, -20), new THREE.Vector3(x, y, 0), 2.5, 0x647c89, this.stationRotor);
      }
    }
    const hub = this.cylinder(0, 0, -45, 20, 110, 0xb0bab8, station, 24);
    hub.rotation.x = Math.PI / 2;
    this.cylinder(0, -60, -90, 12, 86, 0x465f73, station);
    this.box(0, 0, -115, 42, 36, 35, 0x3e5569, station, false, 0.6);
    const panels: THREE.Matrix4[] = [], panelGrid: THREE.Matrix4[] = [];
    for (const side of [-1, 1]) {
      this.box(side * 145, 0, -110, 270, 3, 3, 0xa2aca7, station, false, 0.65);
      for (let i = 0; i < 4; i++) {
        const x = side * (80 + i * 57);
        panels.push(this.transform(x, 0, -110, 45, 142, 1.5));
        for (let j = -3; j <= 3; j++) panelGrid.push(this.transform(x, j * 20, -108.9, 45, 0.4, 0.5));
        for (let j = -1; j <= 1; j++) panelGrid.push(this.transform(x + j * 13, 0, -108.9, 0.35, 142, 0.5));
      }
    }
    this.instances(this.geom('box', () => new THREE.BoxGeometry(1, 1, 1)), this.mat(0x15395d, 0.72, 0.3), panels, station, false);
    this.instances(this.geom('box', () => new THREE.BoxGeometry(1, 1, 1)), this.mat(0x538199, 0.7, 0.4), panelGrid, station, false);

    // The front docking plane is open; the rear bulkhead remains a solid obstacle.
    this.dock = { position: new THREE.Vector3(0, 8, -490), quaternion: new THREE.Quaternion(), radius: 9 };
    const dockRing = new THREE.Mesh(new THREE.TorusGeometry(11.5, 1.8, 8, 32), this.mat(0xc7ceba, 0.6, 0.5));
    dockRing.position.copy(this.dock.position);
    this.scene.add(dockRing);
    const dockLight = new THREE.Mesh(new THREE.TorusGeometry(9.5, 0.2, 5, 48), this.mat(0x86dce0, 0.3, 0.25, 0x2be8df));
    dockLight.position.copy(this.dock.position).add(new THREE.Vector3(0, 0, 0.2));
    this.scene.add(dockLight);
    const label = this.makeLabel('A-01', '#b5fff1', 'rgba(4,20,35,0.8)');
    label.position.copy(this.dock.position).add(new THREE.Vector3(0, 18, 0));
    label.scale.set(18, 9, 1);
    this.scene.add(label);
    this.dockGuidance = new THREE.Group(); this.dockGuidance.name = 'Dock guidance';
    this.dockGuidance.visible = false; this.scene.add(this.dockGuidance);
    const laneLights: THREE.Matrix4[] = [], ticks: THREE.Matrix4[] = [];
    for (let i = 0; i < 14; i++) {
      const z = this.dock.position.z + 10 + i * 10;
      for (const side of [-1, 1]) {
        laneLights.push(this.transform(side * 14, 8, z, 0.3, 0.3, 2));
        ticks.push(this.transform(side * 14, -6, z, 3, 0.22, 0.3));
      }
      if (i % 5 === 4) {
        const distance = this.makeLabel(`${(i + 1) * 10} m`, '#9ce7e4', 'rgba(4,20,35,0.8)');
        distance.position.set(21, 0, z); distance.scale.set(10, 5, 1); this.dockGuidance.add(distance);
      }
    }
    this.instances(this.geom('box', () => new THREE.BoxGeometry(1, 1, 1)), this.mat(0x86dce0, 0.1, 0.4, 0x24a9c7), laneLights, this.dockGuidance, false);
    this.instances(this.geom('box', () => new THREE.BoxGeometry(1, 1, 1)), this.mat(0x58878b, 0.3, 0.5, 0x153336), ticks, this.dockGuidance, false);
    // An asymmetric roll reference makes the correct target orientation unambiguous.
    const orientationFrame = new THREE.Group(); orientationFrame.position.copy(this.dock.position).add(new THREE.Vector3(0, 0, 0.6));
    this.dockGuidance.add(orientationFrame);
    for (const side of [-1, 1]) this.box(side * 7.5, 0, 0, 2.3, 0.25, 0.3, 0x8fe1d9, orientationFrame);
    this.box(0, 8.1, 0, 0.5, 3.6, 0.4, 0xffc276, orientationFrame);
    this.box(0, -8.1, 0, 3.5, 0.3, 0.4, 0x83d3d0, orientationFrame);
    const upLabel = this.makeLabel('UP', '#ffd99b', 'rgba(4,20,35,0.8)');
    upLabel.position.set(0, 13, 0); upLabel.scale.set(5, 2.5, 1); orientationFrame.add(upLabel);

    // A maintenance tug follows a slow, bounded route outside the approach volume.
    this.serviceTug = new THREE.Group(); this.serviceTug.name = 'Station maintenance tug';
    this.box(0, 0, 0, 5, 3, 8, 0xb9a476, this.serviceTug, false, 0.5);
    this.box(0, 1.8, -1, 3, 1, 3, 0x24445a, this.serviceTug);
    for (const side of [-1, 1]) this.box(side * 3.6, 0, 1, 1.8, 1.8, 5, 0x416579, this.serviceTug);
    this.serviceTug.position.set(175, 35, -550); this.scene.add(this.serviceTug);
    this.solids.push({ box: new THREE.Box3(new THREE.Vector3(-20, -12, -650), new THREE.Vector3(20, 28, -510)) });
  }

  private buildVehicle(): void {
    this.vehicle = new THREE.Group();
    if (this.mode === 'drone') {
      this.box(0, 0, 0, 0.42, 0.16, 0.62, 0x152b35, this.vehicle, false, 0.4);
      this.box(0, 0.13, 0.08, 0.23, 0.15, 0.36, 0xefb35a, this.vehicle);
      for (const x of [-0.43, 0.43]) for (const z of [-0.43, 0.43]) {
        this.beam(new THREE.Vector3(0, 0, 0), new THREE.Vector3(x, 0, z), 0.043, 0x253a43, this.vehicle);
        this.cylinder(x, 0.06, z, 0.077, 0.15, 0x30454e, this.vehicle, 12);
        const rotor = new THREE.Group();
        rotor.position.set(x, 0.15, z);
        this.box(0, 0, 0, 0.59, 0.015, 0.062, z < 0 ? 0xebc579 : 0x59adb5, rotor);
        this.propellers.push(rotor);
        this.vehicle.add(rotor);
      }
      this.box(0, 0.03, -0.32, 0.14, 0.13, 0.09, 0x0d1e29, this.vehicle);
    } else if (this.mode === 'plane') {
      const fuselage = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 4.3, 6, 12), this.mat(0xd8ded0, 0.15, 0.5));
      fuselage.rotation.x = Math.PI / 2;
      fuselage.position.z = 0.15;
      fuselage.castShadow = true;
      this.vehicle.add(fuselage);
      this.box(0, 0.03, 0.1, 10.8, 0.13, 1.45, 0xe4e2c9, this.vehicle);
      this.box(-4.3, 0.04, 0.1, 1, 0.16, 1.5, 0xc97946, this.vehicle);
      this.box(4.3, 0.04, 0.1, 1, 0.16, 1.5, 0xc97946, this.vehicle);
      this.box(0, 0.15, 2.4, 3.3, 0.11, 0.85, 0xb8c6bf, this.vehicle);
      this.box(0, 0.8, 2.2, 0.14, 1.5, 1.2, 0xd09b57, this.vehicle);
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.65, 16, 12), this.mat(0x234e5d, 0.55, 0.24));
      canopy.scale.set(0.72, 0.6, 1.8);
      canopy.position.set(0, 0.42, -0.8);
      this.vehicle.add(canopy);
      const prop = new THREE.Group();
      prop.position.set(0, 0, -2.7);
      this.box(0, 0, 0, 2.1, 0.13, 0.09, 0x263e47, prop);
      this.propellers.push(prop);
      this.vehicle.add(prop);
    } else {
      this.box(0, 0, 0, 2.1, 0.85, 4.4, 0xb1c1c4, this.vehicle, false, 0.7);
      this.box(0, 0.55, -0.7, 1.25, 0.5, 1.8, 0x17344c, this.vehicle, false, 0.6);
      for (const side of [-1, 1]) {
        this.box(side * 2, -0.1, 0.7, 1.05, 0.7, 3.2, 0x38586b, this.vehicle, false, 0.65);
        this.box(side * 1.15, -0.1, 0.35, 1.4, 0.23, 1.7, 0xc5ad74, this.vehicle, false, 0.5);
        const nozzle = this.cylinder(side * 2, -0.1, 2.5, 0.37, 0.55, 0x1a2c3b, this.vehicle);
        nozzle.rotation.x = Math.PI / 2;
      }
      this.engineMaterial = new THREE.MeshBasicMaterial({ color: 0x63e6ff, transparent: true, opacity: 0.8 });
      for (const x of [-2, 2]) {
        const glow = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.5, 12), this.engineMaterial);
        glow.rotation.x = Math.PI / 2;
        glow.position.set(x, -0.1, 3.1);
        this.vehicle.add(glow);
      }
    }
  }

  setWeather(weather: Weather): void {
    this.weather = weather;
    if (this.mode === 'space') return;
    const dusk = weather === 'dusk';
    const windy = weather === 'windy';
    const horizon = dusk ? 0xb4968b : windy ? 0xa3bec0 : 0xc8d2c2;
    this.scene.background = new THREE.Color(horizon);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.set(horizon);
      this.scene.fog.density = (this.mode === 'plane' ? 0.00022 : 0.0005) * (windy ? 1.45 : 1);
    }
    this.ambient.color.set(dusk ? 0x8ba8c5 : 0xc5e1e6);
    this.ambient.groundColor.set(dusk ? 0x494158 : 0x496355);
    this.ambient.intensity = dusk ? 1.6 : 2;
    this.sun.color.set(dusk ? 0xffb579 : 0xffdbab);
    this.sun.intensity = dusk ? 3.1 : windy ? 2.3 : 3.4;
    if (this.skyMaterial) {
      this.skyMaterial.uniforms.topColor.value.set(dusk ? 0x304f72 : windy ? 0x648d99 : 0x337f96);
      this.skyMaterial.uniforms.horizonColor.value.set(horizon);
      this.skyMaterial.uniforms.sunColor.value.set(dusk ? 0xffa165 : 0xffdfae);
      this.skyMaterial.uniforms.sunDirection.value.set(-0.42, dusk ? 0.075 : 0.23, -0.85).normalize();
    }
    if (this.waterMaterial) {
      this.waterMaterial.uniforms.deepColor.value.set(dusk ? 0x17394a : 0x174a55);
      this.waterMaterial.uniforms.sunColor.value.set(dusk ? 0xe9a076 : 0xf5d2a6);
      this.waterMaterial.uniforms.wave.value = windy ? 0.45 : 0.17;
    }
  }

  setGateProgress(index: number): void {
    this.activeGate = index;
    this.gateVisuals.forEach((visual, i) => {
      visual.group.visible = index >= 0;
      const active = i === index;
      const complete = i < index;
      visual.material.color.set(active ? 0xffcb79 : complete ? 0x559c83 : 0x58b7c1);
      visual.material.emissive.set(active ? 0xe08a2d : complete ? 0x224c3b : 0x17656f);
      visual.material.emissiveIntensity = active ? 1.8 : 0.65;
    });
  }

  setDockGuidance(visible: boolean): void {
    if (this.dockGuidance) this.dockGuidance.visible = visible;
  }

  physicsSnapshot():WorldPhysics {
    return {mode:this.mode,solids:this.solids.map(s=>({min:s.box.min.toArray() as [number,number,number],max:s.box.max.toArray() as [number,number,number]})),hills:this.hills.map(h=>({...h})),pad:{position:this.landingPad.position.toArray() as [number,number,number],radius:this.landingPad.radius}};
  }

  setCustomGates(gates:Gate[]):void {
    for(const visual of this.gateVisuals){this.scene.remove(visual.group);visual.group.traverse(object=>{const mesh=object as THREE.Mesh;mesh.geometry?.dispose();});visual.material.dispose();}
    this.gates=[];this.gateVisuals=[];this.routeLabels=[];
    for(let i=0;i<gates.length;i++){
      const gate=gates[i];this.gates.push({position:gate.position.clone(),normal:gate.normal.clone().normalize(),radius:gate.radius});this.routeLabels.push(`Custom gate ${i+1}`);
      const material=new THREE.MeshStandardMaterial({color:0xd8fb90,emissive:0x719c42,emissiveIntensity:1.2});
      const ring=new THREE.Mesh(new THREE.TorusGeometry(gate.radius,.18,8,48),material);const group=new THREE.Group();group.add(ring);group.position.copy(gate.position);group.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),gate.normal.clone().normalize());this.scene.add(group);this.gateVisuals.push({group,ring,material});
    }
    this.setGateProgress(gates.length?0:-1);
  }

  update(dt: number, time: number, state: FlightState, wind?: THREE.Vector3): void {
    this.vehicle.position.copy(state.position);
    this.vehicle.quaternion.copy(state.quaternion);
    for (const propeller of this.propellers) {
      if (this.mode === 'plane') propeller.rotation.z += dt * (30 + state.throttle * 200);
      else propeller.rotation.y += dt * (30 + state.throttle * 220);
    }
    if (this.waterMaterial) this.waterMaterial.uniforms.time.value = time;
    if (this.stationRotor) this.stationRotor.rotation.z = time * 0.006;
    if (this.serviceTug) {
      this.serviceTug.position.set(175 + Math.sin(time * 0.04) * 23, 35 + Math.sin(time * 0.025) * 14, -550 + Math.cos(time * 0.04) * 25);
      this.serviceTug.rotation.y = -time * 0.04;
    }
    if (this.engineMaterial) this.engineMaterial.opacity = 0.4 + Math.min(state.airspeed / 40, 0.5) + Math.sin(time * 31) * 0.08;
    if (this.mode !== 'space') {
      this.sun.position.set(state.position.x - 420, state.position.y + (this.weather === 'dusk' ? 75 : 230), state.position.z - 850);
      this.sun.target.position.copy(state.position);
      this.sun.target.updateMatrixWorld();
      if (wind) this.windDirection.copy(wind); else this.windDirection.set(0, 0, 0);
      this.windDirection.y = 0;
      const strength = Math.min(1, this.windDirection.length() / 8);
      const heading = Math.atan2(-this.windDirection.z, this.windDirection.x);
      for (const cue of this.windCues) {
        cue.pivot.rotation.y = heading;
        cue.cloth.rotation.z = -(1 - strength) * 1.35;
        cue.cloth.rotation.y = Math.sin(time * (3 + strength * 2) + cue.phase) * 0.1 * strength;
      }
      for (let i = 0; i < this.foliage.length; i++) {
        const sway = (0.65 + Math.sin(time * 1.7 + i * 1.8) * 0.35) * 0.009;
        this.foliage[i].rotation.z = -this.windDirection.x * sway;
        this.foliage[i].rotation.x = this.windDirection.z * sway;
      }
    }
    const active = this.gateVisuals[this.activeGate];
    if (active) active.material.emissiveIntensity = 1.6 + Math.sin(time * 2.5) * 0.3;
  }

  groundHeight(x: number, z: number): number {
    if (this.mode === 'space') return -Infinity;
    let ground = x >= -1400 && x <= 70 && z >= -2200 && z <= 800 ? 0 : -3;
    if (x > 70 && x <= 147.5 && (Math.abs(z + 68) < 11 || Math.abs(z + 423) < 11)) ground = 0.3;
    if (Math.hypot(x - this.landingPad.position.x, z - this.landingPad.position.z) <= this.landingPad.radius) ground = this.landingPad.position.y;
    // Ellipsoidal collision envelopes approximate the distant faceted ridgelines.
    for (const hill of this.hills) {
      const d = ((x - hill.x) / hill.rx) ** 2 + ((z - hill.z) / hill.rz) ** 2;
      if (d < 1) ground = Math.max(ground, hill.height * (Math.sqrt(1 - d) - 0.22));
    }
    return ground;
  }

  isWater(x: number, z: number): boolean {
    return this.mode !== 'space' && this.groundHeight(x, z) <= -2.99;
  }

  /** Metres to the nearest collision surface, clamped to the requested horizon. */
  proximity(position: THREE.Vector3, maxDistance = 80): number {
    let distance = Math.max(0, Number.isFinite(maxDistance) ? maxDistance : 80);
    if (this.mode !== 'space') distance = Math.min(distance, Math.max(0, position.y - this.groundHeight(position.x, position.z)));
    else {
      const radial = Math.hypot(position.x, position.y - 8);
      distance = Math.min(distance, Math.max(0, Math.hypot(radial - 112, position.z + 550) - 6.2));
      for (const side of [-1, 1]) {
        const dx = Math.max(57.5 - position.x * side, 0, position.x * side - 273.5);
        const dy = Math.max(0, Math.abs(position.y - 8) - 71);
        const dz = Math.max(0, Math.abs(position.z + 660) - 1.5);
        distance = Math.min(distance, Math.hypot(dx, dy, dz));
      }
    }
    for (const solid of this.solids) distance = Math.min(distance, solid.box.distanceToPoint(position));
    return distance;
  }

  collides(position: THREE.Vector3, radius: number): boolean {
    if (this.mode === 'space') {
      const radial = Math.hypot(position.x, position.y - 8);
      const tubeDistance = Math.hypot(radial - 112, position.z + 550);
      if (tubeDistance < 6.2 + radius) return true;
      if (Math.abs(position.z + 660) < 1.5 + radius && Math.abs(position.y - 8) < 71 + radius && Math.abs(position.x) > 57.5 - radius && Math.abs(position.x) < 273.5 + radius) return true;
    }
    for (const solid of this.solids) {
      const b = solid.box;
      const x = Math.max(b.min.x, Math.min(position.x, b.max.x));
      const y = Math.max(b.min.y, Math.min(position.y, b.max.y));
      const z = Math.max(b.min.z, Math.min(position.z, b.max.z));
      if ((position.x - x) ** 2 + (position.y - y) ** 2 + (position.z - z) ** 2 < radius * radius) return true;
    }
    return false;
  }

  dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    this.geometries.forEach(geometry => geometries.add(geometry));
    this.materials.forEach(material => materials.add(material));
    this.surfaceTextures.forEach(texture => textures.add(texture));
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    textures.forEach(texture => texture.dispose());
    this.sun?.shadow.map?.dispose();
    this.geometries.clear(); this.materials.clear(); this.surfaceTextures.clear();
    this.scene.clear();
    this.vehicle.clear();
    this.windCues = []; this.foliage = []; this.propellers = []; this.gateVisuals = [];
    this.dockGuidance = undefined; this.serviceTug = undefined; this.stationRotor = undefined;
  }
}
