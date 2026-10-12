# FlightLab 0.6

An English-language browser flight playground and flight-control laboratory. Fly a quadrotor through a coastal harbor, take a fixed-wing aircraft off from a mountain airfield, or maneuver a spacecraft around an orbital shipyard. Use the keyboard, a standard gamepad, or an explicitly configured USB RC transmitter.

This release combines the v0.4 controller and rigid-body work, v0.5 fixed-wing/RCS/contact models, and v0.6 configurable experiments and replay analysis. Flight school, the harbor circuit, docking guidance, procedural audio and camera comfort controls remain available.

## Start on Windows

Double-click **`launch.cmd`**, or run:

```powershell
.\launch.cmd
```

Open **http://127.0.0.1:4188/**. Keep the launcher window open while playing; Ctrl+C stops the server.

The launcher selects Node.js 22.12 or newer, including an existing Codex-bundled runtime when the system Node is older. It installs missing dependencies without changing the global Node installation.

```powershell
.\launch.cmd -NoBrowser
.\launch.cmd -InstallOnly
.\launch.cmd -BuildOnly
.\launch.cmd -Preview
```

With a suitable Node.js installation on PATH:

```sh
npm ci
npm run dev
npm test
npm run test:sitl
npm run build
npm run preview
```

Use a recent desktop Chrome or Edge with WebGL 2 and hardware acceleration. Gamepad access requires localhost or HTTPS. Ordinary flight is entirely local: no account, cloud service, remote textures, or firmware installation is required. The optional firmware bridge is a separate local process described in [README-SITL.md](README-SITL.md).

## Release scope

| Area | Implemented behavior |
| --- | --- |
| v0.4: control core | Torque-driven rigid-body rotation; four independent rotor responses; attitude/rate feedback, PID and motor mixing; simulated IMU; configurable control inputs; arm/disarm |
| v0.5: vehicle dynamics | Fixed-wing surfaces and servos; aerodynamic moments and trim; 24 spacecraft jets; propellant and mass change; friction, restitution and damage |
| v0.6: experimentation | Airframe/control editor; wind, gravity, gates, moving docking target and scheduled faults; 240 Hz simulation worker; rate/actuator telemetry; recording, replay and JSON exchange |
| External firmware | Local Betaflight/PX4 protocol bridge, browser transport and setup scripts; real firmware execution remains an integration acceptance task |

The models are configurable approximations. A feedback loop and force/torque integration make behavior physically interpretable, but do not establish fidelity to a particular aircraft without flight measurements. The project does not claim measured airframe identification or real-world pilot training validity.

## Fly and experiment

Choose a vehicle and activity, then **Let's fly**. Free exploration starts the drone near a hover and the airplane airborne. **Flight school** provides maneuver-based lessons; **Runway departure** starts the airplane on the ground. **Gate run** and **Precision docking** retain their authored routes and targets.

Open **Flight workshop** from the selection screen, or press **L** during flight. Its sections are:

1. **Airframe & control:** Mass, principal-axis inertia, center of mass, propulsion, control gains, sensors and contact parameters. Quadrotors add independent motor X/Z offsets. Fixed-wing fields add wing geometry, aerodynamic coefficients, servo response and elevator trim. Spacecraft fields add propellant, thrust, torque, specific impulse, RCS arm length and pitch/yaw/roll jet-arm offsets.
2. **Input setup:** Channel sources, button pairs, response curves, throttle behavior and RC presets for the connected device.
3. **Mission editor:** Starting position, velocity, heading and throttle; wind, gust amplitude, wind seed and uniform gravity; up to 64 route gates; and a scheduled actuator, sensor or wind fault. Space experiments can move the docking target laterally with adjustable amplitude and period.
4. **Flight analysis:** Target versus measured angular rates, error statistics and recorded flight; replay, export or import a recording.
5. **External flight controller:** Optional local Betaflight/PX4 connection for quadrotor experiments.

**Save airframe** applies configuration to subsequent flights. **Save mission** stores the scenario; **Run experiment** launches it. Export/import an experiment to retain both vehicle settings and its scenario. Input profiles and flight recordings have separate import/export controls.

