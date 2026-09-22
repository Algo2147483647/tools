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

atlas_candidates=(
  "$(command -v node || true)"
  /opt/homebrew/bin/node
  /usr/local/bin/node
  "$HOME/.volta/bin/node"
  "${NVM_DIR:-$HOME/.nvm}"/versions/node/*/bin/node
)
atlas_node=""
for atlas_candidate in "${atlas_candidates[@]}"; do
  if [ -x "$atlas_candidate" ] && "$atlas_candidate" -e '
    const [major, minor] = process.versions.node.split(".").map(Number);
    process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1);
  ' >/dev/null 2>&1; then
    atlas_node="$atlas_candidate"
    break
  fi
done
if [ -z "$atlas_node" ]; then
  printf 'Node.js 22.12 or later is required. Install Node.js, then run this launcher again.\n' >&2
  exit 1
fi
export PATH="$(dirname "$atlas_node"):$PATH"

# Import Vite to detect missing dependencies or native binaries copied from
# another operating system/CPU. npm ci installs the correct local binaries.
if ! "$atlas_node" --input-type=module -e 'await import("vite"); await import("tsx"); await import("typescript"); await import("react-dom/client");' >/dev/null 2>&1; then
  if ! command -v npm >/dev/null 2>&1; then
    printf 'npm is required to install dependencies. Install Node.js with npm and try again.\n' >&2
    exit 1
  fi
  printf 'Installing project dependencies...\n'
  npm ci --cache .npm-cache
fi

if [ "$atlas_mode" = "development" ]; then
  printf 'Service Atlas: http://127.0.0.1:4320/ (Ctrl+C to stop)\n'
  exec "$atlas_node" scripts/dev.mjs
fi

printf 'Building Service Atlas...\n'
"$atlas_node" node_modules/typescript/bin/tsc --noEmit
"$atlas_node" node_modules/vite/bin/vite.js build
printf 'Keep this Terminal window open while editing. Press Ctrl+C to stop.\n'
exec "$atlas_node" --import tsx server/index.ts --open
