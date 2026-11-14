# MathIR and exact algebra

M1 adds a shared bounded parser and MathIR v1 to the independent Python package.
The existing affine solver keeps its independent Fraction evaluator, but consumes
the shared syntax tree. Symbolic, numerical and function-plotting expressions use
the same parser. Existing v1 wire calls remain supported; desktop math calls use v2.

## Input and reuse

`structure_math` accepts exactly one of `expression` or `ir`. Text uses
`format="ascii"` by default, or `format="latex"`. It returns a lossless syntax tree,
an expression/LaTeX preview, and domain conditions. The preview can simplify
constants; the tree retains the original operations. Errors identify an offset in
the expression after trimming surrounding math delimiters and normalizing symbols.

`exact_math`, `symbolic_math` and `algebra_math` also accept `ir` instead of
`expression`. Binary algebra operations accept `otherIR` instead of `other`.
Do not submit both forms of an operand. `domain` is real by default; complex is
available for parsing and symbolic operations. General per-symbol assumptions and
parameter branching are not implemented in M1.

```python
from math_engine import solve

parsed = solve(tool="structure_math", schema_version=2, arguments={
    "expression": r"\frac{x^2-1}{x-1}", "format": "latex"})
answer = solve(tool="symbolic_math", schema_version=2, arguments={
    "operation": "simplify", "ir": parsed["value"]["result"]["ir"]})
# expression: x + 1; retained condition: x != 1
```

## Nodes and serialization

`ir_schema.py` owns the recursive public schema. The generator exposes the same
schema and a discriminated TypeScript `MathIR` union. Runtime validation additionally
checks shape, semantic constraints and budgets. Numbers are strings, never JSON
floating-point values. Supported nodes are:

- Integer, Rational (positive denominator), DecimalLiteral, Symbol, Constant.
- Unary, Add, Subtract, Multiply, Divide, Power, Function, Equation, Matrix.
- Restricted, with `expression` and original `source` trees.
- Algebraic, with integer minimal-polynomial coefficients in descending order and
  `realRootIndex`, indexing increasing distinct real roots.
- EmptySet, Universe, FiniteSet, Interval, Union, Intersection, Complement.

`Restricted` keeps source-domain restrictions attached to transformed expressions.
Reusing a simplified result's `ir` therefore retains exclusions. Consumers must not
unwrap this node and discard its source. Unsupported backend results have no MathIR
output rather than an invented parseable representation. Symbolic solution text can
still describe sets beyond the M1 real-set subset.

## LaTeX subset

Supported: fractions, square roots, powers, single-letter variables, braced
alphanumeric subscripts, `\pi`, multiplication (`\cdot`, `\times`, or unambiguous
juxtaposition), and allowlisted functions with braced or parenthesized arguments.
`matrix`, `pmatrix` and `bmatrix` support rectangular matrices with `&` columns and
`\\` rows. Matrices are parsed and represented; exact matrix algorithms are M2.

Examples: `\frac{1}{3}`, `2x^{2}`, `x_{12}`, `\sin(\pi/2)`,
`\begin{bmatrix}1&2\\3&4\end{bmatrix}`.

Unknown macros, `\left`/`\right`, indexed roots, bare function arguments such as
`\sin x`, malformed matrices, incomplete groups and trailing tokens are rejected.
ASCII uses explicit multiplication outside the legacy affine interface; powers use
`^` or `**`. Scientific notation is parsed directly as a rational decimal.

## Domain semantics

Before simplification, domain analysis records nonzero denominators, nonnegative
real square-root inputs, positive real log inputs, inverse-trigonometric ranges,
tangent poles, and supported power restrictions. Zero to zero and negative powers
is undefined. Fractional powers use the principal-power convention; a real odd-root
operator is not part of this subset. General variable powers and unsupported complex
branch analysis set `analysisComplete=false`.

Symbolic transformations retain input restrictions and add restrictions needed by
their outputs. Symbolic finite solutions are filtered against the original domain;
unknown membership remains conditional. General solution completeness remains
solver-reported. Numerical evaluation and plotting mask known domain violations
before accepting sampled values; this is not a proof of validity over an interval.

## Exact arithmetic

The default `evaluate` retains affine-equation behavior. Additional operations:

| Operation | Semantics |
| --- | --- |
| floor, ceil, truncate | Exact integer rounding; truncate moves toward zero |
| mod | Requires `other`; `a - b*floor(a/b)`, including negative divisors |
| compare | Requires `other`; returns -1, 0 or 1 |
| round | `digits` from -100 to 100; `half_even` default or `half_away_from_zero` |

Unused operation-specific fields are rejected. Arithmetic remains Fraction-based;
scientific notation and rounding never pass through floating point.

## Algebra

`algebra_math` exposes `radical_simplify`, real `algebraic_add`,
`algebraic_subtract`, `algebraic_multiply`, `algebraic_divide`, `algebraic_equal`, and
`minimal_polynomial`. Algebraic results identify a real root exactly and include a
rational isolating interval. Equality uses an exact algebraic field computation;
transcendental constants and symbolic parameters are outside this interface.

Polynomial operations are `divide`, `gcd`, `factor`, `square_free`, `resultant`,
and `isolate_roots`. Declare `variables` in order (default `["x"]`) and
`coefficientDomain` (`QQ` by default, or `ZZ`). `resultant` accepts `eliminate`,
defaulting to the first variable. Elimination returns a constraint, not a complete
solution set. Root isolation returns all real roots with multiplicities; zero and
multivariate polynomials are rejected for that operation.

Division checks the quotient/remainder identity and that remainder monomials are
not divisible by the divisor's leading monomial. If ZZ cannot produce that reduced
remainder, select QQ explicitly. Factorization checks the exact reconstructed
product. These checks use the same symbolic backend, not an independent formal proof.

Budgets: at most 3 polynomial variables, structural degree 20 and 200 expanded
terms; algebraic extension budget 16; scalar arithmetic 4096 bits; 512 syntax nodes,
bounded nesting and at most 100 matrix entries. Processes retain host-enforced
deadlines. Conservative budget rejection can occur before a cancellation that would
eventually simplify an expression.

## Sets

`set_math` supports normalize, union, intersection, difference, and complement.
FiniteSet elements and finite interval endpoints are real constant MathIR nodes.
Infinite endpoints are the strings `"-inf"` / `"inf"` and must be open.

```json
{"kind":"Interval","start":{"kind":"Integer","value":"0"},
 "end":{"kind":"Integer","value":"1"},"leftOpen":false,"rightOpen":true}
```

Binary operations use `set` and `other`. Complement requires `universe` and provable
containment of the input set in that universe. Universe nodes support Reals and
Integers; symbolic conditions and complex-plane regions are outside the set subset.
Outputs preserve open/closed endpoints, missing points, and exact algebraic endpoints.

Backend API references: [SymPy polynomial operations](https://docs.sympy.org/latest/modules/polys/reference.html)
and [number fields](https://docs.sympy.org/latest/modules/polys/numberfields.html).
