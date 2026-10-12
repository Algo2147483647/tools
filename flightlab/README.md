# FlightLab 0.3

A local, English-language 3D flight playground for keyboard and standard gamepads. Explore a coastal harbor, fly a fixed-wing aircraft over a mountain airfield, or maneuver a six-degree-of-freedom spacecraft around an orbital shipyard.

This release combines the v0.2 controller profiles, handling and lessons with the v0.3 harbor route, spatial guidance, flight feedback and camera comfort settings.

## Start on Windows

Double-click **`launch.cmd`**, or run:

```powershell
.\launch.cmd
```

Open **http://127.0.0.1:4188/**. Keep the launcher window open while playing. Press Ctrl+C to stop the server.

The launcher looks for Node.js 22.12+ and can use an existing Codex-bundled Node runtime when an older system Node is installed. The first launch installs dependencies; later launches reuse them. It does not change your global Node installation.

```powershell
.\launch.cmd -NoBrowser
.\launch.cmd -InstallOnly
.\launch.cmd -BuildOnly
.\launch.cmd -Preview
```

For a conventional Node.js installation:

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

Use a recent desktop Chrome or Edge browser with WebGL 2 and hardware acceleration enabled. The server binds to localhost. Gamepad input needs localhost or HTTPS. This project has no account, backend, telemetry service, or remote runtime assets.

## Flight modes

| Mode | Environment | Model |
| --- | --- | --- |
| FPV Drone | Coastal Flight Park | Thrust, gravity, aerodynamic drag, Angle and Acro attitude control |
| Fixed Wing | Highland Airfield | Lift, drag, angle-of-attack stall, airspeed-dependent steering and assisted trim |
| Spacecraft | Orbital Shipyard | Independent translation and rotation, bounded thruster acceleration and optional translation braking |

In free flight, the drone begins near a level hover at 50% throttle and the plane begins airborne at cruising speed. Fixed-wing **Runway departure** and **Flight school** start on the runway. The spacecraft begins near the shipyard and uses relative station velocity.

**Flight Assist:** Drone Angle mode self-levels; its assisted brake compensates for moderate tilt. Acro mode keeps its attitude when rotational input is released. Fixed-wing assistance provides banking, attitude stabilization and trim. Spacecraft assistance controls translation velocity and brakes released axes. With space assistance disabled, linear momentum persists; rotational stabilization remains enabled.

**Gentle**, **Balanced** and **Sport** change vehicle handling authority and response. These settings are separate from stick sensitivity and response curve. Flight school uses Gentle handling, assistance and calm air; other activities use the selected preset.

These are deliberately simplified, playable flight models rather than engineering-grade vehicle simulation. There is no orbital gravity, real flight-controller firmware, multiplayer, or seamless planet landing.

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
| Brake | Space | A |
| Boost | Shift | Left stick click |
| Flight assistance | F | B |
| Chase / first-person camera | C | X |
| Restart | R | Y |
| Pause / resume | Escape | Start |

Pulling the right stick down, or pressing Down Arrow, raises the nose. Pitch can be inverted in Settings. Drone and plane throttle stays where you leave it. Boost provides extra thrust; its largest effect is on spacecraft.

Connect a controller and press any button to let the browser detect it. Open **Flight settings** to adjust deadzone, sensitivity, response curve and **Standard / Southpaw** stick layout. Southpaw swaps the two flight sticks; spacecraft triggers and shoulder buttons retain their translation and roll functions.

Brake, Assist, Camera, Restart, Boost and Pause can be remapped among standard buttons other than LB/RB/LT/RT, which are reserved for spacecraft roll and translation. Assigning an already-used action button swaps the two bindings. **Reset bindings** restores defaults. Bindings and stick layout are saved for the detected controller. Menu controls stay fixed so flight remapping cannot make settings inaccessible.

Standard browser gamepad mapping is required; non-standard devices keep keyboard fallback. Rumble is optional and depends on the browser and controller.

The simulation pauses when the active controller disconnects, the tab is hidden, or the browser loses focus.

### Controller menus and calibration

Use **D-pad / Left stick** to navigate, **A / Cross** to activate, **B / Circle** to go back and **Start / Options** for pause/resume. **Up / Down** moves between settings; **Left / Right** changes select values, sliders and checkboxes. A also cycles select values without opening a native dropdown. Keyboard arrows, Enter/Space and Escape provide the same menu navigation.

