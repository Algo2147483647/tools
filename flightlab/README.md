# FlightLab

A local, English-language 3D flight playground for keyboard and standard gamepads. Explore a coastal harbor, fly a fixed-wing aircraft over a mountain airfield, or maneuver a six-degree-of-freedom spacecraft around an orbital shipyard.

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

The drone begins in a level hover at 50% throttle. Lean forward to accelerate, and add throttle as needed to compensate for tilt. The plane begins airborne at cruising speed. The spacecraft begins near the shipyard and uses relative station velocity.

**Flight Assist:** Drone Angle mode self-levels; Acro mode keeps its attitude when rotational input is released. Fixed-wing assistance provides attitude stabilization and trim. Spacecraft assistance brakes drift when translation controls are released. With space assistance disabled, linear momentum persists; rotational stabilization remains enabled.

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

Connect a controller and press any button to let the browser detect it. Open **Flight settings** to adjust deadzone, sensitivity and response curve. Release both sticks and select **Calibrate sticks** to save neutral offsets for that device. Standard browser gamepad mapping is required; non-standard devices keep keyboard fallback. Button remapping and flight-stick throttle hardware are not implemented in this version. Rumble is optional and depends on the browser and controller.

The simulation pauses when the active controller disconnects, the tab is hidden, or the browser loses focus.

## Activities

- **Free exploration:** Fly freely and switch assistance at any time. Race rings are hidden.
- **Gate run:** Pass numbered gates in sequence and in the indicated direction. The next gate is highlighted. Personal bests and ghost trajectories are stored locally, separately by vehicle and weather.
- **Precision docking:** Spacecraft only. Approach the illuminated docking target, match its orientation, slow below 1.4 m/s, and remain within its capture radius for two seconds.

Challenge assistance and weather are locked during a run to keep records comparable. Change the weather from flight selection before launching. A crash or water contact ends the flight; press R or choose Restart for an immediate new attempt.

The HUD shows airspeed (or relative speed in space), terrain clearance, vertical speed, throttle, heading and mission status. The spacecraft's **EST. STOP** is an ideal full-thrust braking estimate; assisted braking tapers near rest, so actual stopping distance can be longer. A circular velocity marker separates travel direction from where the nose points.

## Environment and presentation

- Procedural sky, ocean waves, coastal haze and three atmosphere presets.
- Harbor buildings, cranes, bridge, lighthouse, runway, forests and distant ridgelines.
- Orbital station ring, solar arrays, docking structure, nearby debris, stars and a shaded planet with an atmosphere rim.
- Distinct vehicle models, animated propellers, procedural engine and wind audio, event cues and optional controller vibration.
- Chase and first-person cameras; hardware-scaled render quality.
- All visual geometry and audio are generated locally. No downloaded textures or media are required.

Audio starts only after a user gesture. Settings, calibration and best flights use browser local storage; clearing site data removes them. A storage restriction does not prevent flying.

## Project structure

```text
src/
  main.ts          Application, fixed-step loop, cameras, HUD and activity flow
  physics.ts       Independent flight models, collision sweeps and telemetry
  input.ts         Keyboard, gamepad polling, calibration and haptics
  world.ts         Procedural environments, visual models and collision queries
  audio.ts         Web Audio synthesis and flight feedback
  challenges.ts    Directional gate crossing and validated local flight records
  types.ts         Shared flight contracts
  style.css        Responsive English interface
tests/
  physics.test.ts  Flight behavior and collision regression tests
  input.test.ts    Input normalization, mapping and disconnect tests
  challenges.test.ts  Gate intersection and timing tests
  world.test.ts    Collision-free spawns, reachable routes and docking clearance
```

## Simulation design

Coordinates use metres, seconds, Y-up and local -Z-forward. A 120 Hz accumulator advances the flight model independently of rendering, with pose interpolation for display. Large frame gaps are capped rather than attempting an unbounded catch-up loop. This intentionally slows simulated time during severe stalls; it avoids a large physics jump.

Input produces normalized actions. Vehicle-specific controllers produce angular-rate targets and acceleration. The simulation applies swept sphere collision sampling against environment obstacles and terrain, then publishes flight state. Cameras, HUD, sound and challenges consume that state.

Static repeated geometry uses instancing. Draw distance, pixel ratio and optional shadows are tuned for a browser prototype. High-speed gate tests intersect the full movement segment, so passing a ring between ticks is still counted. Best-flight ghosts store sampled states instead of assuming input-only replay is deterministic.

The current worlds are authored finite local spaces; planetary streaming and a general-purpose rigid-body solver are outside this version. Obstacle collision uses simplified shapes, and distant mountains use approximate terrain envelopes.

## Verification

`npm test` runs automated tests for hover, attitude control, space momentum/braking, aerodynamic behavior, collision sweeps, gamepad mapping, calibration and gate intersections. `npm run build` checks TypeScript and creates a production build in `dist/`.

Manual checks should include the actual target controller over USB/Bluetooth, sound output, vibration support and sustained performance on the target GPU. Automated gamepad simulation verifies software mapping but cannot certify physical-device behavior.

## Troubleshooting

- **Old system Node:** Run `launch.cmd`; it can select a newer bundled runtime. Otherwise install Node.js 22.12+.
- **Port already in use:** Close the previous FlightLab server, or run `npm run dev -- --port 4189`.
- **Controller not visible:** Focus the page and press a controller button. Check Settings. Unsupported mappings use keyboard fallback.
- **No audio:** Launch or resume a flight, enable Flight audio and check the volume slider.
- **Low frame rate:** Choose Performance quality, close graphics-heavy tabs and enable browser hardware acceleration.
- **Package download interrupted:** Retry the launcher. If your network needs a proxy, configure it for your shell before installing; FlightLab does not alter system proxy settings.

## Technical references

- [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)
- [MDN Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API)
- [MDN Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
