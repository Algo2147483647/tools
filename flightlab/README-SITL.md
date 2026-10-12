# Local firmware integration

FlightLab includes a local WebSocket bridge, Betaflight UDP and PX4 MAVLink codecs, and a browser client for external quadrotor motor control. The built-in controller and external firmware are separate execution paths. The external path pauses physics while waiting for the corresponding motor response; a lost connection halts it instead of silently substituting built-in control.

## Verified status on this machine

The codec tests, browser client tests, and local WebSocket-to-UDP/TCP protocol round trips pass. The two round-trip tests use **explicit mock firmware fixtures**. They establish packet formatting, coordinate conversion, motor order, timestamps, transport, validation, and watchdog behavior; they do not establish real firmware flight stability.

Real Betaflight and PX4 execution has **not** been verified here. Host diagnostics on 2026-10-12 found Windows 11, Node 24, and Git, but no GCC, make, CMake, or Docker. `wsl --list --quiet` exited with code 1 and reported that its required path was missing; no WSL distribution was registered. No operating system or compiler installation was performed. Run the diagnostic again after installing a supported toolchain:

```powershell
./bridge/start.ps1 -Diagnose
```

Firmware build scripts are provided and deliberately fail early when prerequisites are absent. The full firmware build, AHRS sign checks, arming, PID response, and stable hover remain integration acceptance checks, not claimed results.

## Start the local bridge

Install the project dependencies, then run:

```powershell
./bridge/start.ps1
```

Alternatively, with Node 20.19+ on PATH:

```text
npm run sitl
```

The browser endpoint is `ws://127.0.0.1:4190/sitl`. Open FlightLab at `http://127.0.0.1:4188`, select the drone sandbox, and choose external firmware in the Workshop. The bridge accepts only the local FlightLab origin and one browser client. All listeners and destinations use `127.0.0.1`; there is no arbitrary network destination supplied by the browser. The bridge does not install, launch, configure, or arm firmware automatically.

Run the bridge and firmware in the **same OS/network namespace**. If using WSL, run both bridge Node and firmware in that Linux distribution; keep the browser page on localhost. A Windows bridge and default WSL2 NAT guest do not share loopback. LAN binding and guest-IP bypasses are intentionally not supplied.

## Betaflight