Release the sticks, triggers and buttons when entering or leaving a menu. The input manager waits for neutral controls so the button used to launch a flight cannot also apply its flight action. Holding a menu direction repeats after a short delay.

Calibration is per controller:

1. Release both sticks and choose **Set stick center**. Readings too far from center are rejected.
2. Choose **Calibrate full travel**. Move both sticks through full circles, reaching all directions.
3. Finish calibration. Every axis needs adequate positive and negative travel. An incomplete sweep stays open so you can continue.
4. Use **Reset calibration** to restore the default range and center.

During a full-travel sweep, stick motion does not move menu focus; use the D-pad to navigate. Each axis's independent positive and negative range is normalized before applying the deadzone and response curve. Setting the center again clears the old range calibration.

## Activities

- **Free exploration:** Fly freely and switch assistance at any time. Race rings are hidden.
- **Flight school:** Maneuver-based lessons for each vehicle, with live progress and input hints. Drone lessons cover lift-off, hover, yaw, acceleration and braking. Fixed-wing lessons cover takeoff, banking, cruise and descent preparation. Spacecraft lessons cover translation, braking, alignment and docking. Completion is saved per vehicle; the suggested three-minute duration is only an estimate.
- **Gate run:** Pass numbered gates in sequence and in the indicated direction. The next gate is highlighted. Personal bests and ghost trajectories are stored locally, separately by vehicle, weather, handling and assistance configuration.
- **Runway departure:** Fixed wing only. Start on the runway and practice takeoff into free flight.
- **Precision docking:** Spacecraft only. Approach the illuminated docking target, match its orientation, slow below 1.4 m/s, and remain within its capture radius for two seconds.

Relevant handling, assistance and weather settings are locked during lessons and challenges. Choose weather and handling before launching. A crash or water contact ends the flight; press R or choose Restart for an immediate new attempt.

The HUD shows airspeed (or relative speed in space), terrain clearance, vertical speed, throttle, heading and mission status. The spacecraft's **EST. STOP** estimate accounts for the selected handling preset, low-speed braking taper and a 0.2-second reaction margin. A circular velocity marker separates travel direction from where the nose points.

An attitude display shows pitch and roll, while wind and nearby-structure feedback provide additional spatial references. Docking guidance adds closing speed, lateral drift, alignment error and offset in the target's local frame. A corridor and UP marking establish the approach orientation. Braking estimates are guidance, not collision guarantees; the station is stationary and moving orbital rendezvous is outside this version.

## Environment and presentation

- Procedural sky, ocean waves, coastal haze and three atmosphere presets.
- Harbor buildings, cranes, bridge, lighthouse, runway, forests and distant ridgelines.
- A 15-gate harbor circuit through an open warehouse, along the quay, below the bridge, past the lighthouse and cliffs, across the bay and back toward the landing pad. Near-ground markings and structures provide scale and speed cues.
- Runway approach references, windsocks and foliage responding to the same supplied wind used by the physics.
- Orbital station ring, solar arrays, docking structure, nearby debris, stars and a shaded planet with an atmosphere rim.
- Numbered station bays, optional docking corridor, surface scale markings and a maintenance tug.
- Distinct vehicle models, animated propellers, procedural engine and wind audio, event cues and optional controller vibration.
- Chase and first-person cameras, with 60–105° field of view, adjustable smoothing and vibration, optional speed-based FOV expansion and FPV horizon stabilization. **Apply comfort camera** provides a quieter starting point. Chase-camera obstruction checks pull the view closer near structures.
- Synthesized engine, wind, stall, proximity and thruster feedback, plus event cues and optional vibration. Render quality adjusts resolution and shadows for the target GPU.
- All visual geometry and audio are generated locally. No downloaded textures or media are required.

Audio starts only after a user gesture. Settings, calibration, lesson completion and best flights use browser local storage; clearing site data removes them. A storage restriction does not prevent flying. No server-side sync is implemented.

## Project structure

