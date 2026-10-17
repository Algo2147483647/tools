import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const projectPath = fileURLToPath(new URL("../", import.meta.url));

export function parseOptions(args) {
  const names = new Map([
    ["--dev", "dev"],
    ["--preview", "preview"],
    ["--install-only", "installOnly"],
    ["--build-only", "buildOnly"],
    ["--no-browser", "noBrowser"],
    ["--help", "help"],
  ]);
  const options = {};
  for (const arg of args) {
    const name = names.get(arg);
    if (!name) throw new Error(`Unknown option: ${arg}. Use --help.`);
    options[name] = true;
  }
  if ([options.dev, options.preview, options.installOnly, options.buildOnly].filter(Boolean).length > 1) {
    throw new Error("Choose only one mode: dev, preview, install-only or build-only.");
  }
  return options;
}

export function installFingerprint(root, manager) {
  const hash = createHash("sha256");
  for (const value of [
    "graph-studio-bootstrap-v2",
    process.version,
    process.platform,
    process.arch,
    root,
    manager.name,
    manager.version,
  ]) {
    hash.update(`${value}\n`);
  }
  for (const name of ["package.json", "package-lock.json", ".npmrc", "pnpm-workspace.yaml"]) {
    const file = join(root, name);
    if (existsSync(file)) hash.update(readFileSync(file));
  }
  return hash.digest("hex");
}

export function findPackageManager() {
  const nodeDirectory = dirname(realpathSync(process.execPath));
  const directories = [
    ...new Set(
      [
        nodeDirectory,
        dirname(nodeDirectory),
        join(dirname(nodeDirectory), "lib"),
        process.env.APPDATA && join(process.env.APPDATA, "npm"),
        ...(process.env.PATH || "").split(delimiter).filter(Boolean),
        join(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node"),
      ].filter(Boolean),
    ),
  ];
  for (const name of ["npm", "pnpm"]) {
    const entries = name === "npm" ? ["npm/bin/npm-cli.js"] : ["pnpm/bin/pnpm.cjs", "pnpm/bin/pnpm.mjs"];
    for (const directory of directories) {
      // Unix npm/pnpm executables are usually symlinks into their package.
      const executable = join(directory, name);
      const paths = entries.map((entry) => join(directory, "node_modules", entry));
      if (process.platform !== "win32" && existsSync(executable)) paths.unshift(realpathSync(executable));
      for (const path of paths) {
        if (!existsSync(path)) continue;
        const result = spawnSync(process.execPath, [path, "--version"], { encoding: "utf8" });
        if (result.status === 0) return { name, path, version: result.stdout.trim() };
      }
    }
  }
  throw new Error("npm or pnpm could not be found. Install Node.js LTS including npm, then retry.");
}

export function dependenciesReady(root) {
  const probe = `
    const fs = require('node:fs');
    const path = require('node:path');
    try {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      for (const name of Object.keys({...pkg.dependencies, ...pkg.devDependencies})) {
        if (!fs.existsSync(path.join('node_modules', name, 'package.json'))) process.exit(1);
      }
      for (const file of ['node_modules/vite/bin/vite.js', 'node_modules/typescript/bin/tsc']) {
        if (!fs.existsSync(file)) process.exit(1);
      }
      require('esbuild').transformSync('const value: number = 1', {loader: 'ts'});
      import('vite').catch(() => process.exit(1));
    } catch { process.exit(1); }
  `;
  return spawnSync(process.execPath, ["-e", probe], { cwd: root, stdio: "ignore" }).status === 0;
}

function run(args, root) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error(`Command failed: ${args[0]}`);
    const interrupted = result.signal === "SIGINT" || [130, 0xc000013a, -1073741510].includes(result.status);
    error.exitCode = interrupted ? 130 : (result.status ?? 1);
    throw error;
  }
}

function assertNoRunningCompiler(root) {
  if (process.platform !== "win32") return;
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `
    $prefix = [IO.Path]::GetFullPath($env:GRAPH_STUDIO_PROJECT).TrimEnd('\\') + '\\node_modules\\'
    $running = Get-Process -Name esbuild -ErrorAction SilentlyContinue | Where-Object {
      $_.Path -and $_.Path.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)
    }
    if ($running) { Write-Output ($running.Id -join ', '); exit 2 }
    exit 0
  `,
    ],
    { encoding: "utf8", env: { ...process.env, PSModulePath: "", GRAPH_STUDIO_PROJECT: root } },
  );
  if (result.status === 2)
    throw new Error(`Close Graph Studio servers before updating dependencies (esbuild PID: ${result.stdout.trim()}).`);
  if (result.status !== 0) throw new Error("Could not check for running Graph Studio compilers before installation.");
}

export function initialize(root) {
  const manager = findPackageManager();
  const fingerprint = installFingerprint(root, manager);
  const stamp = join(root, "node_modules/.graph-studio-install");
  if (existsSync(stamp) && readFileSync(stamp, "utf8") === fingerprint && dependenciesReady(root)) {
    console.log("Dependencies are ready.");
    return;
  }
  assertNoRunningCompiler(root);
  rmSync(stamp, { force: true });
  console.log(`Installing dependencies with ${manager.name}...`);
  if (manager.name === "npm") {
    run([manager.path, "ci", "--include=dev", "--no-audit", "--no-fund"], root);
  } else {
    run([manager.path, "import"], root);
    run([manager.path, "install", "--frozen-lockfile", "--prod=false"], root);
  }
  if (!dependenciesReady(root))
    throw new Error("Dependency verification failed. Retry the launcher to repair the installation.");
  writeFileSync(stamp, fingerprint);
}

export function main(args = process.argv.slice(2)) {
  const options = parseOptions(args);
  if (options.help) {
    console.log(
      "Graph Studio: launch.cmd [PowerShell options] / bash launch.command [options]\n" +
        "  --dev           Development server (default)\n" +
        "  --install-only  Prepare dependencies only\n" +
        "  --build-only    Type-check and build only\n" +
        "  --preview       Build and serve production output\n" +
        "  --no-browser    Do not open the browser\n" +
        "Windows options: -Dev, -InstallOnly, -BuildOnly, -Preview, -NoBrowser, -Help.",
    );
    return;
  }
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 12)) throw new Error("Node.js 22.12+ is required.");
  process.env.PATH = `${dirname(process.execPath)}${delimiter}${process.env.PATH || ""}`;
  console.log(`Using Node.js ${process.version} (${process.execPath})`);
  initialize(projectPath);
  if (options.installOnly) return;
  if (options.buildOnly || options.preview) {
    run(["node_modules/typescript/bin/tsc", "--noEmit"], projectPath);
    run(["node_modules/vite/bin/vite.js", "build"], projectPath);
    if (options.buildOnly) return;
  }
  const viteArgs = ["node_modules/vite/bin/vite.js"];
  if (options.preview) viteArgs.push("preview");
  viteArgs.push("--host", "127.0.0.1");
  if (!options.noBrowser) viteArgs.push("--open");
  console.log("Starting Graph Studio. Keep this window open. Press Ctrl+C to stop.");
  run(viteArgs, projectPath);
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    if (error.exitCode !== 130) console.error(error.message);
    process.exitCode = error.exitCode || 1;
  }
}
