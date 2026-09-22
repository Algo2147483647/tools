# Surface · Implicit Geometry Lab

A minimalist, full-screen 3D implicit surface visualizer. Open **index.html**
directly in a modern browser with WebGL enabled. It runs offline, with no build,
package installation, server, CDN, or network connection.

The pale canvas, floating glass toolbar, blue accents, compact controls, and
collapsible panel follow the adjacent `complex-transform` tool. A single 3D
viewport fills the entire window; controls float above it.

## Explore

- Enter an implicit equation and press **Enter** or the blue arrow to render.
- Set independent minimum and maximum values for **x**, **y**, and **z**, then
  choose **Apply domain**. The shape is clipped at the domain boundary.
- In **Sampling**, select **Draft**, **Balanced**, or **Fine** (32, 52, or 76 cells
  per axis), **Custom cells** (any integer from 8 to 128), or **Step size** (a
  positive distance in domain units). Press **Apply sampling** or Enter to render.
  The panel previews the grid dimensions and actual Δx/Δy/Δz as inputs change.
  In step mode each axis uses `ceil(span / step)` cells, with at least one cell;
  its actual step is `span / cells`, so the entire domain is covered and the
  requested step is never exceeded. Changing the domain updates these counts.
  Step mode allows up to 256 cells per axis and 2,097,152 cells total. Requests
  beyond those limits show an error and preserve the previous plot.
- Use **Surface color** to choose **Solid** or **Gradient**. Click a color chip
  to open the native color picker. Gradients support two endpoints, an optional
  middle color at 50%, X/Y/Z directions, distance from the domain center, and
  reversal. Six palettes provide starting points, including Sunset and Aurora.
  Changes update immediately without rebuilding the mesh; lighting still shades
  solid colors. Gradient coordinates span the configured domain, with radial
  distance normalized from its center (0) to its corners (1).
- Show the triangle mesh, or toggle coordinate guides/domain box.
- Open **Surfaces** for 60 examples across quadrics, sculpted forms, waves,
  periodic surfaces, combinations, polyhedra, and classical surfaces. Filter by collection or search names,
  equations, and Chinese keywords. Examples include a wavy torus, monkey saddle,
  Gaussian hill, gyroid shell, and sphere union/intersection/difference.
  Presets also set a useful domain, including independent axis ranges for landscapes.
  The periodic examples use trigonometric level sets; they are not exact minimal-surface solutions.
- The 24 additions from Ray's geometry benchmark carry source-cell labels.
  Search `Ray` to show them, or search a cell such as `r3-c4`. These include
  regular polyhedra, a stellated dodecahedron, a catenoid, algebraic surfaces,
  and two spherical-harmonic surfaces. See [benchmark-presets.md](benchmark-presets.md)
  for the source mapping, normalization, and deliberately excluded scene objects.
- Drag to orbit; Shift-drag, right-drag, or middle-drag to pan; scroll to zoom.
  On touchscreens, drag with one finger or pan/pinch with two fingers.
- Focus the canvas and use arrow keys to orbit, Shift + arrows to pan,
  `+` / `-` to zoom, and `0` to reset. Double-click or use the Fit button to
  restore the initial view of the domain. Rotation is explicitly enabled using
  the rotate button and pauses when the tab is hidden.
- The configuration panel starts collapsed on small screens. Help and library
  dialogs support keyboard navigation, Escape, and focus restoration.

The domain, detail, and equation are applied together when a render is requested.
Invalid inputs preserve the previous valid surface. Superseded rendering jobs
are cancelled, so the latest valid request wins.

## Equations

Use `left = right`, or just an expression (implicitly equal to zero). Explicit
graphs such as `z = sin(x)cos(y)` work too. The parser accepts:

- Variables `x`, `y`, `z`; constants `pi` / `π`, `e`, `tau`.
- Operators `+ - * / ^`, `**`, unary signs, parentheses, scientific notation.
- Implicit multiplication: `2x`, `xy`, `2sin(x)`, `(x+1)(x-1)`.
- One-argument functions: `sin cos tan asin acos atan sinh cosh tanh sqrt cbrt
abs exp log ln log10 log2`.
- Two-argument functions: `atan2(y,x)`, `pow(base,exponent)`, `min(a,b)`, `max(a,b)`.
- Unicode minus, multiplication/division signs, and superscript ² / ³.

Names are case-insensitive. Functions require parentheses. Angles use radians;
`log` and `ln` are natural logarithms. Powers associate right and bind more tightly
than unary minus: `-x^2` means `-(x^2)`. Multiplication and division have equal
precedence, evaluated left to right; write denominators with parentheses.
Calculations are real-valued (`cbrt(x)` works for negative x; `x^(1/3)` follows
JavaScript's real-power behavior and is undefined for negative x).

Expressions are parsed with a restricted grammar, never evaluated as JavaScript.
Limits: 8192 input characters, 4096 tokens, 48 nesting levels. The larger text
budget accommodates the benchmark's polynomial and polyhedral equations. Domain bounds must
be finite, ordered, and representable at the requested resolution. Extremely
disparate axis spans are rejected to avoid misleading graphics precision.

## Numerical limits

Marching tetrahedra approximates the zero level set on a finite grid. Edge roots
are refined, and crossings with a large residual are rejected to reduce false
surfaces at poles. Undefined/non-real samples are omitted. Equation coefficients
are normalized locally during root refinement, and geometry is centered and
uniformly scaled before uploading to WebGL, preserving axis proportions.

Finite sampling can miss tiny or rapidly oscillating features, isolated points,
and zeros without a sign change, such as `x^2 = 0`. Use the equivalent `x = 0`
for that plane, or simplify squared factors before plotting. Roots on the boundary
of a function's real domain (for example `sqrt(x) = 0`) can also be missed.
This is a numerical explorer for real surfaces, not a symbolic solver or a claim
to render every equation exactly. Increase detail or narrow the domain to inspect
features. Empty, undefined, and identically zero sampled fields have explanatory
messages. A 420,000-triangle limit bounds rendering memory for complex inputs.

Meshing normally runs in a Blob worker, including when opened as a local file.
If workers are blocked, computation runs in cancellable chunks on the main
thread. Rendering runs on demand; continuous frames are used only during rotation.

## Files and verification

- `index.html`, `styles.css`, `icon.svg`: self-contained interface and visual design.
- `math.js`: restricted expression parser and numerical domain validation.
- `mesh.js`: cancellable mesh generation and root refinement.
- `renderer.js`: WebGL shading, coordinate guides, orbit/pan/zoom and touch controls.
- `colors.js`: palettes, custom colors, and gradient material settings.
- `presets.js`: the shared library of example equations and domains.
- `benchmark-presets.js`: standalone equations adapted from Ray's benchmark, with source-cell metadata.
- `app.js`: worker lifecycle, validation, and accessible UI state.
- `tests.cjs`: parser and geometric regression checks; no dependencies required.

From the repository root:

```sh
node tools/implicit-surface/tests.cjs
```
