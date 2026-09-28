#!/bin/bash
# Source from a launcher after changing to the project directory.
tools_initialize_project() {
  local candidate package_manager preferred cache_key stamp_file
  local candidates=(
    "$(command -v node || true)"
    /opt/homebrew/bin/node /usr/local/bin/node
    "$HOME/.volta/bin/node"
    "${NVM_DIR:-$HOME/.nvm}"/versions/node/*/bin/node
    "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
  )
  tools_node=""
  for candidate in "${candidates[@]}"; do
    if [ -x "$candidate" ] && "$candidate" -e '
      const [major, minor] = process.versions.node.split(".").map(Number);
      process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1);
    ' >/dev/null 2>&1; then
      tools_node="$candidate"
      break
    fi
  done
  if [ -z "$tools_node" ]; then
    printf 'Node.js 22.12+ is required. Install Node.js LTS and retry.\n' >&2
    return 1
  fi
  export PATH="$(dirname "$tools_node"):$PATH"
  preferred=npm
  if [ ! -f package-lock.json ]; then preferred=pnpm; fi
  cache_key="$("$tools_node" --input-type=module -e '
    import fs from "node:fs"; import crypto from "node:crypto";
    const hash = crypto.createHash("sha256");
    for (const name of ["package.json", fs.existsSync("package-lock.json") ? "package-lock.json" : "pnpm-lock.yaml", "pnpm-workspace.yaml", ".npmrc"]) {
      if (fs.existsSync(name)) hash.update(name).update(fs.readFileSync(name));
    }
    hash.update(process.platform + process.arch + process.versions.modules);
    console.log(hash.digest("hex"));
  ')"
  stamp_file=node_modules/.tools-shell-install-ready
  if [ -f "$stamp_file" ] && [ "$(cat "$stamp_file")" = "$cache_key" ] && "$tools_node" --input-type=module -e '
    import fs from "node:fs";
    const manifest = JSON.parse(fs.readFileSync("package.json", "utf8"));
    for (const name of Object.keys({...manifest.dependencies, ...manifest.devDependencies})) {
      if (!fs.existsSync("node_modules/" + name + "/package.json")) process.exit(1);
    }
    for (const name of ["vite", "tsx"]) {
      if (manifest.dependencies?.[name] || manifest.devDependencies?.[name]) await import(name);
    }
  ' >/dev/null 2>&1; then
    return 0
  fi
  # Truncate the stamp before installing; an interrupted install cannot look complete.
  if [ -f "$stamp_file" ]; then : > "$stamp_file"; fi
  package_manager="$(command -v "$preferred" || true)"
  if [ -z "$package_manager" ] && [ "$preferred" = npm ]; then package_manager="$(command -v pnpm || true)"; preferred=pnpm; fi
  if [ -z "$package_manager" ]; then
    printf 'npm or pnpm is required. Install Node.js LTS with npm, or add pnpm to PATH.\n' >&2
    return 1
  fi
  printf 'Installing dependencies with %s...\n' "$preferred"
  if [ "$preferred" = npm ]; then
    "$package_manager" ci --include=dev --no-audit --no-fund || return $?
  else
    if [ -f package-lock.json ]; then "$package_manager" import || return $?; fi
    "$package_manager" install --frozen-lockfile --prod=false || return $?
  fi
  "$tools_node" --input-type=module -e 'await import("vite"); await import("tsx");' || return $?
  printf '%s\n' "$cache_key" > "$stamp_file"
}