Custom experiments start disarmed by default. Lower throttle, then press **V / Back / Share** to arm. Ordinary activities start ready to fly. The HUD reports armed state and control mode. Custom experiments also show target/measured rates, actuator output, physical state and input.

Suggested first experiments:

- Increase quadrotor mass while keeping maximum rotor thrust constant. Level steady hover needs collective approximately `mass × gravity / total maximum thrust`.
- Change rate proportional gain or motor response time, then compare target/measured curves after the same short stick movement.
- Disable fixed-wing assistance and adjust elevator trim. Compare pitch response at different airspeeds.
- Disable spacecraft assistance, apply a short rotational command, then release it. Observe continued rotation; use Brake for active stabilization. Set propellant to zero to compare an unpowered coast.

Settings can produce an underpowered or unstable aircraft. **Factory values** and **Reset mission** restore a reference setup for the selected mode.

## Dynamics and flight-control modes

| Vehicle | Physics and actuators | Control |
| --- | --- | --- |
| Quadrotor | Editable four-rotor geometry, per-rotor thrust/reaction torque, motor speed response, center-of-mass offsets, drag and inertia | Angle, Acro, Altitude hold, Position hold |
| Fixed wing | Lift/drag, angle-of-attack stall, sideslip, damping/stability moments, elevator/aileron/rudder authority, servo lag and trim | Assisted or Manual |
| Spacecraft | Six-degree-of-freedom rigid body, 24 RCS jets in force/torque pairs, propellant consumption, changing mass and inertia | Assisted or Manual; active Brake |

**Angle** converts stick pitch/roll into attitude targets. **Acro** produces body-rate targets; releasing the stick commands zero rate rather than a level attitude. The inner PID produces torque demand, mixed into bounded motor commands. Conditional integration and allocation feedback limit windup when actuators saturate.

**Altitude hold** and **Position hold** capture targets when selected. Throttle center is 50%; moving away from center requests climb/descent. Position mode moves a horizontal target from stick input. These helpers use position/velocity observations with configurable noise and sensor delay; this observation model is not a full GNSS/barometer estimator.

The IMU supplies gyro and accelerometer samples with adjustable noise, bias, delay and filtering. Position and velocity observations have separate noise settings and share the sensor delay. Orientation is propagated from measured rates, with accelerometer correction when specific force is consistent with a low-acceleration gravity reference. Ideal sensors are the default; noisy observations feed the hold controllers.

Fixed-wing manual input commands surfaces. Dynamic pressure sets aerodynamic authority, so control becomes less effective at low speed. Assistance uses the same actuators. Lift/stall curves and coefficients are analytic approximations, not a JSBSim airframe model or wind-tunnel dataset.

Spacecraft Manual mode retains linear and angular momentum after controls are released. Brake requests powered linear/angular stabilization; Assisted mode tracks translational velocity and body-rate targets. Thruster impulses consume propellant; zero fuel prevents powered correction. Center-of-mass offsets couple forces and moments. Scenario gravity is uniform downward acceleration, not orbital gravity.

Contacts sweep vehicle spheres against authored terrain and simplified obstacles. Moderate impacts can bounce, slide and accumulate damage; severe impacts end the flight. This is not a deformable-airframe or multi-wheel landing-gear solver. Quadrotor motor X/Z offsets change physical lever arms and the allocation matrix. Spacecraft jet-arm offsets change the pitch/yaw/roll pairs. Topology remains four rotors, one fixed-wing model and 24 paired jets: custom motor counts, arbitrary nozzle orientations and imported airframes are outside this editor.

## Controls

| Action | Keyboard | Standard gamepad |
| --- | --- | --- |
| Drone / plane pitch | Up / Down arrows | Right stick Y |
| Drone / plane roll | Left / Right arrows | Right stick X |
| Drone / plane yaw | A / D | Left stick X |
| Increase / decrease throttle | W / S | Left stick up / down |
| Spacecraft pitch / yaw | Arrow keys | Right stick |
| Spacecraft forward / backward | W / S | RT / LT |
| Spacecraft strafe | A / D | Left stick X |
| Spacecraft up / down | X / Z | Left stick Y |
| Spacecraft roll | Q / E | LB / RB |
| Brake | Space | A / Cross |
| Boost | Shift | Left stick click |
| Flight assistance | F | B / Circle |
| Chase / first-person camera | C | X / Square |
| Restart | R | Y / Triangle |
| Arm / disarm | V | Back / Share |
| Pause / resume | Escape | Start / Options |
| Flight workshop | L | Workshop menu button |

