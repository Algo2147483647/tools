#!/bin/bash
set -e
cd -- "$(dirname -- "$0")"

# Finder does not inherit an interactive shell's Homebrew PATH.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

fail() {
    printf '\n%s\n' "$1" >&2
    if [ -t 0 ]; then read -r -p "Press Enter to close..." _ || true; fi
    exit 1
}

graph_node=""
while IFS= read -r candidate; do
    [ -x "$candidate" ] || continue
    if "$candidate" -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1)' 2>/dev/null; then
        graph_node="$candidate"
        break
    fi
done < <(type -a -p node 2>/dev/null || true)

[ -n "$graph_node" ] || fail "Node.js 22.12+ is required. Install Node.js LTS including npm from https://nodejs.org/ and reopen this launcher."

status=0
"$graph_node" scripts/launch.mjs "$@" || status=$?
if [ "$status" -ne 0 ] && [ "$status" -ne 130 ] && [ -t 0 ]; then
    read -r -p "Startup failed. Press Enter to close..." _ || true
fi
exit "$status"