The adapter targets **Betaflight 4.5.2**, commit `024f8e13d4e642eb6a380308685b9ea3aa3ef1a2`. Newer master versions have changed their simulator coordinate semantics; do not interchange them without updating the adapter and validating axes. The wire layout is based on the [pinned SITL target definition](https://github.com/betaflight/betaflight/blob/4.5.2/src/main/target/SITL/target.h) and [pinned SITL implementation](https://github.com/betaflight/betaflight/blob/4.5.2/src/main/target/SITL/sitl.c).

On an existing Linux/WSL GCC development environment:

```bash
bash bridge/setup-betaflight.sh
cd bridge/firmware/betaflight
./obj/main/betaflight_SITL.elf
```

The setup script checks the exact revision, preserves the firmware's real attitude estimator, and enables the existing sensor-driven gyro/PID synchronization option. It sets the scheduler period and virtual gyro/PID/filter interval to match FlightLab's **240 Hz** fixed step. This is a low-rate firmware development adapter; high-rate real-aircraft PID/filter tunes are not directly transferable. The firmware's remaining task scheduling retains upstream SITL's simulation-rate-adjusted clock, so the Betaflight adapter does not promise whole-firmware deterministic execution. The script prints the launch command. It does not run `sudo` or install packages. Generated firmware stays under the ignored `bridge/firmware` directory.

Apply `bridge/betaflight.cli` through the Betaflight Configurator CLI connected to SITL UART1 TCP 5761. Use a Configurator compatible with Betaflight 4.5.2; an online Configurator may need its own WebSocket-to-UART proxy. This project bridge carries simulation data, not the Configurator serial session. After a `save`, restart the firmware as needed, restart the sensor session, wait for calibration with throttle low and arm off, then use the simulated arm switch. The [official SITL instructions](https://betaflight.com/docs/development/SITL) explain the UART endpoint and firmware build workflow.

| Direction | Port | Format |
|---|---|---|
| FlightLab → firmware | UDP 9003 | 144 bytes: 18 little-endian doubles, simulation seconds, gyro, specific force, quaternion, velocity, position, pressure |
| FlightLab → firmware | UDP 9004 | 40 bytes: double simulation seconds and 16 unsigned 16-bit RC channels |
| Firmware → FlightLab | UDP 9002 | Four normalized little-endian float motor outputs |

RC order is AETR, channel 5 arm, channel 6 Angle. Physical motor order returned to FlightLab is front-left, front-right, rear-right, rear-left. The protocol reverses the firmware's Gazebo output permutation. Reversed/3D motor operation is not supported.

The Betaflight motor packet has **no timestamp or sequence field**. One outstanding sensor frame provides ordering, but cannot cryptographically or unambiguously identify a delayed UDP duplicate. This is a localhost development interface. After resetting firmware, reconnect the browser session. The bridge refuses a decreasing simulation clock.

## PX4

The adapter follows **PX4 v1.16.0** `simulator_mavlink` and the MAVLink common dialect. The [PX4 simulator module](https://github.com/PX4/PX4-Autopilot/blob/v1.16.0/src/modules/simulation/simulator_mavlink/SimulatorMavlink.cpp) consumes `HIL_SENSOR`, `HIL_GPS`, and `RC_CHANNELS`; it produces `HIL_ACTUATOR_CONTROLS`. MAVLink 1 and unsigned MAVLink 2 input framing are supported with CRC-extra validation; the bridge emits MAVLink 2. Signed frames are rejected, not falsely treated as authenticated. [MAVLink common definitions](https://mavlink.io/en/messages/common.html) document the fields and units.

On a machine with the [supported PX4 Linux toolchain](https://docs.px4.io/v1.16/en/dev_setup/dev_env_linux_ubuntu) already installed:

```bash
bash bridge/setup-px4.sh
```

Start the bridge, choose PX4 in the Workshop so TCP 4560 is listening, then run the printed command:

```bash
cd bridge/firmware/px4
make px4_sitl none_iris
```

PX4 initiates the TCP connection to the simulator. Apply `bridge/px4.params` in the PX4 shell to assign AETR inputs, channel 5 arming, and channel 6 Acro/Stabilized. Keep throttle low and arm off while the estimator settles. Firmware arming checks remain active. The simulation must deliver initial sensor frames before PX4's lockstep startup can complete. [PX4 build targets](https://docs.px4.io/v1.16/en/dev_setup/building_px4) and [simulation networking](https://docs.px4.io/v1.16/en/simulation/) describe this process.

Sensor positions use a local NED origin at latitude 47.397742°, longitude 8.545594°. Altitude is the simulator's height above its zero reference; this is a small-area flat-earth GPS approximation. Magnetometer samples rotate a fixed local magnetic field into the body frame. This first adapter uses the four default Quad X motor outputs. Additional airframes, geographic worlds, sensor transport faults, and arbitrary motor reassignment require adapter changes.

## Clock, units, and failures

`SitlClient` accepts one `SitlFrame` at a time. `sequence` and integer `timeUs` must increase. `positionNed` and `velocityNed` use meters and meters/second, `quaternionWxyz` maps FRD body into NED world, `gyroFrd` uses radians/second, and `specificForceFrd` is measured acceleration excluding gravity. A stationary level vehicle therefore reads `[0, 0, -9.80665]` m/s². `makeSitlFrame` converts FlightLab's Y-up / -Z-forward convention consistently for both vectors and quaternion. Motor outputs represent normalized electrical motor commands, not normalized thrust. The motor model applies command-to-rotor-speed dynamics and squared-speed thrust; the protocol codec does not square the commands.

The caller advances physics once only after `readActuators(sequence)` returns four motor values. Simulation timestamps come from fixed-step integration, not browser wall time. Rendering and controls can continue while physics waits. PX4 responses must echo the outstanding simulation timestamp. The bridge enforces a two-second actuator deadline; the client also has connection and response deadlines. Malformed frames, stale timestamps, a broken connection, and non-finite motor values never become thrust commands. A pause does not generate new simulation time; reconnect if firmware times out during a long pause.

`new SitlClient(onUpdate)` optionally reports `connecting`, `ready`, `actuators`, `error`, and `disconnected` events after updating client state. Each event carries a session number. Reconnecting or disconnecting invalidates outstanding frames and outputs; callers must clear their own pending sequence when the session changes. `ready` and `actuators` events can schedule a bounded asynchronous simulation pump without coupling the firmware step rate to rendering. A failed physics Worker is rebuilt when a new flight initializes; if construction is unavailable, the same numerical runner can execute on the main thread.

## Protocol verification

```text
npm run test:sitl
npx vitest run tests/sitl-client.test.ts
```

For manual transport diagnostics only, start `node bridge/mock-firmware.mjs betaflight` or, after connecting PX4 in the Workshop, `node bridge/mock-firmware.mjs px4`. Each prints a prominent **MOCK ONLY** message and emits fixed test motor outputs. It is not a controller, flight model, firmware substitute, or successful SITL flight test. Stop it before starting real firmware because they use the same ports. The production bridge never automatically starts this fixture.

Before calling a firmware integration validated, verify all four motor locations/directions, positive roll/pitch/yaw sensor response, disarmed zero output, sensor calibration and estimator convergence, stable hover, rate step responses, disconnection stop behavior, and repeatability at multiple render frame rates. Record the exact firmware revision and configuration with the results.
