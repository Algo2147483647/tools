"use strict";
/* DOM integration checks; this does not substitute for visual/WebGL browser QA.
   Usage: node ui-tests.cjs [absolute path to an external jsdom installation] */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Worker: NodeWorker } = require("node:worker_threads");
const { JSDOM } = require(process.argv[2] || "jsdom");
async function harness(fallback = false) {
  const dom = new JSDOM(
    fs.readFileSync(path.join(__dirname, "index.html"), "utf8"),
    { runScripts: "outside-only", url: "https://surface.test/" },
  );
  const { window } = dom,
    document = window.document;
  const meshes = [],
    workers = new Set(),
    blobs = new Map();
  const renderer = {
    setMesh: (result) => meshes.push(result),
    setAppearance() {},
    setMeshVisible() {},
    setGuides() {},
    setBox() {},
    zoom() {},
    reset() {},
    setRotation() {},
  };
  window.matchMedia = () => ({ matches: false });
  window.ResizeObserver = class {
    observe() {}
  };
  window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  window.Blob = class {
    constructor(parts) {
      this.source = parts.join("");
    }
  };
  window.URL.createObjectURL = (blob) => {
    const id = "blob:test-" + blobs.size;
    blobs.set(id, blob.source);
    return id;
  };
  window.URL.revokeObjectURL = (id) => blobs.delete(id);
  window.Worker = class {
    constructor(url) {
      if (fallback) throw new Error("Worker unavailable in fallback fixture.");
      this.worker = new NodeWorker(
        `const {parentPort}=require('node:worker_threads'); global.self={postMessage:(data,transfer)=>parentPort.postMessage(data,transfer)}; ${blobs.get(url)}; parentPort.on('message',data=>self.onmessage({data}));`,
        { eval: true },
      );
      workers.add(this.worker);
      this.worker.on("message", (data) => this.onmessage?.({ data }));
      this.worker.on("error", (error) =>
        this.onerror?.({ message: error.message, preventDefault() {} }),
      );
    }
    postMessage(data) {
      this.worker.postMessage(data);
    }
    terminate() {
      workers.delete(this.worker);
      this.worker.terminate();
    }
  };
  const scripts = Array.from(
    document.querySelectorAll("script[src]"),
    (element) => element.getAttribute("src"),
  );
  for (const file of scripts) {
    if (file === "renderer.js")
      window.SurfaceRenderer = { createRenderer: () => renderer };
    else window.eval(fs.readFileSync(path.join(__dirname, file), "utf8"));
  }
  const $ = (id) => document.getElementById(id);
  const change = (id, value, event = "change") => {
    $(id).value = value;
    $(id).dispatchEvent(new window.Event(event, { bubbles: true }));
  };
  const render = () =>
    $("program-form").dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
  const waitFor = async (predicate) => {
    const deadline = Date.now() + 15000;
    while (!predicate()) {
      if (Date.now() > deadline)
        throw new Error(
          "DOM test timed out: " +
            $("mesh-status").textContent +
            " / " +
            $("program-error").textContent,
        );
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
  };
  return {
    dom,
    window,
    document,
    meshes,
    $,
    change,
    render,
    waitFor,
    close: async () => {
      window.dispatchEvent(new window.Event("pagehide"));
      await Promise.all([...workers].map((worker) => worker.terminate()));
      dom.window.close();
    },
  };
}
async function main() {
  const h = await harness();
  try {
    const { $, change, render, waitFor, meshes, window, document } = h;
    await waitFor(() => meshes.length === 1);
    assert.equal($("surface-name").textContent, "Sphere");
    assert.equal($("parametric-controls").hidden, true);
    change("surface-mode", "parametric-surface");
    await waitFor(() => meshes.length === 2);
    assert.equal($("equation-form").hidden, true);
    assert.equal($("program-state").textContent, "Applied");
    assert.equal(meshes[1].triangles, 260096);
    assert.match($("parameter-domain").textContent, /theta/);
    const original = $("program-source").value,
      published = meshes[1];
    change(
      "program-source",
      original.replace("Z = edge(theta)*H", "Z = missing"),
      "input",
    );
    render();
    assert.match($("program-error").textContent, /Unknown name/);
    assert.equal(meshes.at(-1), published);
    assert.equal($("locate-program-error").hidden, false);
    $("locate-program-error").click();
    assert.ok($("program-source").selectionStart > 0);
    assert.ok(document.querySelector("#program-lines .error-line"));
    change("program-source", original, "input");
    change("parameter-sampling-mode", "step");
    assert.ok(Number($("parameter-value-0").value) < 1);
    change("parameter-sampling-mode", "cells");
    assert.equal(Number($("parameter-value-0").value), 64);
    assert.equal(Number($("parameter-value-1").value), 2048);
    $("import-latex").click();
    assert.equal($("latex-dialog").open, true);
    $("latex-example").click();
    $("convert-latex").click();
    assert.equal($("apply-latex").disabled, false);
    assert.match($("latex-preview").value, /parameter theta/);
    $("apply-latex").click();
    assert.equal($("latex-dialog").open, false);
    assert.equal(meshes.at(-1), published);
    assert.equal($("program-state").textContent, "Unapplied changes");
    const imported = $("program-source").value;
    $("import-latex").click();
    change("latex-source", "\\unsupported", "input");
    assert.equal($("apply-latex").disabled, true);
    $("convert-latex").click();
    assert.match($("latex-error").textContent, /Unsupported command/);
    assert.equal($("program-source").value, imported);
    $("latex-dialog").close();
    render();
    $("cancel-render").click();
    assert.equal($("surface").getAttribute("aria-busy"), "false");
    assert.match($("mesh-status").textContent, /cancelled/);
    assert.equal(meshes.at(-1), published);
    // Supersede pending work with a different valid surface.
    render();
    document.querySelector('[data-preset="parametric-plane"]').click();
    await waitFor(() => meshes.length === 3);
    assert.equal(meshes[2].triangles, 2048);
    assert.equal($("surface-name").textContent, "Parametric plane");
    change("parameter-boundary-0", "periodic");
    render();
    await waitFor(() => !$("program-error").hidden);
    assert.match($("program-error").textContent, /endpoints do not match/);
    assert.equal(meshes.length, 3);
    change("surface-mode", "implicit");
    await waitFor(() => meshes.length === 4);
    assert.equal($("expression").value, "x^2 + y^2 + z^2 = 4");
    assert.equal($("surface-name").textContent, "Sphere");
    assert.equal($("parametric-controls").hidden, true);
    assert.equal($("domain-form").closest("section").hidden, false);
    console.log(
      "PASS: DOM editor modes, drafts, located errors, sampling conversion, LaTeX import, cancel, latest request, periodic errors, and implicit restoration",
    );
  } finally {
    await h.close();
  }
  const fallback = await harness(true);
  try {
    await fallback.waitFor(() => fallback.meshes.length === 1);
    fallback.document.querySelector('[data-preset="parametric-plane"]').click();
    await fallback.waitFor(() => fallback.meshes.length === 2);
    assert.equal(fallback.meshes[1].triangles, 2048);
    assert.equal(fallback.$("program-state").textContent, "Applied");
    console.log(
      "PASS: DOM workflow with Worker construction blocked and chunked main-thread fallback",
    );
  } finally {
    await fallback.close();
  }
}
main()
  .then(() =>
    console.log(
      "All DOM integration checks passed (rendering stubbed; no visual verification).",
    ),
  )
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
