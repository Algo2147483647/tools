(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const presets = [...SurfacePresets, ...SurfaceParametricPresets.presets];
  const programs = SurfaceProgram.createProgram(SurfaceMath);
  const latex = SurfaceLatex.createImporter(programs);
  let mode = "implicit",
    activeProgram = "",
    activeProgramSettings = "",
    programError = null;
  let appearance = SurfaceColors.fromPalette("glacier");
  const normalize = (text) => text.replace(/\s/g, "").toLowerCase();
  let renderer,
    worker = null,
    generation = 0,
    lastStatus = "Preparing surface…",
    busy = false,
    workerURL = null;
  let activeExpression = $("expression").value;
  $("program-source").value = SurfaceParametricPresets.flower;
  const implicitSections = [
    $("domain-form").closest("section"),
    $("sampling-form").closest("section"),
  ];
  function parameterOptions() {
    const precision = $("parameter-sampling-mode").value;
    const values = [0, 1].map((i) => Number($("parameter-value-" + i).value));
    return {
      mode: precision,
      [precision === "step" ? "steps" : "counts"]: values,
    };
  }
  const parameterBoundaries = () =>
    [0, 1].map((i) => $("parameter-boundary-" + i).value);
  const parameterSettings = () =>
    JSON.stringify([parameterOptions(), parameterBoundaries()]);
  function updateProgramLines() {
    const gutter = $("program-lines");
    gutter.replaceChildren();
    $("program-source")
      .value.split("\n")
      .forEach((_, i) => {
        const line = document.createElement("span");
        line.textContent = String(i + 1);
        if (i + 1 === programError?.line) line.className = "error-line";
        gutter.append(line);
      });
    gutter.scrollTop = $("program-source").scrollTop;
  }
  function reportProgramError(error) {
    programError = error;
    setError("program-error", error?.message || "");
    $("locate-program-error").hidden = !error?.offset && error?.offset !== 0;
    $("program-source").setAttribute("aria-invalid", String(!!error));
    updateProgramLines();
  }
  function updateProgramPreview() {
    $("program-state").textContent =
      $("program-source").value === activeProgram &&
      parameterSettings() === activeProgramSettings
        ? "Applied"
        : "Unapplied changes";
    const step = $("parameter-sampling-mode").value === "step";
    $("parameter-value-heading").textContent = step ? "Step" : "Cells";
    [0, 1].forEach((i) => {
      const input = $("parameter-value-" + i);
      input.step = step ? "any" : "1";
      input.min = step ? "0" : "1";
      if (step) input.removeAttribute("max");
      else input.max = "16384";
    });
    try {
      const program = programs.compile($("program-source").value);
      $("parameter-domain").textContent = program.parameters
        .map(
          (name, i) =>
            `${name}: ${program.domain[i].map((v) => Number(v.toPrecision(7))).join(" → ")}`,
        )
        .join("\n");
      program.parameters.forEach((name, i) => {
        $("parameter-label-" + i).textContent = name;
        $("parameter-value-" + i).setAttribute(
          "aria-label",
          `${name} ${step ? "step size" : "cell count"}`,
        );
        $("parameter-boundary-" + i).setAttribute(
          "aria-label",
          `${name} boundary`,
        );
      });
      const grid = program.sampling(parameterOptions());
      $("parameter-sampling-preview").textContent =
        `${grid.counts.join(" × ")} cells · ${grid.points.toLocaleString()} points\nUp to ${(grid.cells * 2).toLocaleString()} triangles · estimated ${(grid.bytes / 1048576).toFixed(1)} MiB\nActual steps: ${grid.steps.map((v) => Number(v.toPrecision(5))).join(" / ")}`;
    } catch (error) {
      $("parameter-sampling-preview").textContent = error.message;
      $("parameter-domain").textContent =
        "Parameter ranges are defined in the program. Render to locate input errors.";
    }
  }
  function setMode(value) {
    if (mode !== value) {
      generation++;
      worker?.terminate();
      worker = null;
      setBusy(false);
      $("mesh-status").textContent = lastStatus;
    }
    mode = value;
    $("surface-mode").value = value;
    const parametric = mode === "parametric-surface";
    document.body.classList.toggle("parametric-mode", parametric);
    $("equation-form").hidden = parametric;
    $("edit-program").hidden = !parametric;
    $("parametric-controls").hidden = !parametric;
    implicitSections.forEach((section) => (section.hidden = parametric));
    document.querySelector(".scene-heading h1").textContent = parametric
      ? "Parametric surfaces"
      : "Implicit surfaces";
    setError("expression-error", "");
    if (parametric) {
      $("config-body").hidden = false;
      $("config-toggle").setAttribute("aria-expanded", "true");
      updateProgramPreview();
      updateProgramLines();
    }
  }
  const axisInputs = ["x", "y", "z"].map((axis) => [
    $(`${axis}-min`),
    $(`${axis}-max`),
  ]);
  const readDomain = () =>
    axisInputs.map((pair) =>
      pair.map((input) =>
        input.value.trim() === "" ? NaN : Number(input.value),
      ),
    );
  function samplingOptions() {
    const mode = $("quality").value;
    return mode === "step"
      ? { step: Number($("sample-step").value) }
      : {
          resolution: Number(
            mode === "custom" ? $("sample-resolution").value : mode,
          ),
        };
  }
  function updateSamplingPreview() {
    const mode = $("quality").value;
    $("resolution-control").hidden = mode !== "custom";
    $("step-control").hidden = mode !== "step";
    $("sampling-hint").textContent =
      mode === "step"
        ? "Domain units · smaller steps give finer detail."
        : "8–128 cells per axis · more cells give finer detail.";
    try {
      const grid = SurfaceMath.samplingGrid(readDomain(), samplingOptions());
      $("sampling-grid").value = `${grid.counts.join(" × ")} cells`;
      $("sampling-grid").title =
        `${grid.points.toLocaleString()} grid points to sample`;
      grid.steps.forEach(
        (step, i) =>
          ($("step-" + "xyz"[i]).value = Number(
            step.toPrecision(4),
          ).toString()),
      );
    } catch {
      $("sampling-grid").value = "Enter a valid domain and precision.";
      $("sampling-grid").title = "";
      for (const axis of "xyz") $("step-" + axis).value = "—";
    }
  }
  function setError(id, message) {
    const el = $(id);
    el.textContent = message;
    el.hidden = !message;
  }
  function message(title, body) {
    const el = $("message");
    el.replaceChildren();
    if (title) {
      const heading = document.createElement("strong");
      heading.textContent = title;
      el.append(heading, document.createTextNode(body));
    }
    el.hidden = !title;
  }
  function setBusy(value) {
    busy = value;
    $("status-dot").classList.toggle("busy", value);
    $("surface").setAttribute("aria-busy", String(value));
    $("cancel-render").hidden = !value;
  }
  function reportFatal(error) {
    renderer = null;
    message("The 3D view is unavailable", error);
    setBusy(false);
    $("mesh-status").textContent = "Renderer unavailable";
  }
  try {
    renderer = SurfaceRenderer.createRenderer(
      $("surface"),
      $("labels"),
      (value) => $("auto-rotate").setAttribute("aria-pressed", String(value)),
    );
  } catch (error) {
    reportFatal(error.message);
  }
  $("surface").addEventListener("renderer-error", (event) => {
    ++generation;
    worker?.terminate();
    reportFatal(event.detail);
  });
  function updatePresetState(expression, kind = "implicit") {
    const selected = presets.find(
      (p) =>
        (p.kind || "implicit") === kind &&
        (kind === "implicit"
          ? normalize(p.expression) === normalize(expression)
          : p.program.replace(/\s/g, "") === expression.replace(/\s/g, "")),
    );
    $("surface-name").textContent = selected ? selected.name : "Custom surface";
    document
      .querySelectorAll("[data-preset]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.preset === selected?.id),
        ),
      );
    return selected;
  }
  function workerSource() {
    return `"use strict";
      const math=(${SurfaceMath.createMath.toString()})();
      const mesher=(${SurfaceMesher.createMesher.toString()})(math);
      const programs=(${SurfaceProgram.createProgram.toString()})(math);
      const parametric=(${SurfaceParametricMesher.createMesher.toString()})(programs);
      self.onmessage=async ({data})=>{
        try { const result=await (data.kind === "parametric-surface" ? parametric : mesher).build(data,p=>self.postMessage({type:"progress",value:p}));
          self.postMessage({type:"result",result},[result.data.buffer]);
        } catch(error){ self.postMessage({type:"error",message:error.message}); }
      };`;
  }
  async function render() {
    if (!renderer) return;
    // A new request supersedes pending work even when its input is invalid.
    const job = ++generation;
    worker?.terminate();
    worker = null;
    setBusy(false);
    $("mesh-status").textContent = lastStatus;
    const kind = mode,
      isParametric = kind === "parametric-surface";
    const source = $("program-source").value;
    const settings = parameterSettings();
    let options;
    const expression = $("expression").value.trim(),
      sampling = samplingOptions();
    setError("expression-error", "");
    setError("domain-error", "");
    setError("sampling-error", "");
    for (const id of ["sample-step", "sample-resolution"])
      $(id).removeAttribute("aria-invalid");
    $("expression").removeAttribute("aria-invalid");
    axisInputs.flat().forEach((input) => input.removeAttribute("aria-invalid"));
    if (isParametric) {
      reportProgramError(null);
      try {
        programs.compile(source).sampling(parameterOptions());
        options = {
          kind,
          source,
          sampling: parameterOptions(),
          boundaries: parameterBoundaries(),
        };
      } catch (error) {
        reportProgramError(error);
        $("config-body").hidden = false;
        $("config-toggle").setAttribute("aria-expanded", "true");
        return;
      }
      updateProgramPreview();
    } else {
      try {
        SurfaceMath.compile(expression);
      } catch (error) {
        setError("expression-error", error.message);
        $("expression").setAttribute("aria-invalid", "true");
        return;
      }
      const domain = readDomain();
      try {
        SurfaceMath.validateDomain(domain, 1);
      } catch (error) {
        setError("domain-error", error.message);
        const axis = "XYZ".indexOf(error.message[0]);
        (axis >= 0 ? axisInputs[axis] : axisInputs.flat()).forEach((input) =>
          input.setAttribute("aria-invalid", "true"),
        );
        $("config-body").hidden = false;
        $("config-toggle").setAttribute("aria-expanded", "true");
        return;
      }
      try {
        SurfaceMath.samplingGrid(domain, sampling);
      } catch (error) {
        setError("sampling-error", error.message);
        $(
          $("quality").value === "step" ? "sample-step" : "sample-resolution",
        ).setAttribute("aria-invalid", "true");
        $("config-body").hidden = false;
        $("config-toggle").setAttribute("aria-expanded", "true");
        return;
      }
      updateSamplingPreview();
      options = { kind, expression, domain, ...sampling };
    }
    setBusy(true);
    message("", "");
    $("mesh-status").textContent = isParametric
      ? "Compiling program…"
      : "Sampling field…";
    function progress(value) {
      if (job === generation)
        $("mesh-status").textContent =
          typeof value === "string" ? value : `Building surface · ${value}%`;
    }
    function failure(error) {
      if (job !== generation) return;
      setBusy(false);
      $("mesh-status").textContent = lastStatus;
      if (isParametric)
        reportProgramError(
          typeof error === "string" ? new Error(error) : error,
        );
      else setError("expression-error", error);
      worker?.terminate();
      worker = null;
    }
    function finish(result) {
      if (job !== generation || !result) return;
      try {
        renderer.setMesh(result);
      } catch (error) {
        failure(error.message);
        return;
      }
      setBusy(false);
      if (isParametric) {
        activeProgram = source;
        activeProgramSettings = settings;
        updateProgramPreview();
      } else activeExpression = expression;
      updatePresetState(isParametric ? source : expression, kind);
      const description = isParametric
        ? "Parametric surface"
        : expression.includes("=")
          ? expression
          : `${expression} = 0`;
      $("surface").setAttribute(
        "aria-label",
        `3D surface: ${description}. Drag or use arrow keys to orbit; Shift-drag to pan; scroll or press plus and minus to zoom; 0 to fit.`,
      );
      lastStatus = result.triangles
        ? `${result.triangles.toLocaleString()} triangles${result.invalid ? " · partial domain" : ""}`
        : "No surface";
      $("mesh-status").textContent = lastStatus;
      $("mesh-status").title = result.invalid
        ? `${result.invalid.toLocaleString()} grid samples were outside the equation's real-valued domain.`
        : "Numerical approximation within the configured domain.";
      if (isParametric) {
        const d = result.diagnostics;
        $("mesh-status").title =
          `${d.invalidSamples} undefined samples; ${d.omittedCells} omitted cells; ${d.degenerateTriangles} degenerate triangles; ${d.suspectCells} cells with possible unresolved detail.`;
        $("parameter-diagnostics").hidden = !Object.values(d).some(Boolean);
        $("parameter-diagnostics-text").textContent =
          $("mesh-status").title +
          (d.suspectCells
            ? " Increase sampling or narrow the ranges to inspect possible discontinuities. Finite suspect cells are retained."
            : "");
      }
      if (result.reason === "undefined")
        message(
          "No real values here",
          "The equation is undefined throughout this domain. Check divisions, roots, and logarithms, or change the range.",
        );
      else if (result.reason === "volume")
        message(
          "This equation fills the region",
          "Every sampled point satisfies the equation. Use an equation that defines a boundary, such as x² + y² + z² = 4.",
        );
      else if (!result.triangles)
        message(
          "No surface found in this region",
          "Try a different domain or more detail. Features smaller than a grid cell and zeros that only touch zero may not be detected.",
        );
      else message("", "");
      worker?.terminate();
      worker = null;
    }
    // Blob workers also run when index.html is opened directly from the filesystem.
    // A chunked main-thread path keeps the app usable if workers are unavailable.
    async function fallback() {
      try {
        finish(
          await (
            isParametric
              ? SurfaceParametricMesher.createMesher(programs)
              : SurfaceMesher.createMesher(SurfaceMath)
          ).build(options, progress, () => job !== generation),
        );
      } catch (error) {
        failure(error.message);
      }
    }
    try {
      if (!workerURL)
        workerURL = URL.createObjectURL(
          new Blob([workerSource()], { type: "text/javascript" }),
        );
      worker = new Worker(workerURL);
      worker.onmessage = ({ data }) => {
        if (job !== generation) return;
        if (data.type === "progress") progress(data.value);
        else if (data.type === "result") finish(data.result);
        else failure(data.message);
      };
      worker.onerror = (event) => {
        event.preventDefault();
        if (job !== generation) return;
        worker?.terminate();
        worker = null;
        fallback();
      };
      worker.postMessage(options);
    } catch {
      worker?.terminate();
      worker = null;
      await fallback();
    }
  }
  for (const id of [
    "equation-form",
    "domain-form",
    "sampling-form",
    "program-form",
  ])
    $(id).addEventListener("submit", (event) => {
      event.preventDefault();
      render();
    });
  $("quality").addEventListener("change", () => {
    updateSamplingPreview();
    render();
  });
  for (const input of [
    ...axisInputs.flat(),
    $("sample-resolution"),
    $("sample-step"),
  ])
    input.addEventListener("input", updateSamplingPreview);
  updateSamplingPreview();
  $("config-toggle").addEventListener("click", () => {
    const expanded =
      $("config-toggle").getAttribute("aria-expanded") === "true";
    $("config-toggle").setAttribute("aria-expanded", String(!expanded));
    $("config-body").hidden = expanded;
  });
  if (matchMedia("(max-width: 700px), (max-height: 550px)").matches) {
    $("config-toggle").setAttribute("aria-expanded", "false");
    $("config-body").hidden = true;
  }
  for (const [id, method] of [
    ["wireframe", "setMeshVisible"],
    ["show-grid", "setGuides"],
    ["show-box", "setBox"],
  ])
    $(id).addEventListener("change", () => renderer?.[method]($(id).checked));
  function updateAppearance() {
    const gradient = appearance.mode === "gradient";
    $("solid-mode").setAttribute("aria-pressed", String(!gradient));
    $("gradient-mode").setAttribute("aria-pressed", String(gradient));
    $("gradient-controls").hidden = !gradient;
    $("color-end-control").hidden = !gradient;
    $("color-middle-control").hidden = !appearance.useMiddle;
    $("color-stops").classList.toggle("single", !gradient);
    $("color-start-label").textContent = gradient ? "From" : "Color";
    $("color-start").setAttribute(
      "aria-label",
      gradient ? "Start color" : "Surface color",
    );
    $("reverse-colors").hidden = !gradient;
    $("use-middle").checked = appearance.useMiddle;
    $("gradient-direction").value = appearance.direction;
    for (const stop of ["start", "middle", "end"]) {
      $(`color-${stop}`).value = appearance[stop];
      $(`color-${stop}-value`).value = appearance[stop].toUpperCase();
    }
    $("color-preview").style.background = SurfaceColors.preview(appearance);
    let selectedName = "Custom";
    document.querySelectorAll("[data-color]").forEach((button) => {
      const palette = SurfaceColors.fromPalette(button.dataset.color);
      const matches =
        palette.start === appearance.start &&
        (!gradient ||
          (palette.end === appearance.end &&
            palette.useMiddle === appearance.useMiddle &&
            (!palette.useMiddle || palette.middle === appearance.middle)));
      button.setAttribute("aria-pressed", String(matches));
      if (matches)
        selectedName = SurfaceColors.palettes[button.dataset.color].name;
    });
    $("palette-name").textContent = selectedName;
    renderer?.setAppearance(appearance);
  }
  for (const [id, palette] of Object.entries(SurfaceColors.palettes)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "swatch";
    button.dataset.color = id;
    button.title = palette.name;
    button.setAttribute("aria-label", `${palette.name} palette`);
    button.style.background = SurfaceColors.preview(
      SurfaceColors.fromPalette(id),
    );
    button.addEventListener("click", () => {
      appearance = {
        ...SurfaceColors.fromPalette(id),
        mode: appearance.mode,
        direction: appearance.direction,
      };
      updateAppearance();
    });
    $("color-palettes").append(button);
  }
  for (const mode of ["solid", "gradient"])
    $(mode + "-mode").addEventListener("click", () => {
      appearance.mode = mode;
      updateAppearance();
    });
  for (const stop of ["start", "middle", "end"])
    $(`color-${stop}`).addEventListener("input", (event) => {
      appearance[stop] = event.target.value;
      updateAppearance();
    });
  $("use-middle").addEventListener("change", (event) => {
    appearance.useMiddle = event.target.checked;
    updateAppearance();
  });
  $("gradient-direction").addEventListener("change", (event) => {
    appearance.direction = event.target.value;
    updateAppearance();
  });
  $("reverse-colors").addEventListener("click", () => {
    [appearance.start, appearance.end] = [appearance.end, appearance.start];
    updateAppearance();
  });
  updateAppearance();
  $("zoom-in").addEventListener("click", () => renderer?.zoom(1 / 1.2));
  $("zoom-out").addEventListener("click", () => renderer?.zoom(1.2));
  $("reset-view").addEventListener("click", () => renderer?.reset());
  $("auto-rotate").addEventListener("click", () =>
    renderer?.setRotation(
      $("auto-rotate").getAttribute("aria-pressed") !== "true",
    ),
  );
  function openDialog(id) {
    $(id).showModal();
  }
  $("presets-toggle").addEventListener("click", () =>
    openDialog("preset-dialog"),
  );
  $("all-presets").addEventListener("click", () => openDialog("preset-dialog"));
  $("help-toggle").addEventListener("click", () => openDialog("help-dialog"));
  document
    .querySelectorAll("[data-close]")
    .forEach((button) =>
      button.addEventListener("click", () => $(button.dataset.close).close()),
    );
  document.querySelectorAll("dialog").forEach((dialog) =>
    dialog.addEventListener("click", (event) => {
      const rect = dialog.getBoundingClientRect();
      if (
        event.target === dialog &&
        (event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom)
      )
        dialog.close();
    }),
  );
  function choosePreset(id) {
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    setMode(preset.kind || "implicit");
    if (preset.kind === "parametric-surface") {
      $("program-source").value = preset.program;
      $("parameter-sampling-mode").value = "cells";
      [0, 1].forEach((i) => {
        $("parameter-value-" + i).value = preset.counts[i];
        $("parameter-boundary-" + i).value = preset.boundaries?.[i] || "open";
      });
      updateProgramLines();
      updateProgramPreview();
    } else {
      $("expression").value = preset.expression;
      const domain =
        preset.domain ||
        Array.from({ length: 3 }, () => [-preset.span, preset.span]);
      axisInputs.forEach((pair, axis) => {
        pair[0].value = domain[axis][0];
        pair[1].value = domain[axis][1];
      });
    }
    $("preset-dialog").close();
    renderer?.reset();
    render();
  }
  for (const preset of presets) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preset-card";
    button.dataset.preset = preset.id;
    button.setAttribute("aria-label", `${preset.name} · ${preset.group}`);
    const title = document.createElement("strong"),
      subtitle = document.createElement("span"),
      equation = document.createElement("code");
    title.textContent = preset.name;
    subtitle.textContent = preset.type;
    equation.textContent = preset.expression;
    equation.title = preset.expression;
    button.append(title, subtitle, equation);
    if (preset.source) {
      const source = document.createElement("span");
      source.className = "preset-source";
      source.textContent = `Ray · ${preset.source.cells.join(", ")}`;
      button.append(source);
    }
    $("preset-list").append(button);
  }
  let selectedGroup = "All";
  const libraryCards = Array.from(
    $("preset-list").querySelectorAll("[data-preset]"),
  );
  const searchText = new Map(
    presets.map((preset) => [
      preset.id,
      normalize(
        `${preset.name} ${preset.type} ${preset.group} ${preset.keywords || ""} ${preset.expression} ${preset.source ? "Ray benchmark " + preset.source.cells.join(" ") : ""}`,
      ),
    ]),
  );
  const groupById = new Map(presets.map((preset) => [preset.id, preset.group]));
  function filterPresets() {
    const query = normalize($("preset-search").value);
    let count = 0;
    for (const card of libraryCards) {
      const visible =
        (selectedGroup === "All" ||
          selectedGroup === groupById.get(card.dataset.preset)) &&
        searchText.get(card.dataset.preset).includes(query);
      card.hidden = !visible;
      if (visible) count++;
    }
    $("preset-count").textContent =
      count === presets.length
        ? `${count} surfaces · ${new Set(presets.map((p) => p.group)).size} collections`
        : `${count} of ${presets.length} surfaces`;
    $("preset-empty").hidden = count > 0;
    $("preset-filters")
      .querySelectorAll("button")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.group === selectedGroup),
        ),
      );
  }
  for (const group of [
    "All",
    ...new Set(presets.map((preset) => preset.group)),
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = group;
    button.dataset.group = group;
    button.addEventListener("click", () => {
      selectedGroup = group;
      filterPresets();
    });
    $("preset-filters").append(button);
  }
  $("preset-search").addEventListener("input", filterPresets);
  filterPresets();
  document
    .querySelectorAll("[data-preset]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        choosePreset(button.dataset.preset),
      ),
    );
  window.addEventListener("pagehide", () => {
    generation++;
    worker?.terminate();
    if (workerURL) URL.revokeObjectURL(workerURL);
    workerURL = null;
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && busy) {
      render();
    }
  });
  $("surface-mode").addEventListener("change", (event) => {
    setMode(event.target.value);
    render();
  });
  $("edit-program").addEventListener("click", () => {
    $("config-body").hidden = false;
    $("config-toggle").setAttribute("aria-expanded", "true");
    $("program-source").focus();
  });
  $("expand-program").addEventListener("click", () => {
    const expanded = document.body.classList.toggle("editor-expanded");
    $("expand-program").setAttribute("aria-expanded", String(expanded));
    $("expand-program").textContent = expanded ? "Compact" : "Expand";
  });
  let previewTimer;
  $("program-source").addEventListener("input", () => {
    reportProgramError(null);
    $("program-state").textContent = "Unapplied changes";
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updateProgramPreview, 180);
  });
  $("program-source").addEventListener(
    "scroll",
    () => ($("program-lines").scrollTop = $("program-source").scrollTop),
  );
  new ResizeObserver(
    () =>
      ($("program-lines").style.height =
        $("program-source").clientHeight + "px"),
  ).observe($("program-source"));
  $("program-source").addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      render();
    }
  });
  function locate(offset, length = 1) {
    const input = $("program-source");
    input.focus();
    input.setSelectionRange(offset, offset + length);
    input.scrollTop = Math.max(
      0,
      (input.value.slice(0, offset).split("\n").length - 3) * 20,
    );
  }
  $("locate-program-error").addEventListener("click", () => {
    if (programError) locate(programError.offset || 0);
  });
  $("parameter-domain").addEventListener("click", () => {
    const offset = $("program-source").value.search(/^\s*parameter\s/m);
    locate(Math.max(0, offset), 9);
  });
  [0, 1].forEach((i) => {
    $("parameter-value-" + i).addEventListener("input", updateProgramPreview);
    $("parameter-boundary-" + i).addEventListener(
      "change",
      updateProgramPreview,
    );
  });
  $("parameter-sampling-mode").addEventListener("change", () => {
    try {
      const program = programs.compile($("program-source").value),
        toStep = $("parameter-sampling-mode").value === "step";
      [0, 1].forEach((i) => {
        const old = Number($("parameter-value-" + i).value),
          span = program.domain[i][1] - program.domain[i][0];
        if (old > 0)
          $("parameter-value-" + i).value = toStep
            ? span / old
            : Math.ceil(span / old);
      });
    } catch {
      /* Keep values editable while the source is incomplete. */
    }
    updateProgramPreview();
  });
  $("cancel-render").addEventListener("click", () => {
    generation++;
    worker?.terminate();
    worker = null;
    setBusy(false);
    $("mesh-status").textContent = lastStatus + " · build cancelled";
  });
  $("import-latex").addEventListener("click", () => openDialog("latex-dialog"));
  function invalidateImport() {
    $("apply-latex").disabled = true;
    $("latex-preview").value = "";
    setError("latex-error", "");
  }
  $("latex-source").addEventListener("input", invalidateImport);
  $("latex-example").addEventListener("click", () => {
    $("latex-source").value = SurfaceParametricPresets.flowerLatex;
    invalidateImport();
  });
  $("convert-latex").addEventListener("click", () => {
    invalidateImport();
    try {
      $("latex-preview").value = latex.convert($("latex-source").value).source;
      $("apply-latex").disabled = false;
    } catch (error) {
      setError("latex-error", error.message);
    }
  });
  $("apply-latex").addEventListener("click", () => {
    if ($("apply-latex").disabled) return;
    $("program-source").value = $("latex-preview").value;
    reportProgramError(null);
    updateProgramPreview();
    $("latex-dialog").close();
    $("program-source").focus();
  });
  updateProgramLines();
  updateProgramPreview();
  updatePresetState(activeExpression);
  render();
})();
