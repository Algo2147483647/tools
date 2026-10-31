/* Regular parameter-grid meshing with bounded memory and cancellable stages. */
(function (root) {
  "use strict";
  function createMesher(programs) {
    const cross = (a, b) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    const subtract = (a, b) => a.map((v, i) => v - b[i]);
    const unit = (vector) => {
      const length = Math.hypot(...vector);
      return length > 0 && Number.isFinite(length)
        ? vector.map((v) => v / length)
        : [0, 0, 0];
    };
    async function build(
      { source, sampling: options, boundaries = ["open", "open"] },
      progress = () => {},
      cancelled = () => false,
    ) {
      if (cancelled()) return null;
      progress("Compiling program…");
      const program = programs.compile(source),
        sampling = program.sampling(options);
      if (
        boundaries.length !== 2 ||
        boundaries.some((value) => !["open", "periodic"].includes(value))
      )
        throw new Error("Choose Open or Periodic for each parameter boundary.");
      const [nu, nv] = sampling.counts,
        width = nu + 1;
      const positions = new Float64Array(sampling.points * 3),
        valid = new Uint8Array(sampling.points);
      const normals = new Float64Array(positions.length);
      const sample = program.createSampler(sampling),
        point = [0, 0, 0];
      const minimum = [Infinity, Infinity, Infinity],
        maximum = [-Infinity, -Infinity, -Infinity];
      let invalid = 0,
        lastYield = Date.now();
      const pause = () => new Promise((resolve) => setTimeout(resolve, 0));
      async function checkpoint(label) {
        if (Date.now() - lastYield > 20) {
          progress(label);
          await pause();
          lastYield = Date.now();
        }
        return cancelled();
      }
      for (let j = 0; j <= nv; j++) {
        if (
          await checkpoint(
            `Sampling parameters · ${Math.round((j / nv) * 100)}%`,
          )
        )
          return null;
        for (let i = 0; i <= nu; i++) {
          if (i % 256 === 0 && (await checkpoint("Sampling parameters…")))
            return null;
          const id = i + width * j;
          sample(i, j, point);
          if (!point.every(Number.isFinite)) {
            invalid++;
            continue;
          }
          valid[id] = 1;
          point.forEach((value, axis) => {
            positions[id * 3 + axis] = value;
            minimum[axis] = Math.min(minimum[axis], value);
            maximum[axis] = Math.max(maximum[axis], value);
          });
        }
      }
      if (invalid === sampling.points)
        throw new Error(
          "The mapping is undefined throughout this parameter domain. The previous surface is unchanged.",
        );
      const spans = maximum.map((v, i) => v - minimum[i]);
      const initialScale = Math.max(...spans) / 2;
      if (!(initialScale > 0) || !Number.isFinite(initialScale))
        throw new Error(
          "The mapping collapses to a point or exceeds the numerical range.",
        );
      const initialCenter = minimum.map((v, i) => v + spans[i] / 2);
      for (let id = 0; id < valid.length; id++)
        if (valid[id]) {
          for (let axis = 0; axis < 3; axis++)
            positions[id * 3 + axis] =
              (positions[id * 3 + axis] - initialCenter[axis]) / initialScale;
        }
      const get = (id) => Array.from(positions.subarray(id * 3, id * 3 + 3));
      const normal = (id) => Array.from(normals.subarray(id * 3, id * 3 + 3));
      // Only explicitly requested, same-order seams may be joined.
      for (let axis = 0; axis < 2; axis++)
        if (boundaries[axis] === "periodic") {
          const count = axis === 0 ? nv : nu;
          for (let k = 0; k <= count; k++) {
            const a = axis === 0 ? k * width : k,
              b = axis === 0 ? a + nu : k + nv * width;
            if (
              !valid[a] ||
              !valid[b] ||
              Math.hypot(...subtract(get(a), get(b))) > 1e-6
            )
              throw new Error(
                `${program.parameters[axis]} endpoints do not match. Use an Open boundary; this mapping is not periodic in that direction.`,
              );
            // Snap only corresponding boundary samples, never arbitrary coincident points.
            for (let c = 0; c < 3; c++)
              positions[b * 3 + c] = positions[a * 3 + c];
          }
        }
      function tangent(i, j, axis) {
        const id = i + j * width,
          index = axis === 0 ? i : j,
          count = axis === 0 ? nu : nv,
          stride = axis === 0 ? 1 : width;
        let before = index > 0 ? id - stride : -1,
          after = index < count ? id + stride : -1;
        if (boundaries[axis] === "periodic" && count > 1) {
          if (index === 0) before = id + (count - 1) * stride;
          if (index === count) after = id - (count - 1) * stride;
        }
        if (before >= 0 && after >= 0 && valid[before] && valid[after])
          return subtract(get(after), get(before));
        if (after >= 0 && valid[after]) return subtract(get(after), get(id));
        if (before >= 0 && valid[before]) return subtract(get(id), get(before));
        return [0, 0, 0];
      }
      for (let j = 0; j <= nv; j++) {
        if (await checkpoint("Building normals…")) return null;
        for (let i = 0; i <= nu; i++) {
          if (i % 256 === 0 && (await checkpoint("Building normals…")))
            return null;
          const id = i + j * width;
          if (valid[id])
            normals.set(
              unit(cross(tangent(i, j, 0), tangent(i, j, 1))),
              id * 3,
            );
        }
      }
      const output = new Float32Array(sampling.cells * 2 * 18);
      let length = 0,
        degenerate = 0,
        omittedCells = 0,
        suspectCells = 0;
      const usedMin = [Infinity, Infinity, Infinity],
        usedMax = [-Infinity, -Infinity, -Infinity];
      function triangle(a, b, c) {
        const points = [get(a), get(b), get(c)],
          face = cross(
            subtract(points[1], points[0]),
            subtract(points[2], points[0]),
          );
        if (Math.hypot(...face) < 1e-14) {
          degenerate++;
          return;
        }
        const faceNormal = unit(face);
        [a, b, c].forEach((id, index) => {
          let n = normal(id);
          if (
            n.reduce((sum, value, axis) => sum + value * faceNormal[axis], 0) <
            0.35
          )
            n = faceNormal;
          output.set(points[index], length);
          output.set(n, length + 3);
          length += 6;
          points[index].forEach((value, axis) => {
            usedMin[axis] = Math.min(usedMin[axis], value);
            usedMax[axis] = Math.max(usedMax[axis], value);
          });
        });
      }
      for (let j = 0; j < nv; j++) {
        if (await checkpoint(`Building mesh · ${Math.round((j / nv) * 100)}%`))
          return null;
        for (let i = 0; i < nu; i++) {
          if (i % 128 === 0 && (await checkpoint("Checking cells…")))
            return null;
          const a = i + j * width,
            b = a + 1,
            c = a + width + 1,
            d = a + width;
          if (![a, b, c, d].every((id) => valid[id])) {
            omittedCells++;
            continue;
          }
          const middle = program.evaluate(
            program.domain[0][0] + (i + 0.5) * sampling.steps[0],
            program.domain[1][0] + (j + 0.5) * sampling.steps[1],
            point,
          );
          if (!middle.every(Number.isFinite)) {
            omittedCells++;
            continue;
          }
          const midpoint = middle.map(
            (v, axis) => (v - initialCenter[axis]) / initialScale,
          );
          const corners = [get(a), get(b), get(c), get(d)];
          const average = [0, 1, 2].map(
            (axis) => corners.reduce((sum, p) => sum + p[axis], 0) / 4,
          );
          const edge = Math.max(
            ...corners.map((p, k) =>
              Math.hypot(...subtract(p, corners[(k + 1) % 4])),
            ),
          );
          if (
            Math.hypot(...subtract(midpoint, average)) >
            4 * Math.max(edge, 1e-12)
          )
            suspectCells++;
          triangle(a, b, c);
          triangle(a, c, d);
        }
      }
      if (!length)
        throw new Error(
          "This mapping does not produce a two-dimensional surface at the current sampling settings. The previous surface is unchanged.",
        );
      if (cancelled()) return null;
      progress("Preparing view…");
      const geometryBounds = usedMin.map((v, axis) => [
        initialCenter[axis] + v * initialScale,
        initialCenter[axis] + usedMax[axis] * initialScale,
      ]);
      const largestSpan = Math.max(...geometryBounds.map(([a, b]) => b - a));
      const viewBounds = geometryBounds.map(([a, b]) => {
        const padding = Math.max((b - a) * 0.06, largestSpan * 0.03);
        return [a - padding, b + padding];
      });
      if (!viewBounds.flat().every(Number.isFinite))
        throw new Error(
          "The surface exceeds the displayable coordinate range.",
        );
      if (viewBounds.some(([a, b]) => !(b > a) || !Number.isFinite(b - a)))
        throw new Error(
          "Coordinate magnitudes are too large or too small relative to the surface size. Translate or rescale the mapping.",
        );
      const center = viewBounds.map(([a, b]) => a + (b - a) / 2),
        scale = Math.max(...viewBounds.map(([a, b]) => (b - a) / 2));
      for (let i = 0; i < length; i += 6) {
        if (i % 60000 === 0 && (await checkpoint("Preparing view…")))
          return null;
        for (let axis = 0; axis < 3; axis++)
          output[i + axis] =
            (initialCenter[axis] -
              center[axis] +
              output[i + axis] * initialScale) /
            scale;
      }
      const data = output.subarray(0, length);
      return {
        data,
        triangles: length / 18,
        reason: "surface",
        invalid,
        sampling,
        domain: viewBounds,
        geometryBounds,
        viewBounds,
        transform: { center, scale },
        diagnostics: {
          invalidSamples: invalid,
          degenerateTriangles: degenerate,
          omittedCells,
          suspectCells,
        },
      };
    }
    return { build };
  }
  root.SurfaceParametricMesher = { createMesher };
  if (typeof module !== "undefined" && module.exports)
    module.exports = root.SurfaceParametricMesher;
})(typeof globalThis !== "undefined" ? globalThis : this);
