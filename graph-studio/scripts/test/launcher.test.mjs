import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { installFingerprint, parseOptions } from "../launch.mjs";

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "graph-studio-test-")));
  const parent = realpathSync(tmpdir());
  assert.ok(root.startsWith(parent + sep));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function run(script, args, cwd) {
  return spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });
}

test("startup options reject unknown and conflicting modes before installation", () => {
  assert.deepEqual(parseOptions([]), {});
  assert.deepEqual(parseOptions(["--dev", "--no-browser"]), { dev: true, noBrowser: true });
  assert.deepEqual(parseOptions(["--help"]), { help: true });
  const modes = ["--dev", "--preview", "--install-only", "--build-only"];
  for (const mode of modes) {
    for (const other of modes) {
      if (mode !== other) assert.throws(() => parseOptions([mode, other]), /Choose only one mode/);
    }
  }
  assert.throws(() => parseOptions(["--unknown"]), /Unknown option/);
});

test("dependency fingerprints include lockfile, configuration, manager and project location", (t) => {
  const root = fixture(t);
  const manager = { name: "npm", version: "test" };
  writeFileSync(join(root, "package.json"), '{"dependencies":{}}');
  writeFileSync(join(root, "package-lock.json"), '{"lockfileVersion":2}');
  const original = installFingerprint(root, manager);
  assert.equal(installFingerprint(root, manager), original);
  writeFileSync(join(root, "package-lock.json"), '{"lockfileVersion":3}');
  const changedLock = installFingerprint(root, manager);
  assert.notEqual(changedLock, original);
  writeFileSync(join(root, ".npmrc"), "ignore-scripts=false\n");
  const changedConfig = installFingerprint(root, manager);
  assert.notEqual(changedConfig, changedLock);
  assert.notEqual(installFingerprint(root, { ...manager, version: "next" }), changedConfig);
  assert.notEqual(installFingerprint(fixture(t), manager), changedConfig);
});

test("launcher help and invalid arguments work from an unrelated directory without installing", (t) => {
  const root = fixture(t);
  const launcher = fileURLToPath(new URL("../launch.mjs", import.meta.url));
  const help = run(launcher, ["--help"], root);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Graph Studio/);
  const invalid = run(launcher, ["--invalid"], root);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Unknown option/);
  assert.equal(existsSync(join(root, "node_modules")), false);
});

test("cleanup removes generated files and preserves source, dependencies and optional caches", (t) => {
  const root = fixture(t);
  mkdirSync(join(root, "scripts"));
  const script = join(root, "scripts/clean.mjs");
  copyFileSync(fileURLToPath(new URL("../clean.mjs", import.meta.url)), script);
  for (const name of ["dist", "test-results", "coverage", "src", "node_modules", ".npm-cache", "public"]) {
    mkdirSync(join(root, name));
    writeFileSync(join(root, name, "keep.txt"), "fixture");
  }
  writeFileSync(join(root, "build.log"), "generated");
  writeFileSync(join(root, "build.tsbuildinfo"), "generated");
  const result = run(script, [], tmpdir());
  assert.equal(result.status, 0, result.stderr);
  for (const name of ["dist", "test-results", "coverage", "build.log", "build.tsbuildinfo"])
    assert.equal(existsSync(join(root, name)), false, name);
  for (const name of ["src", "node_modules", ".npm-cache", "public"])
    assert.equal(existsSync(join(root, name, "keep.txt")), true, name);
  assert.equal(run(script, ["--cache"], tmpdir()).status, 0);
  assert.equal(existsSync(join(root, ".npm-cache")), false);
  assert.equal(existsSync(join(root, "node_modules/keep.txt")), true);
});

test("invalid cleanup options fail before removing output", (t) => {
  const root = fixture(t);
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "dist"));
  const script = join(root, "scripts/clean.mjs");
  copyFileSync(fileURLToPath(new URL("../clean.mjs", import.meta.url)), script);
  assert.equal(run(script, ["--all"], root).status, 1);
  assert.equal(existsSync(join(root, "dist")), true);
});