Pull pitch back or press Down Arrow to raise the nose. Pitch can be inverted. Incremental throttle holds its setting when centered; absolute throttle maps its calibrated axis directly to 0–100%. W/S supplies an incremental keyboard command while held.

**Gentle**, **Balanced** and **Sport** set command authority separately from physical parameters and input curves. Lessons use the reference airframe, Gentle handling, assistance and calm air. Challenge settings are restricted during a run; free flight and experiments permit more control changes.

### Controller profiles

Connect the controller and press a button so the browser exposes it. **Flight settings** controls general deadzone, sensitivity, expo, vibration and action bindings. **Workshop → Input setup** offers:

- Axis, positive/negative button pair, or disabled source for each channel.
- Zero-based axis index 0–31 or button indices 0–63, with inversion.
- Independent deadzone, expo, normalized output scale and center response. `−1` in the deadzone/expo editor inherits Flight settings.
- Separate spacecraft rotation bindings and independent translation channels.
- Incremental or absolute collective. Absolute throttle deliberately uses an affine full-range mapping instead of the centered attitude response curve.

**RC Mode 1** uses left Y pitch and right Y throttle. **RC Mode 2** uses left Y throttle and right Y pitch. Both use left X yaw and right X roll, assuming left X/Y report as axes 0/1 and right X/Y as 2/3. Adapters can report another order; inspect and remap channels for the actual device. Standard and Southpaw presets use incremental throttle; RC presets use absolute throttle and explicitly opt into non-standard USB mapping.

Unknown USB controllers stay inactive until enabled or assigned an RC preset. Generic USB devices use keyboard menus because their buttons lack universal menu semantics. Keyboard flight remains available. Profiles, calibration and action bindings are saved per detected controller ID; connect the intended device before configuring it.

Action buttons cannot also serve a configured channel's button pair. Conflicting action assignments swap; changing channel assignments relocates conflicting actions. Standard menu buttons remain fixed.

### Menus and calibration

Standard menus use **D-pad / Left stick** to navigate, **A / Cross** to activate, **B / Circle** to go back and **Start / Options** to pause/resume. Keyboard arrows, Enter/Space and Escape provide the same navigation. Left/Right adjusts a focused setting; A cycles select values.

After a menu transition or mapping change, release controls before flying. Absolute throttle must be at idle, not center, to clear the input gate.

1. Center all mapped axes, including RC throttle, then choose **Set stick center**. Large off-center readings are rejected.
2. Choose **Calibrate full travel** and sweep every used axis to both ends, including configured additional axes.
3. Finish the sweep. Incomplete travel keeps calibration open so you can continue.
4. Return absolute throttle to idle before leaving settings. **Reset calibration** restores the uncalibrated range.

Unused RC sliders do not need to center. During the sweep, stick motion does not navigate menus; use D-pad or keyboard. Closing settings cancels only the unfinished sweep and preserves saved calibration.

Controller disconnection, a hidden tab or lost browser focus pauses flight. Physical USB/Bluetooth controllers and haptics still require device-specific verification; software fixtures cannot establish hardware compatibility.

## Activities and visual perception

- **Free exploration:** Practice throughout the selected environment.
- **Flight school:** Live progress for takeoff/hover/turn/brake, fixed-wing takeoff/bank/cruise/approach, or spacecraft translation/braking/alignment/docking.
- **Gate run:** Directional crossings, timing and local personal-best ghosts. The 15-gate harbor route passes through a warehouse, under a bridge, around cliffs and across the bay.
- **Runway departure:** Fixed-wing ground start.
- **Precision docking:** Match orientation, slow below 1.4 m/s and stay inside the capture radius for two seconds.
- **Custom experiment:** Stored mission, optional route or moving target, configured airframe and scheduled fault.

