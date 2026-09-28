#!/bin/bash
set -euo pipefail

# Finder may start this script outside the project and with a minimal PATH.
cd "$(dirname "${BASH_SOURCE[0]}")"

atlas_mode="production"
case "${1:-}" in
  --dev) atlas_mode="development" ;;
  --help|-h)
    printf 'Usage: bash launch.command [--dev]\n\nDefault: build, start the local server, and open the browser.\n--dev: start the development editor at http://127.0.0.1:4320/.\n'
    exit 0
    ;;
  '') ;;
  *) printf 'Unknown option: %s\nUse --help for usage.\n' "$1" >&2; exit 1 ;;
esac
if [ "$#" -gt 1 ]; then
  printf 'Use at most one option: --dev or --help.\n' >&2
  exit 1
fi

source ../scripts/node-runtime.sh
tools_initialize_project
atlas_node="$tools_node"

if [ "$atlas_mode" = "development" ]; then
  printf 'Service Atlas: http://127.0.0.1:4320/ (Ctrl+C to stop)\n'
  exec "$atlas_node" scripts/dev.mjs
fi

printf 'Building Service Atlas...\n'
"$atlas_node" node_modules/typescript/bin/tsc --noEmit
"$atlas_node" node_modules/vite/bin/vite.js build
printf 'Keep this Terminal window open while editing. Press Ctrl+C to stop.\n'
exec "$atlas_node" --import tsx server/index.ts --open
