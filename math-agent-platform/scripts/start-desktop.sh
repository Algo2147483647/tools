#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/../desktop"
if [ ! -d node_modules/electron ]; then npm ci; fi
unset ELECTRON_RUN_AS_NODE
npm start
