# Complex — Transformation Lab

A full-screen, offline HTML tool for exploring complex transformations. Open
[`index.html`](./index.html) directly in a modern browser. No build, server,
installation, or network connection is required.

## Professional analysis

The Output sidebar combines **View** and **Analysis** tabs. The original
offline plotting mode still works by opening `index.html`; analysis requires
the local server. No expression or calculation is sent to an external service.

On Windows, run from this directory:

```powershell
.\start.ps1
```

Then open **http://127.0.0.1:8873**. The script creates a project-local `.venv`
and installs the pinned dependencies on first use (Python 3.9+ and an internet
connection are required for that installation only). If PowerShell execution
policy prevents running a script, these equivalent commands work without
changing policy:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe server.py
```

Use `start.ps1 -Port 8874` / `server.py --port 8874` to select another port.
The server binds only to loopback and refuses an occupied port. Press Ctrl+C
in its terminal to stop it. After installation it works without internet access.

### Seven P0 capabilities

1. **Derivatives / local mapping** — symbolic first and second derivatives, point values,
   scaling, rotation, critical-point indication, and actual vs. linearized
   small-circle images (green solid vs. purple dashed).
2. **Analyticity** — real partial derivatives, Cauchy–Riemann residuals, and
   Wirtinger derivatives. A zero residual at one point is not a proof of
   analyticity in a neighbourhood. Cuts and original undefined points suppress
   derivative claims. Supported holomorphic syntax establishes regular-domain
   analyticity; nonholomorphic expressions retain their symbolic diagnostics.
3. **Zeros / singularities** — complete polynomial-root enumeration for rational
   functions up to degree 24, including multiplicities, poles, removable holes,
   and critical points. General holomorphic expressions use bounded 7×7 seeded
   searches for **unverified zero candidates**, plus supported symbolic
   singularity classifications. Essential singularities of a single exp/sin/
   cos/sinh/cosh applied to a rational pole and affine log/root branch points
   are recognized. Unresolved types remain explicitly unknown. No general
   symbolic or numerical completeness claim is made.
4. **Path integration** — oriented circles/arcs, lines/polylines, closed polygons,
   and parameter curves; e.g. `exp(2*pi*i*t)`, `0 ≤ t ≤ 1`. Draws both the path
   and its image, reports cumulative integrals and estimated error. Uses
   mpmath tanh-sinh quadrature at 25/40 decimal digits with 4/8 subdivisions.
   Closed rational-function contours are compared with the residue theorem
   using sampled winding numbers. Known rational poles on straight/circular
   paths are rejected, including poles between sample points. Branch crossing
   checks and general singularity checks use finite sampling and may miss
   unresolved features. No Cauchy principal-value integration is implied.
5. **Residues** — symbolic residues, pole order where determined, and independent
   small-circle integral estimates. Supports high-order poles and supported
   essential singularities such as `exp(1/z)`. Expressions with branch
   operations or nonholomorphic operations are conservatively rejected.
   The verification circle must exclude other singularities for its integral
   to estimate only the selected point's residue.
6. **Taylor / Laurent** — symbolic coefficients and principal parts, orders
   −N through N (N ≤ 16), selected-annulus rational expansions, convergence
   boundaries where established, and 32-point sampled truncation errors.
   For `1/((z-1)*(z-2))` centred at zero, choose radii `0.5`, `1.5`, `3`
   to obtain the three different expansions. Rational annulus expansion
   requires exact pole locations. Entire functions and functions made entire
   by `z = a + 1/h` have certified convergence regions; other local series
   explicitly report an unverified radius. Fractional-power Puiseux series
   and logarithmic expansions are not presented as ordinary Laurent series.
7. **Branches / cuts** — global branch index k and cut angle θ for log/ln, sqrt,
   and noninteger powers, consistently applied to the browser and backend.
   Arg is in `(θ − 360°, θ] + 360° k`. Affine-argument cuts are drawn as
   orange dashed rays; one-sided samples show jumps. General composite cuts
   are reported as preimages rather than guessed as straight lines. Inverse
   trigonometric functions keep their standard principal branches.

The English interface uses compact labels, controls, formulas, and status messages.
The analysis point is editable in the Output sidebar or through the original
Probe controls. Changes invalidate old results; analysis is explicit, never
triggered continuously while dragging. Large desktop windows reserve space for
the workbench, keeping both planes visible. Small screens use the same collapsible Output sidebar.

### Limits and validation

SymPy receives only a validated AST from the existing closed parser. Decimal
literals and named constants retain exact symbolic meanings. User expressions
are never passed to Python `eval`, `sympify`, or `parse_expr`. Each request runs
in a separate process, with a 25-second timeout and at most two concurrent
requests. AST, body, polynomial degree, series order, and parameter bounds are
validated. Out-of-scope cases return an explicit message instead of a result.

Numerical values, candidate roots, quadrature errors, sampled winding numbers,
and truncation errors are estimates, not proofs or certified error bounds.
Only established symbolic properties are labelled as such. Displayed long
decimal values do not guarantee that every digit of a numerical integral is
correct; use the reported error and convergence status.

```powershell
node tests.cjs
.\.venv\Scripts\python.exe -m unittest test_analysis -v
```

Backend tests include cross-engine values, derivatives and C-R edge cases,
root multiplicities, removable and essential singularities, oriented contours,
off-sample path poles, nonholomorphic path integrals, residues, selected annuli,
branch conventions, and rejected AST input.

## Explore

- The canvases share the plotting area equally. On large screens the expanded
  Output sidebar reserves space; compact layouts use floating controls.
- Enter an expression in the top **f(z)** field and press **Enter** or the arrow button.
- Open **Functions** for 32 searchable presets across linear maps, powers, roots,
  exponential/logarithmic, trigonometric/hyperbolic, rational, and projection maps.
- Use the left panel for domain, grid, unit-circle, coordinate guides, and probe
  settings. Use the right panel for mapped values, animation, zoom, fitting, and
  quick presets. Each panel folds by clicking its header. Narrow screens start
  with both panels folded and allow one expanded panel at a time.
- Compare the original and transformed Cartesian or polar grids. Matching colors
  identify corresponding curves; the dashed amber curve is the unit circle.
- In **Probe** mode, click or drag on the input plane to move a point, or enter
  its real and imaginary coordinates. Points are not clamped to a fixed region.
  The inspector reports the full `f(z)` and both magnitudes.
- Enter any positive finite **Domain half-span**, including scientific notation,
  and press Enter, click the arrow, or leave the field to apply it. There is no
  fixed minimum or maximum range. Invalid or unrepresentable values preserve the
  previous view and show an inline error.
- Choose **Pan**, Shift-drag, or middle-drag to move the input view. Scroll to zoom
  around the pointer. The displayed center follows the input view.
- Choose **Infinite** or **Finite** under **Grid extent** in the left panel.
  Infinite is the default. Finite uses a fixed square `[-R, R]²` for Cartesian
  grids or a disk of radius `R` for polar grids, centered at zero. Here `R` is the
  entered domain half-span. Panning and zooming only change the camera in Finite
  mode; editing the domain recenters the view and updates the mapped region.
  The unit-circle overlay is shown when it fits within the finite domain.
- In Infinite mode, grids continue across the entire visible input region and
  regenerate as you pan, zoom, or resize. Density adapts to the scale so distant
  views do not create unbounded amounts of work. The output maps this sampled
  input region; it does not claim to render all preimages of an arbitrary function
  on the whole infinite plane.
- Drag the output to pan; scroll to zoom around the pointer. **Fit** (or
  double-click the output) fits sampled finite values. Extreme tails near poles
  are excluded when they would dwarf the rest of the image.
- Scrub the transformation slider or press play to show `(1-t)z + t f(z)`.
  Animation is started explicitly and pauses when the page is hidden.
- **Reset view** restores the domain to ±2, the complete transformation, and the
  fitted output. The expression, selected grid, extent mode, and probe remain available.

Keyboard: focus the input canvas and use the arrow keys to move the point or pan,
depending on the selected tool (Shift for larger steps). Both canvases accept
`+` / `-` to zoom; `0` resets the input view or fits the output. Output arrows pan.
All settings and the numerical point inputs are also keyboard accessible.

## Expressions

Supported operators: `+ - * / ^` (`**` also works), unary signs, and parentheses.
Implicit multiplication supports `2z`, `iz`, `2sin(z)`, and `(z+1)(z-1)`.
Multiplication and division have equal precedence, evaluated left to right;
use parentheses to make a denominator explicit. Powers associate right and bind
more tightly than unary signs: `-z^2` is `-(z^2)`.

Constants: `i`, `pi` / `π`, `e`, `tau`. The variable is `z`; names are case-insensitive.
Scientific notation such as `1.2e-3` is supported.

Functions (with parentheses):

`exp log ln sqrt sin cos tan sinh cosh tanh asin acos atan abs arg re im conj`

Two-argument functions: `pow(z, exponent)` and `complex(real, imaginary)`.
`complex` requires real-valued arguments. Trigonometric functions use radians;
`log` and `ln` are the natural logarithm. `abs`, `arg`, `re`, and `im` return real values.

Examples: `z^3 - 2z`, `exp(i*pi*z)`, `z + 0.5/z`, `(z-i)/(z+i)`, `sin(conj(z))`.

Expressions are parsed by a restricted mathematical grammar, never executed as
JavaScript. Invalid expressions display an error and preserve the last valid plot.
Expressions are limited to 512 characters, 256 tokens, and 48 levels of nesting.

## Numerical conventions

By default logarithms and noninteger powers use the principal argument (`atan2`); roots use
the principal square root. The origin has undefined `log`, `arg`, and reciprocal.
Positive real powers of zero are zero, and `0^0` is defined as one for evaluation.
Poles, overflow, and detected discontinuities produce gaps. Adaptive sampling
refines curved segments and avoids joining unresolved jumps, but finite sampling
can miss features of very rapidly oscillating functions. The Python workbench
adds symbolic analysis within the scope described above; the application is not
a general theorem prover.

## Files and verification

- `index.html`, `styles.css`: accessible controls and responsive layout.
- `math.js`: complex arithmetic and the expression parser.
- `geometry.js`: finite and viewport grids, numerical view validation, adaptive curve sampling,
  and fitting across small and large scales.
- `app.js`: canvas rendering, point inspection, and interactions.
- `analysis-ui.js`: analysis controls, result rendering, and canvas overlays.
- `analysis.py`: validated AST, symbolic analysis, and numerical integration.
- `server.py`, `start.ps1`, `requirements.txt`: isolated local analysis service.
- `test_analysis.py`: mathematical backend regression tests.
- `presets.js`: grouped function presets, shared with the numerical checks.
- `icon.svg`: the original glass-orbit app icon; no remote assets are required.

Run the numerical and parser checks using Node.js (no packages needed):

```sh
node tools/complex-transform/tests.cjs
```
