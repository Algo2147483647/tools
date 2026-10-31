# Surface · Geometry Lab

A minimalist, full-screen 3D implicit and parametric surface visualizer. Open **index.html**
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

The **Implicit / Parametric** selector changes the input model. Each mode keeps
its own draft during the current page session. A failed or cancelled build keeps
the previous successful surface. Drafts are not saved across page reloads.

### Parametric programs

Choose **Parametric**, edit the multiline program, and select **Render surface**
or press **Ctrl/Cmd + Enter**. The default is a layered flower with a detailed
petal edge. The library also includes a plane, sphere, torus, helicoid, and
catenoid. **Expand** gives the editor more room; **Edit program** reopens it.

```text
parameter r = [0, 1]
parameter theta = [4*pi, 24*pi]

# Petal edge and fine detail
edge(theta) = 1 - 0.5*(1 - mod(3.6*theta, 2*pi)/pi)^4 + disturb(theta)
disturb(theta) = sin(15*theta)/150

f_2(r) = 2*(r^2 - r)^2
alpha(theta) = pi/2 * exp(-theta/(8*pi))
h(r, theta) = f_2(r)*sin(alpha(theta))

R = r*sin(alpha(theta)) + h(r, theta)*cos(alpha(theta))
H = r*cos(alpha(theta)) - h(r, theta)*sin(alpha(theta))

X = edge(theta)*R*cos(theta)
Y = edge(theta)*R*sin(theta)
Z = edge(theta)*H
```

Program rules:

- Declare exactly two parameters with finite, increasing bounds. Parameter names
  are arbitrary ASCII identifiers, including underscores and numeric suffixes.
- Define all three scalar outputs **X**, **Y**, and **Z**. Names are case-sensitive:
  `r` and `R` are different. Built-in names and language keywords are reserved.
- Use `const amplitude = 0.1` for a constant. Constants may reference other
  constants and call pure helper functions with constant arguments.
- Helpers such as `profile(t) = t^2` may read their arguments, constants, and
  other helper functions. Pass sampling parameters explicitly; helpers cannot
  capture global parameters or intermediate scalar values.
- Global scalar definitions may use parameters, constants, helpers, and other
  scalar definitions. Forward references work. Duplicate definitions, cycles,
  recursion, missing names, and wrong argument counts produce located errors.
- Newlines or semicolons separate definitions. Parenthesized expressions can
  span lines. `#` starts a comment.
- Implicit products such as `2r`, `2sin(theta)`, and `(r+1)(r-1)` work. A
  multi-letter identifier is one name: write `u*v`, not `uv`. Use `r*(r+1)`
  when multiplying a named value by a parenthesized expression; `r(...)` is
  parsed as a function call.
- `floor`, `ceil`, and `mod` complement the existing functions.
  `mod(a,b) = a - b*floor(a/b)`; a zero divisor is undefined. Angles use radians.
  Unicode `π`, minus, multiplication/division signs, and superscript ²/³ work.

**Parameter sampling** accepts independent cell counts or step sizes in parameter
units. The range summary comes directly from the source and links back to its
declarations. Step mode uses `ceil(span / requestedStep)` cells and displays the
actual step. Changing precision mode converts the current values.

The flower preset uses 64 radial cells and 2,048 angular cells. Its maximum
262,144 triangles become 260,096 after degenerate triangles at the origin are
removed. The angular range contains 150 periods of its fine sinusoidal detail;
compare different densities when inspecting small features.

Both boundaries default to **Open**. **Periodic** validates corresponding
endpoint samples before snapping the seam and using wrapped normal differences.
It supports same-order seams, not reversed or twisted identifications. The
flower's angular endpoints remain open because its inclination changes with
theta. Spatially coincident vertices from unrelated parameter locations are
never globally welded, so self-intersections retain their separate sheets.

The world-space bounds are derived from generated triangles; parameter ranges
are not spatial clipping bounds. Flat surfaces are valid, with display padding
on a zero-thickness axis. Gradients continue to use the displayed spatial bounds.
Mappings that collapse to a line or point report an error and keep the old view.

Limits are checked before allocating mesh buffers: 1–16,384 cells per parameter,
420,000 potential triangles, an estimated 192 MiB build budget, and 100 million
estimated evaluation operations. The estimate is a guardrail, not a measurement
of total browser process memory. Programs allow 65,536 characters, 256
definitions, eight arguments per helper, and 8,192 expanded operations. Nesting
and expression-tree depth are bounded. The UI does not silently reduce precision.

