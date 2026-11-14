# Independent mathematics engine

Python package: `math-agent-engine` 0.9.0, import name `math_engine`.
No Electron, model configuration, API key or network is needed to compute.

```python
from math_engine import execute, catalogue

response = execute({
    "schemaVersion": 1,
    "tool": "convex_optimize",
    "arguments": {
        "operation": "quadratic_program",
        "linear": [-2, -4],
        "quadratic": [[2, 0], [0, 2]],
        "lower": [0, 0]
    }
})
# objective = 0.5*x.T@P@x + q.T@x; expected x approximately [1, 2]
print(response)
```

Install with `python -m pip install .` from this directory (Python >= 3.12),
or install the built wheel. Run `python -m math_engine --catalogue` for tools.
The CLI accepts one versioned JSON request from stdin and writes one JSON response.
`worker.py` is the source-tree/desktop launcher. Resource limits apply to CLI workers;
importing and using the library does not change the caller's process resource policy.

Capabilities:
- `exact_math`: bounded rational arithmetic and single-variable affine equations,
  including implicit multiplication, decimal rationals, identity and contradiction.
  A separate AST evaluator checks the affine domain and solution substitution.
- `symbolic_math`: simplify, expand, factor, solve, derivative, integral, limit.
- `numeric_math`: roots, integration, local scalar minimization, linear systems, eigenvalues.
- `plot_math`: functions and dataset charts as PNG views.
- `analyze_data`: descriptions, correlation, regression, grouping and filtering.
- `convex_optimize`: LP, symmetric positive-semidefinite QP, constrained least squares,
  and second-order cone constraints, using CVXPY 1.6.5 and CLARABEL.

Optimization conventions: minimize; `inequalityMatrix*x <= inequalityBounds`,
`equalityMatrix*x == equalityBounds`, finite componentwise `lower`/`upper`.
Each cone imposes `norm(matrix*x+offset, 2) <= axis.T*x+bound`.
Decision vectors have at most 100 elements. No integer or arbitrary nonconvex programming
is exposed by this tool. DCP checks, solver status, primal residuals and dual values are
reported; numerical solver success is not a formal or independently checked optimality proof.
Infeasible/unbounded statuses have null primal/objective values rather than JSON infinity.
A near-semidefinite matrix with negative computed eigenvalues is conservatively rejected.

`src/math_engine/catalogue.json` is the single source for tool names, descriptions,
argument schemas and execution budgets. Python validates all requests against it.
`protocol.py` owns the versioned request/result envelope schemas.
Run `scripts/Generate-MathContracts.py` from the repository to generate JSON schemas,
TypeScript argument types, envelope types and the desktop tool catalogue.
Use `--check` to detect drift. Generated TypeScript contains no executable math.

Dependencies are declared in `pyproject.toml`. `runtime-lock.json` pins all Windows
embedded-runtime wheels and SHA-256 hashes. `scripts/Prepare-MathRuntime.ps1` consumes
that lock. Runtime installation is a build/preparation step, not a model capability.

Tests: `python -m unittest discover -s tests -v` after installing the package.
The desktop also has registry, artifact and AI tool-loop integration tests.
The previous TS exact implementation exists only under `tests/reference/exact-ts`
for differential testing; it is not built or shipped in the desktop app.


## Workspace API and task lifecycle

`solve(tool=..., arguments=..., dataset=None)` uses the same validator and dispatch as
`execute(request)`. Both return `{schemaVersion, ok, value/error}`. Mathematical errors
are responses, not exceptions; inspect `ok`. `batch(tool=..., arguments_list=[...])`
runs up to 100 cases sequentially, preserves partial failures, and stops on cancellation
or an exhausted deadline. Results are not aggregated into an optimality proof.

```python
from math_engine import batch
results = batch(tool="exact_math", arguments_list=[
    {"expression": "1/3+1/6"}, {"expression": "1/0"}])
```

The desktop installs `execution_context` around generated Python. Public API calls
emit parent-linked start/completion records to Detail, with parameters, response,
verification and remaining budget. Views become normal answer artifacts. All calls
share the parent tool deadline; the host kills the worker and waits for termination
on cancellation/timeout, including while a native solver is running. Direct library
use outside the desktop has cooperative checks between calls only; an external host
must enforce hard interruption. Context does not automatically propagate into new
Python threads/processes. Direct CVXPY/SymPy calls bypass API tracing and validation.
This workspace is a local execution environment, not a filesystem/network sandbox.
The trace transport is bounded to 6 MB per worker run; keep large outputs in files.