The HUD combines airspeed/relative speed, terrain clearance, vertical speed, heading, throttle, attitude and mission state. Dock guidance adds target-local offsets, closing speed, lateral drift, alignment and estimated braking distance. The estimate depends on available thrust, assistance and fuel and cannot guarantee collision avoidance. Moving experiment targets follow authored motion, not independent orbits.

Warehouse corridors, runway markings, cranes, bridge supports, lighthouse, trees, windsocks, station bays and docking lights give near-field scale cues. Ocean, haze, stars, planet shading and synthesized engine/wind/thruster audio provide depth and motion feedback. Geometry and audio are generated locally.

Chase/first-person cameras offer 60–105° FOV, smoothing, shake, speed-based FOV and FPV horizon stabilization. **Apply comfort camera** gives a quieter starting point. Quality settings adjust resolution/shadows; obstruction checks pull the chase camera closer to scenery. Audio begins after a user gesture.

## Recording and analysis

Every new flight starts a fresh in-memory recording. Regular samples run at up to 30 Hz, retaining at most 18,000 frames, approximately ten minutes of continuous flight. A terminal crash is captured immediately even between regular samples. At capacity, that event replaces only the final sample; the recording's beginning is retained. Other full-buffer samples are ignored. Paused wall-clock time is not flight time.

Snapshots retain pose, velocities, controls, state and telemetry: requested/actual actuators, PID terms, measured/target rates, sensors, mass, fuel and damage. They also retain vehicle configuration and the custom scenario, including its wind seed when present.

**Workshop → Flight analysis** shows pitch/roll/yaw tracking, duration, distance, top speed, sample count and rate errors. RMS/peak error uses the magnitude of the three-axis target-minus-measured rate vector in rad/s. Distance is sampled trajectory length, not an exact continuous path integral.

External-firmware recordings display measured rates without a target curve or tracking-error metrics: the bridge does not transmit the firmware's rate targets or PID terms. The raw recording's target/PID fields are built-in-model diagnostics, not firmware telemetry. Their values must not be interpreted as measurements of the external controller.

Replay interpolates position and quaternion orientation, selecting the nearest frame's input and telemetry. It restores recorded poses; it does not rerun the controller. Export JSON before another flight or page reload to retain the recording. Import validation rejects malformed values, unsupported versions, nonfinite numbers and oversized arrays.

Vehicle settings, scenarios, controller profiles, lesson completion and best-flight ghosts use browser local storage. Full recordings remain in memory until exported. Clearing site data removes preferences; no cloud synchronization is provided.

## Optional firmware connection

```powershell
.\bridge\start.ps1 -Diagnose
.\bridge\start.ps1
```

With Node on PATH:

```sh
npm run diagnose:sitl
npm run sitl
npm run test:sitl
```

The local bridge listens at `ws://127.0.0.1:4190/sitl`, supporting pinned Betaflight 4.5.2 or PX4 v1.16 simulation protocols. Quadrotor external control waits for each matching actuator response before advancing physics. Failure halts that path instead of substituting built-in control.

Read [README-SITL.md](README-SITL.md) for exact revisions, toolchains, ports, coordinate/motor order, arming and timeouts. A connected bridge or successful mock transport test does not establish stable firmware flight. Real Betaflight/PX4 builds and flight behavior have not been verified on this host. Launchers do not install an OS, compiler or firmware.

## Architecture

```text
Input → control-mode targets → PID / actuator commands
  ↑                                    ↓
UI and telemetry ← sensors ← rigid body ← forces and torques
```

Units are meters and seconds, with Y-up and local −Z-forward. Angular velocities are body XYZ in rad/s; X is pitch, Y yaw and Z roll, with UI signs converted at the control boundary. Physics uses fixed 1/240-second steps. A Web Worker normally owns integration; a main-thread fallback uses the same runner if worker construction is unavailable.

The renderer receives snapshots while input, cameras, HUD and sound run on the main thread. One worker batch is outstanding at a time; restart generations reject obsolete replies. Large elapsed gaps are capped, so severe stalls can slow simulated time rather than producing an unbounded catch-up loop.

Rotation advances world angular momentum and recovers body rates from the rotated principal-axis inertia. Actuator forces act relative to center of mass. Static scenery uses instancing and simplified collision shapes; render geometry is not a general collision mesh.