Undefined vertices or cell centers omit the affected cells. Zero-area triangles
are removed. Normals use parameter differences with local face-normal fallback
at singular points and sharp changes. Large deviations at cell centers are
reported as possible unresolved detail; those finite cells are retained. Finite
sampling cannot prove continuity or find every pole. This is regular-grid
meshing, not curvature-adaptive tessellation. Diagnostic counts are available
in the status tooltip and the expandable **Sampling diagnostics** section.

### Importing LaTeX

Select **Import LaTeX**, paste equations, select **Convert**, review the result,
then select **Apply to editor**. Applying replaces only the program draft;
rendering is a separate action. Editing the LaTeX invalidates the conversion
preview. A failed conversion preserves the program draft.

The importer supports `align`, `align*`, `aligned`, and equation environments;
fractions, powers, common function commands, Greek parameter/function names,
simple subscripts, parameter-range tuples, and `matrix`/`pmatrix`/`bmatrix`
products up to 4 × 4. Column-vector assignments expand into scalar definitions.
Both the supplied flower matrix formula and its equivalent scalar program are
covered by numerical regression tests. **Load flower example** provides the full
English-annotated LaTeX input.

`\tag` and `\label` text is retained as comments, including annotations supplied
in another language. Formatting commands such as `\left`, `\right`, and spacing
are recognized. Unsupported commands, malformed groups, mismatched matrix
dimensions, and invalid converted programs produce source-location errors.
Identifiers retain case. This is a documented LaTeX subset, not a TeX engine or
a symbolic algebra system. The converted program is the editable source of
truth; reverse conversion to the original typesetting is not provided.

### Implicit equations

Use `left = right`, or just an expression (implicitly equal to zero). Explicit
graphs such as `z = sin(x)cos(y)` work too. The parser accepts:

- Variables `x`, `y`, `z`; constants `pi` / `π`, `e`, `tau`.
- Operators `+ - * / ^`, `**`, unary signs, parentheses, scientific notation.
- Implicit multiplication: `2x`, `xy`, `2sin(x)`, `(x+1)(x-1)`.
- One-argument functions: `sin cos tan asin acos atan sinh cosh tanh sqrt cbrt
abs exp log ln log10 log2`.
- Two-argument functions: `atan2(y,x)`, `pow(base,exponent)`, `min(a,b)`, `max(a,b)`, `mod(a,b)`.
- Rounding functions: `floor(x)`, `ceil(x)`.
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
- `parametric-program.js`: located definitions, scope and dependency checks,
  shared expression nodes, constant folding, and parameter-specific caches.
- `parametric-mesh.js`: parameter sampling, boundary checks, normals, diagnostics,
  and normalized triangle geometry.
- `latex-import.js`: structural LaTeX subset parser, source mappings, and matrix expansion.
- `parametric-presets.js`: six parametric examples and the flower LaTeX fixture.
- `mesh.js`: cancellable mesh generation and root refinement.
- `renderer.js`: WebGL shading, coordinate guides, orbit/pan/zoom and touch controls.
- `colors.js`: palettes, custom colors, and gradient material settings.
- `presets.js`: the shared library of example equations and domains.
- `benchmark-presets.js`: standalone equations adapted from Ray's benchmark, with source-cell metadata.
- `app.js`: worker lifecycle, validation, and accessible UI state.
- `tests.cjs`, `parametric-tests.cjs`: parser, geometry, import, cancellation, and
  real Worker-thread regression checks; no dependencies required.

From the repository root:

```sh
node tools/implicit-surface/tests.cjs
node tools/implicit-surface/parametric-tests.cjs
```

Optional DOM integration tests use an external `jsdom` 22 installation:

```sh
node tools/implicit-surface/ui-tests.cjs /absolute/path/to/node_modules/jsdom
```

These tests execute the actual app and actual mesh workers, checking mode changes,
draft preservation, error locations, sampling conversions, import/apply behavior,
cancellation, superseded requests, and Worker fallback. WebGL is stubbed, so they
do not verify visual layout or GPU rendering. The application itself has no npm
dependency. For manual browser QA, open `index.html`, render the flower, import
its LaTeX example, inspect the sphere poles and torus seams, resize the viewport,
and check that errors leave the last successful surface visible.
