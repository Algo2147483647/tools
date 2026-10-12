#!/usr/bin/env bash
set -euo pipefail
# Run from a Linux or WSL shell with GCC, make, Python and Git already installed.
for program in git gcc make python3; do command -v "$program" >/dev/null || { echo "Missing tool: $program" >&2; exit 1; }; done
bridge_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
firmware_root="$bridge_root/firmware/betaflight"
if [[ ! -d "$firmware_root/.git" ]]; then
  mkdir -p "$bridge_root/firmware"
  git clone --depth 1 --branch 4.5.2 https://github.com/betaflight/betaflight.git "$firmware_root"
fi
cd "$firmware_root"
if [[ "$(git rev-parse HEAD)" != '024f8e13d4e642eb6a380308685b9ea3aa3ef1a2' ]]; then
  echo 'Unexpected firmware revision; refusing to modify or build this checkout.' >&2; exit 1
fi
# Keep the real firmware AHRS and synchronize its gyro/PID loop to sensor arrivals.
python3 - <<'PY'
from pathlib import Path
path = Path('src/main/target/SITL/target.h')
text = path.read_text()
text = text.replace('#undef USE_IMU_CALC', '// FlightLab: preserve the real firmware attitude estimator.')
text = text.replace('//#define SIMULATOR_GYROPID_SYNC', '#define SIMULATOR_GYROPID_SYNC')
text = text.replace('#define TASK_GYROPID_DESIRED_PERIOD     100', '#define TASK_GYROPID_DESIRED_PERIOD     4167')
path.write_text(text)
# PID dT and filter dT derive from gyro.sampleRateHz, not the scheduler macro.
# Align both clocks to the browser's 240 Hz fixed step; a production 8 kHz tune
# is not transferable to this low-rate development adapter without retuning.
path = Path('src/main/sensors/gyro_init.c')
text = path.read_text()
anchor = 'void gyroSetTargetLooptime(uint8_t pidDenom)\n{'
patch = '''\n#if defined(SIMULATOR_BUILD) && defined(SIMULATOR_GYROPID_SYNC)
    // FlightLab external simulator cadence: 240 Hz, one PID per sensor frame.
    pidDenom = 1;
    gyro.sampleRateHz = 240;
#endif'''
if anchor not in text:
    raise RuntimeError('Pinned firmware gyro loop initializer changed; inspect before building.')
if 'FlightLab external simulator cadence' not in text:
    text = text.replace(anchor, anchor + patch)
path.write_text(text)
PY
make TARGET=SITL -j2
printf '\nBuilt pinned Betaflight with real AHRS and sensor-driven PID. Start with:\n'
printf 'cd "%s" && ./obj/main/betaflight_SITL.elf\n' "$firmware_root"
printf 'Configure AUX1 arming and AUX2 Angle using bridge/betaflight.cli before flight.\n'