```text
src/
  main.ts          Application, fixed-step loop, cameras, HUD and activity flow
  physics.ts       Independent flight models, collision sweeps and telemetry
  input.ts         Keyboard, gamepad polling, calibration and haptics
  menu-controls.ts Scoped menu navigation and direct settings adjustment
  training.ts      Maneuver-based lessons for all three flight modes
  camera-rig.ts    First-person/chase cameras and comfort settings
  navigation.ts    Dock-local approach and braking guidance
  world.ts         Procedural environments, visual models and collision queries
  audio.ts         Web Audio synthesis and flight feedback
  challenges.ts    Directional gate crossing and validated local flight records
  types.ts         Shared flight contracts
  style.css        Responsive English interface
tests/
  physics.test.ts  Flight behavior and collision regression tests
  input.test.ts    Input normalization, mapping and disconnect tests
  menu-controls.test.ts  Focus navigation and settings adjustment tests
  training.test.ts Lesson progress and maneuver completion tests
  navigation.test.ts Docking approach and braking guidance tests
  audio.test.ts    Audio lifecycle and feedback tests
  camera-rig.test.ts Camera obstruction, smoothing and comfort tests
  challenges.test.ts  Gate intersection and timing tests
  world.test.ts    Collision-free spawns, reachable routes and docking clearance
```

## Simulation design

The controller manager retains its existing polling, settings, calibration, haptics and lifecycle APIs. New methods are `getBindings()`, `setBinding(action, index)`, `resetBindings()`, `setContext('flight' | 'menu')`, `setMenuHandler(callback)`, `beginRangeCalibration()`, `finishRangeCalibration()`, `cancelRangeCalibration()` and `resetCalibration()`. Cancellation discards only an unfinished sweep and preserves the saved center and range. The `stickLayout` property is readable/writable; `rangeCalibrating` reports an active range sweep.

`ButtonAction` is `brake | assist | camera | reset | boost | pause`; `BUTTON_LABELS` names standard browser button indices. `MenuAction` is `up | down | left | right | confirm | back`. `navigateMenu(root, action, onBack)` navigates only visible enabled controls in the supplied menu/modal scope.

Coordinates use metres, seconds, Y-up and local -Z-forward. A 120 Hz accumulator advances the flight model independently of rendering, with pose interpolation for display. Large frame gaps are capped rather than attempting an unbounded catch-up loop. This intentionally slows simulated time during severe stalls; it avoids a large physics jump.

Input produces normalized actions. Vehicle-specific controllers produce angular-rate targets and acceleration. The simulation applies swept sphere collision sampling against environment obstacles and terrain, then publishes flight state. Cameras, HUD, sound and challenges consume that state.

Static repeated geometry uses instancing. Draw distance, pixel ratio and optional shadows are tuned for a browser prototype. High-speed gate tests intersect the full movement segment, so passing a ring between ticks is still counted. Best-flight ghosts store sampled states instead of assuming input-only replay is deterministic.

The current worlds are authored finite local spaces; planetary streaming and a general-purpose rigid-body solver are outside this version. Obstacle collision uses simplified shapes, and distant mountains use approximate terrain envelopes.

## Verification

`npm test` runs automated tests for hover, attitude control, handling presets, space momentum/braking, aerodynamic behavior, collision sweeps, gamepad profiles and calibration, menu transitions, lessons, docking guidance, gate intersections and world routes. `npm run build` checks TypeScript and creates a production build in `dist/`.

Release verification: 95 tests pass, including complete drone, fixed-wing and spacecraft lessons driven through the real physics and authored scene collisions. TypeScript and the production build pass. Browser checks cover all three modes, lesson and docking HUDs, runway departure, camera switching, menu navigation, remapping conflict swaps, settings persistence, comfort controls, focus containment and keyboard retry. Desktop and narrow layouts were inspected; observed frame rate in the local preview was approximately 53–57 FPS, not a target-device benchmark.

Physical controllers and vibration have not been tested with hardware for this release. Manual checks should include the actual target controller over USB/Bluetooth, sound output and sustained performance on the target GPU. Automated gamepad fixtures verify software behavior but cannot certify physical-device behavior.

## Troubleshooting

- **Old system Node:** Run `launch.cmd`; it can select a newer bundled runtime. Otherwise install Node.js 22.12+.
- **Port already in use:** Close the previous FlightLab server, or run `npm run dev -- --port 4189`.
- **Controller not visible:** Focus the page and press a controller button. Check Settings. Unsupported mappings use keyboard fallback.
- **Controls idle after leaving a menu:** Release all sticks, triggers and buttons once, then resume input.
- **Incomplete calibration:** Sweep both sticks in full circles; all four axes need travel in both directions.
- **No audio:** Launch or resume a flight, enable Flight audio and check the volume slider.
- **Low frame rate:** Choose Performance quality, close graphics-heavy tabs and enable browser hardware acceleration.
- **Package download interrupted:** Retry the launcher. If your network needs a proxy, configure it for your shell before installing; FlightLab does not alter system proxy settings.

## Technical references

- [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)
- [MDN Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API)
- [MDN Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
