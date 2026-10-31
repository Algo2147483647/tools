"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { Worker } = require("node:worker_threads");
const math = require("./math.js");
const Program = require("./parametric-program.js");
const Mesher = require("./parametric-mesh.js");
const programs = Program.createProgram(math);
const mesh = Mesher.createMesher(programs);
const latex = require("./latex-import.js").createImporter(programs);
const { flower, flowerLatex, presets } = require("./parametric-presets.js");
const close = (a, b, tolerance = 1e-10) =>
  assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const base = "parameter u = [0, 1]\nparameter v = [0, 1]\n";
const plane = base + "X = u\nY = v\nZ = 0";
const build = (source, counts = [12, 10], extra = {}) =>
  mesh.build({ source, sampling: { counts }, ...extra });
function referenceFlower(r, theta) {
  const disturbance = Math.sin(15 * theta) / 150;
  const remainder =
    3.6 * theta - 2 * Math.PI * Math.floor((3.6 * theta) / (2 * Math.PI));
  const edge = 1 - 0.5 * (1 - remainder / Math.PI) ** 4 + disturbance;
  const angle = (Math.PI / 2) * Math.exp(-theta / (8 * Math.PI));
  const h = 2 * (r * r - r) ** 2 * Math.sin(angle);
  const R = r * Math.sin(angle) + h * Math.cos(angle),
    H = r * Math.cos(angle) - h * Math.sin(angle);
  return {
    point: [edge * R * Math.cos(theta), edge * R * Math.sin(theta), edge * H],
    edge,
    h,
    R,
    H,
  };
}
function coordinates(result, offset) {
  return [0, 1, 2].map(
    (axis) =>
      result.data[offset + axis] * result.transform.scale +
      result.transform.center[axis],
  );
}
function workerSource() {
  // Execute the production Blob-worker factory in a real Node worker.
  const app = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  const start = app.indexOf("function workerSource()"),
    end = app.indexOf("async function render()", start);
  const context = vm.createContext({
    SurfaceMath: math,
    SurfaceMesher: require("./mesh.js"),
    SurfaceProgram: Program,
    SurfaceParametricMesher: Mesher,
  });
  return vm.runInContext(`(${app.slice(start, end).trim()})()`, context);
}
async function workerBuild(options) {
  const source = workerSource();
  const worker = new Worker(
    `const {parentPort}=require('node:worker_threads'); global.self={postMessage:(data,transfer)=>parentPort.postMessage(data,transfer)}; ${source}; parentPort.on('message',data=>self.onmessage({data}));`,
    { eval: true },
  );
  try {
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Worker timed out.")),
        15000,
      );
      worker.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      worker.on("message", (data) => {
        if (data.type === "progress") return;
        clearTimeout(timeout);
        if (data.type === "error") reject(new Error(data.message));
        else resolve(data.result);
      });
      worker.postMessage(options);
    });
  } finally {
    await worker.terminate();
  }
}
async function main() {
  const compiled = programs.compile(flower);
  for (const r of [0, 0.1, 0.5, 1])
    for (const theta of [4 * Math.PI, 17.3, 40, 24 * Math.PI]) {
      const actual = compiled.evaluate(r, theta),
        expected = referenceFlower(r, theta);
      actual.forEach((value, i) => close(value, expected.point[i]));
      close(expected.R ** 2 + expected.H ** 2, r * r + expected.h ** 2);
      close(
        actual.reduce((s, v) => s + v * v, 0),
        expected.edge ** 2 * (r * r + expected.h ** 2),
      );
      if (r === 0) actual.forEach((value) => close(value, 0));
    }
  const cachedGrid = compiled.sampling({ counts: [9, 13] }),
    cached = compiled.createSampler(cachedGrid);
  for (const i of [0, 3, 9])
    for (const j of [0, 5, 13]) {
      const expected = compiled.evaluate(
        i / 9,
        4 * Math.PI + j * cachedGrid.steps[1],
      );
      cached(i, j, [0, 0, 0]).forEach((v, k) => close(v, expected[k]));
    }
  const syntax = programs.compile(
    base +
      "const a = b+1\nconst b = 2\nf(t) = a*t\nR = f(u)\nX = R + 2v\nY = -2^2 + 2^3^2\nZ = mod(-1, 3) + floor(1.9) + ceil(1.1)",
  );
  assert.deepEqual(syntax.evaluate(0.5, 0.25), [2, 508, 5]);
  assert.deepEqual(
    programs.compile(base + "X = π\nY = 2×u−v\nZ = u²").evaluate(0.5, 0.25),
    [Math.PI, 0.75, 0.25],
  );
  const cases = [
    [base + "X = uv\nY = v\nZ = 0", /Unknown name/],
    [plane + "\nX = 2", /Duplicate/],
    [base + "X = R\nR = X\nY = v\nZ = 0", /Circular dependency: X → R → X/],
    [plane + "\nf(t) = g(t)\ng(t) = f(t)", /Circular dependency/],
    [plane + "\nf(t) = t+u", /Pass “u” explicitly/],
    [base + "X = sin(u,v)\nY = v\nZ = 0", /expects 1/],
    [base + "X = constructor(u)\nY = v\nZ = 0", /Unknown function/],
    [base + "const pi = 3\nX = u\nY = v\nZ = 0", /reserved/],
    [base + "X = u\nY = v", /Missing coordinate output Z/],
    [plane.replace("[0, 1]", "[1, 0]"), /increasing bounds/],
    [plane.replace("[0, 1]", "[0, v]"), /only constants/],
    [base + "X = u\nY = v\nZ = globalThis.process", /Unexpected character/],
    [base + "X = u\nY = v\nZ = " + "1+".repeat(150) + "1", /tree depth/],
    [
      "parameter u = [0, 1]\nparameter v = [0, 1]\nX = u\nY = v\nZ = missing",
      /Line 5, column 5/,
    ],
  ];
  cases.forEach(([source, expected]) =>
    assert.throws(() => programs.compile(source), expected),
  );
  assert.throws(() => compiled.sampling({ counts: [1000, 1000] }), /420,000/);
  assert.throws(
    () => compiled.sampling({ mode: "step", steps: [0, 1] }),
    /positive finite/,
  );
  const stepGrid = compiled.sampling({ mode: "step", steps: [0.1, 0.1] });
  assert.deepEqual(stepGrid.counts, [10, 629]);
  assert.ok(stepGrid.steps.every((value) => value <= 0.1));
  console.log(
    "PASS: case-sensitive programs, scope, cycles, syntax, source locations, budgets, cached evaluation, and flower identities",
  );

  const imported = latex.convert(flowerLatex),
    importedProgram = programs.compile(imported.source);
  for (const r of [0, 0.3, 1])
    for (const theta of [4 * Math.PI, 20, 71.1, 24 * Math.PI])
      importedProgram
        .evaluate(r, theta)
        .forEach((v, k) => close(v, compiled.evaluate(r, theta)[k]));
  // Chat-escaped variants and non-English user annotations must retain their meaning.
  const escaped = flowerLatex
    .replace(/align\*/g, "align\\*")
    .replace(/f_2/g, "f\\_2")
    .replace("Petal edge", "\u82b1\u8fb9");
  assert.ok(latex.convert(escaped).source.includes("# \u82b1\u8fb9"));
  const chatRows = escaped
    .replaceAll(String.raw`\\` + "\n", String.raw`\\\\` + "\n")
    .replace(String.raw`R\\H`, String.raw`R\\\ H`);
  programs
    .compile(latex.convert(chatRows).source)
    .evaluate(0.5, 20)
    .forEach((value, axis) =>
      close(value, referenceFlower(0.5, 20).point[axis]),
    );
  assert.throws(
    () => latex.convert(flowerLatex.replace("\\frac", "\\unknown")),
    /Unsupported command/,
  );
  assert.throws(
    () =>
      latex.convert(flowerLatex.replace("matrix}R\\\\H", "matrix}R&Q\\\\H")),
    /equal lengths/,
  );
  assert.throws(
    () => latex.convert(flowerLatex.replace("\\end{align*}", "\\end{aligned}")),
    /do not match/,
  );
  assert.ok(imported.mappings.length > 15);
  console.log(
    "PASS: LaTeX flower import, matrix expansion, escaped input, annotations, and failure diagnostics",
  );

  const flat = await build(plane);
  assert.equal(flat.triangles, 240);
  assert.deepEqual(flat.geometryBounds, [
    [0, 1],
    [0, 1],
    [0, 0],
  ]);
  for (let i = 0; i < flat.data.length; i += 6) {
    close(coordinates(flat, i)[2], 0, 1e-7);
    close(flat.data[i + 5], 1, 1e-7);
  }
  for (const preset of presets) {
    const counts = preset.id === "parametric-flower" ? preset.counts : [32, 24];
    const result = await build(preset.program, counts, {
      boundaries: preset.boundaries,
    });
    assert.ok(result.data.every(Number.isFinite), preset.id);
    assert.ok(result.triangles > 0, preset.id);
    for (let i = 0; i < result.data.length; i += 6) {
      const point = coordinates(result, i);
      if (preset.id === "parametric-sphere")
        close(Math.hypot(...point), 2, 1e-6);
      if (preset.id === "parametric-torus")
        close(
          (Math.hypot(point[0], point[1]) - 2) ** 2 + point[2] ** 2,
          0.36,
          2e-6,
        );
      close(Math.hypot(...result.data.slice(i + 3, i + 6)), 1, 1e-6);
    }
    if (preset.id === "parametric-flower") {
      assert.equal(result.triangles, 260096);
      assert.equal(result.diagnostics.degenerateTriangles, 2048);
    }
  }
  await assert.rejects(
    build(flower, [8, 16], { boundaries: ["open", "periodic"] }),
    /endpoints do not match/,
  );
  const partial = await build(base + "X = u\nY = v\nZ = sqrt(u-.5)");
  assert.ok(
    partial.invalid > 0 &&
      partial.diagnostics.omittedCells > 0 &&
      partial.triangles > 0,
  );
  await assert.rejects(build(base + "X = u\nY = 0\nZ = 0"), /two-dimensional/);
  await assert.rejects(
    build(base + "X = sqrt(-1)\nY = v\nZ = 0"),
    /undefined throughout/,
  );
  await assert.rejects(
    build(base + "X = 0\nY = 0\nZ = 0"),
    /collapses to a point/,
  );
  await assert.rejects(
    build(base + "X = u\nY = v\nZ = 1e308"),
    /relative to the surface size/,
  );
  await assert.rejects(
    build(base + "X = u\nY = v\nZ = 1/(u-.5)", [1, 4]),
    /two-dimensional/,
  );
  console.log(
    "PASS: all parametric presets, bounds, normals, poles, seams, undefined regions, and degenerate mappings",
  );
}
// Keep cancellation and worker checks separate so failures clearly name their stage.
async function executionChecks() {
  assert.equal(
    await mesh.build(
      { source: plane, sampling: { counts: [8, 8] } },
      () => {},
      () => true,
    ),
    null,
  );
  let cancel = false;
  assert.equal(
    await mesh.build(
      { source: flower, sampling: { counts: [64, 2048] } },
      () => {
        cancel = true;
      },
      () => cancel,
    ),
    null,
  );
  const request = {
    kind: "parametric-surface",
    source: plane,
    sampling: { counts: [12, 10] },
  };
  const direct = await mesh.build(request),
    worker = await workerBuild(request);
  assert.deepEqual(worker.data, direct.data);
  assert.deepEqual(worker.viewBounds, direct.viewBounds);
  await assert.rejects(
    workerBuild({ ...request, source: plane.replace("X = u", "X = missing") }),
    /Unknown name/,
  );
  const implicit = await workerBuild({
    kind: "implicit",
    expression: "x^2+y^2+z^2=1",
    domain: [
      [-2, 2],
      [-2, 2],
      [-2, 2],
    ],
    resolution: 12,
  });
  assert.ok(implicit.triangles > 0);
  console.log(
    "PASS: preflight and in-flight cancellation, real worker transfer, worker errors, and both geometry dispatch paths",
  );
}
main()
  .then(executionChecks)
  .then(() => console.log("All parametric surface checks passed."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
