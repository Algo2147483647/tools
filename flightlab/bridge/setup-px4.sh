#!/usr/bin/env bash
set -euo pipefail
# A supported PX4 Linux toolchain must already exist; this script does not use sudo.
for program in git gcc g++ make cmake ninja python3; do command -v "$program" >/dev/null || { echo "Missing tool: $program. Complete the official PX4 Linux development setup first." >&2; exit 1; }; done
bridge_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
firmware_root="$bridge_root/firmware/px4"
if [[ ! -d "$firmware_root/.git" ]]; then
  mkdir -p "$bridge_root/firmware"
  git clone --depth 1 --branch v1.16.0 --recursive --shallow-submodules https://github.com/PX4/PX4-Autopilot.git "$firmware_root"
fi
cd "$firmware_root"
if [[ "$(git describe --tags --exact-match HEAD)" != 'v1.16.0' ]]; then
  echo 'Unexpected PX4 revision; refusing to build this checkout.' >&2; exit 1
fi
make px4_sitl_default
printf '\nStart the FlightLab bridge and connect PX4 in the Workshop, then run:\n'
printf 'cd "%s" && make px4_sitl none_iris\n' "$firmware_root"
printf 'Apply bridge/px4.params in the PX4 shell. The simulator listens on TCP 4560.\n'
