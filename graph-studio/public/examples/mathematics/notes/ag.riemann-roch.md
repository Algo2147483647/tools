# Riemann–Roch for curves

Algebraic geometry · Theorem · Core

Stable ID: `ag.riemann-roch`

Riemann–Roch balances sections, divisor degree and genus on smooth projective curves.

## Statement

For a divisor D on a smooth projective geometrically integral curve of genus g over an algebraically closed field, $\ell(D)-\ell(K_C-D)=\deg D+1-g$, where $\ell(D)=\dim H^0(C,\mathcal O_C(D))$.

## Hypotheses and conventions

K_C is a canonical divisor; degree and genus use the curve's smooth projective structure.

## Example

On $\mathbb P^1$, $h^0(\mathcal O(d))=d+1$ for $d\ge0$.

## Scope and common pitfalls

The same formula without correction does not apply to arbitrary singular or nonproper curves.

## Proof idea

Compute the Euler characteristic by adding points to a divisor and use Serre duality to identify the H1 term.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Smooth projective curves and genus](./ag.curves.md)
- [Line bundles and the Picard group](./ag.line-bundles.md)

## Reference reading

STACKS: Riemann-Roch theorem.

- **STACKS** — The Stacks Project Authors. [The Stacks Project](https://stacks.math.columbia.edu/browse). Living reference; schemes, morphisms and algebraic curves.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/algebraic-geometry.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
