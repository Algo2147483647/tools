#!/bin/bash
set -e
cd -- "$(dirname -- "$0")"

# Finder may start Terminal with a different PATH from an interactive shell.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

fail() {
    printf '\n%s\n' "$1"
    read -r -p "Press Enter to close..." _ || true
    exit 1
}

command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 || \
    fail "Node.js and npm are required. Install Node.js LTS from https://nodejs.org/ and reopen this script."

if [ ! -x node_modules/.bin/vite ]; then
    echo "Installing dependencies. This may take a few minutes..."
    npm ci || fail "Dependency installation failed. Check the error above and your network connection."
fi

echo "Starting DAG Studio. Keep this window open. Press Ctrl+C to stop."
npm run dev -- --host 127.0.0.1 --open || fail "Startup failed. Check the error above."
