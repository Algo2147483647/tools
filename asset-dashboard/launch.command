#!/bin/bash
# Compatible with macOS's bundled Bash 3.2; double-click in Finder or run from a terminal.
set -euo pipefail
cd -- "$(dirname -- "$0")"

# Finder does not inherit an interactive shell's Homebrew PATH.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

fail() {
    printf '\n%s\n' "$1" >&2
    if [ -t 0 ]; then read -r -p "Press Enter to close..." dashboard_reply || true; fi
    exit 1
}

usage() {
    cat <<'HELP'
Asset Dashboard: ./launch.command [options]
  --dev           Development server (default)
  --preview       Build and serve production output
  --build-only    Install dependencies and build, then exit
  --install-only  Install or verify dependencies, then exit
  --no-browser    Do not open the browser
  --port NUMBER   Local port (default: 3000)
  --help          Show this help
HELP
}

dashboard_mode="dev"
dashboard_mode_set=0
dashboard_port=3000
dashboard_browser=1
while [ "$#" -gt 0 ]; do
    case "$1" in
        --help|-h) usage; exit 0 ;;
        --dev|--preview|--build-only|--install-only)
            [ "$dashboard_mode_set" -eq 0 ] || fail "Choose only one run mode."
            dashboard_mode="${1#--}"
            dashboard_mode_set=1
            ;;
        --no-browser) dashboard_browser=0 ;;
        --port)
            [ "$#" -ge 2 ] || fail "--port requires a number from 1 to 65535."
            shift
            case "$1" in ''|*[!0-9]*) fail "Port must be a number from 1 to 65535." ;; esac
            [ "${#1}" -le 5 ] || fail "Port must be a number from 1 to 65535."
            dashboard_port=$((10#$1))
            [ "$dashboard_port" -ge 1 ] && [ "$dashboard_port" -le 65535 ] || fail "Port must be a number from 1 to 65535."
            ;;
        *) fail "Unknown option: $1. Use --help." ;;
    esac
    shift
done

dashboard_node=""
while IFS= read -r dashboard_candidate; do
    [ -x "$dashboard_candidate" ] || continue
    if "$dashboard_candidate" -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 13) ? 0 : 1)' 2>/dev/null; then
        dashboard_node="$dashboard_candidate"
        break
    fi
done < <(type -a -p node 2>/dev/null || true)
[ -n "$dashboard_node" ] || fail "Node.js 22.13+ is required. Install Node.js LTS including npm from https://nodejs.org/ and reopen this launcher."
export PATH="$(dirname -- "$dashboard_node"):$PATH"

dashboard_npm=""
while IFS= read -r dashboard_candidate; do
    if "$dashboard_node" "$dashboard_candidate" --version >/dev/null 2>&1; then
        dashboard_npm="$dashboard_candidate"
        break
    fi
done < <(type -a -p npm 2>/dev/null || true)
[ -n "$dashboard_npm" ] || fail "npm was not found. Install a Node.js distribution that includes npm."
[ -f package-lock.json ] || fail "package-lock.json is missing. Restore it before launching."

printf 'Using Node.js %s (%s)\n' "$("$dashboard_node" --version)" "$dashboard_node"
dashboard_stamp="node_modules/.asset-dashboard-macos-install"
dashboard_fingerprint=$(
    {
        shasum -a 256 package.json package-lock.json
        if [ -f .npmrc ]; then shasum -a 256 .npmrc; fi
        "$dashboard_node" -p 'process.version + ":" + process.platform + ":" + process.arch'
    } | shasum -a 256 | cut -d ' ' -f 1
)
dashboard_install=1
if [ -f "$dashboard_stamp" ] && [ "$(cat "$dashboard_stamp")" = "$dashboard_fingerprint" ] && [ -f node_modules/next/dist/bin/next ]; then
    if "$dashboard_node" "$dashboard_npm" ls --depth=0 --omit=optional --offline >/dev/null 2>&1; then
        dashboard_install=0
    fi
fi
if [ "$dashboard_install" -eq 1 ]; then
    printf 'Installing dependencies from package-lock.json...\n'
    "$dashboard_node" "$dashboard_npm" ci --include=dev --no-fund || fail "npm ci failed. Check the output above."
    printf '%s\n' "$dashboard_fingerprint" > "$dashboard_stamp"
else
    printf 'Dependencies are ready; no installation needed.\n'
fi
[ "$dashboard_mode" != "install-only" ] || exit 0

if [ "$dashboard_mode" = "preview" ] || [ "$dashboard_mode" = "build-only" ]; then
    "$dashboard_node" "$dashboard_npm" run build || fail "The production build failed. Check the output above."
fi
[ "$dashboard_mode" != "build-only" ] || exit 0

# Refuse an occupied port instead of opening an unrelated application in the browser.
"$dashboard_node" - "$dashboard_port" <<'NODE' || fail "Port is unavailable. Choose another port with --port."
const server = require('node:net').createServer();
server.once('error', () => process.exit(1));
server.listen(Number(process.argv[2]), '127.0.0.1', () => server.close());
NODE

dashboard_url="http://127.0.0.1:$dashboard_port/"
dashboard_browser_pid=""
cleanup() {
    if [ -n "$dashboard_browser_pid" ]; then
        kill "$dashboard_browser_pid" 2>/dev/null || true
        wait "$dashboard_browser_pid" 2>/dev/null || true
    fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if [ "$dashboard_browser" -eq 1 ]; then
    (
        dashboard_deadline=$((SECONDS + 120))
        while [ "$SECONDS" -lt "$dashboard_deadline" ]; do
            if curl --silent --fail --max-time 1 "$dashboard_url" >/dev/null 2>&1; then
                open "$dashboard_url"
                exit 0
            fi
            sleep 0.4
        done
        printf 'Browser opening timed out; open %s manually once ready.\n' "$dashboard_url" >&2
    ) &
    dashboard_browser_pid=$!
fi

dashboard_next_mode="dev"
if [ "$dashboard_mode" = "preview" ]; then dashboard_next_mode="start"; fi
printf 'Asset Dashboard: %s (Ctrl+C to stop)\n' "$dashboard_url"
dashboard_status=0
"$dashboard_node" node_modules/next/dist/bin/next "$dashboard_next_mode" --hostname 127.0.0.1 --port "$dashboard_port" || dashboard_status=$?
if [ "$dashboard_status" -ne 0 ] && [ "$dashboard_status" -ne 130 ] && [ -t 0 ]; then
    read -r -p "Startup failed. Press Enter to close..." dashboard_reply || true
fi
exit "$dashboard_status"