```text
src/
  main.ts                 Application, activities, HUD and integration
  workshop.ts             Airframe, input, mission and analysis UI
  physics.ts              Forces, torques, rigid body and contacts
  controller.ts           Rate PID and simulated IMU/orientation estimate
  vehicle-config.ts       Bounded physical parameters per vehicle
  simulation.ts           Shared fixed-step runner and snapshots
  simulation.worker.ts    Worker message boundary
  simulation-client.ts    Worker lifecycle and fallback
  environment.ts          Serializable collision environment
  scenario.ts             Missions, seeded wind, gates and moving targets
  recorder.ts             Recording, interpolation, imports and statistics
  input.ts                Keyboard/gamepad polling, calibration and haptics
  axis-profile.ts         Channel mappings and RC presets
  sitl-client.ts          External-controller transport and coordinates
  world.ts                Procedural scenery and vehicles
  training.ts             Maneuver-based lessons
  navigation.ts           Dock guidance and braking estimates
  camera-rig.ts           Cameras, obstruction and comfort
  menu-controls.ts        Scoped menu navigation
  challenges.ts           Gates and best-flight ghosts
  audio.ts                Synthesized flight feedback
bridge/
  server.mjs              Local WebSocket / UDP / TCP bridge
  protocol.mjs            Betaflight and MAVLink codecs
  diagnose.mjs            Read-only toolchain inventory
  setup-*.sh              Pinned firmware setup/build helpers
  mock-firmware.mjs       Explicit protocol fixture, not real firmware
tests/                    Simulation and interface tests
```

## Verification and limits

`npm test` covers input, recording, scenarios, numerical dynamics, environments, navigation, cameras, audio, lessons and the browser protocol client. `npm run test:sitl` covers bridge codecs and localhost transport fixtures. `npm run build` checks TypeScript and builds `dist/`. Passing these checks does not prove agreement with aircraft measurements.

The October 12, 2026 acceptance run passed 203 application tests, 12 bridge tests, TypeScript and the production build. Browser checks covered all three vehicles, airframe/mission saving, RC presets and custom mappings, arm/disarm, control modes, moving-target guidance, recording/replay, and the production Worker. The live localhost MOCK fixture verified actuator exchange, paused-flight reconnection and timeout/disarm behavior; the bridge suite also exercised 20 consecutive reconnects. No browser console errors appeared during the final production checks. The temporary bridge and MOCK processes were stopped afterward.

Physical controllers, vibration, real firmware and sustained target-GPU performance require manual verification. Current model limits include simplified noisy position/velocity observations, analytic aerodynamic coefficients, simplified contacts, bounded actuator-geometry editing, finite authored worlds and uniform gravity. There is no orbital propagation, terrain streaming, structural deformation or multiplayer.

## Troubleshooting

- **Old Node:** Use `launch.cmd`, or install Node.js 22.12+.
- **Port 4188 is busy:** Close the previous server or use `npm run dev -- --port 4189` for ordinary flight. The optional bridge allows the documented 4188 origin by default.
- **Controller is missing:** Focus the page and press a button. Explicitly configure and enable non-standard USB adapters in Input setup.
- **Controls remain idle:** Release mapped controls and lower absolute throttle. Reversed mapping can make the other endpoint idle; correct inversion in Input setup.
- **Calibration is incomplete:** Sweep every used axis both ways. Center and range calibration are separate steps.
- **Experiment will not lift off:** Check armed state, thrust, mass, throttle mode and scheduled faults. Restore factory values for a baseline.
- **No audio:** Launch/resume with a user gesture, enable Flight audio and check volume.
- **Low frame rate:** Choose Performance quality, close graphics-heavy tabs and enable hardware acceleration. Live telemetry identifies the simulation backend.
- **Firmware waits or fails:** Follow [README-SITL.md](README-SITL.md); check prerequisites, firmware settings and same-namespace loopback networking. The bridge alone cannot produce firmware actuator responses.
- **Interrupted dependency download:** Retry the launcher. Configure required proxies in your shell; FlightLab does not alter system proxy settings.
