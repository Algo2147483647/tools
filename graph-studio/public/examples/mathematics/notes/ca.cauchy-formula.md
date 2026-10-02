# Cauchy integral formula

Complex analysis · Theorem · Core

Stable ID: `ca.cauchy-formula`

Boundary values recover all interior derivatives of a holomorphic function.

## Statement

If $f$ is holomorphic near a closed disk and $z$ is interior, then $f^{(n)}(z)=\frac{n!}{2\pi i}\int_{\partial D}\frac{f(\zeta)}{(\zeta-z)^{n+1}}\,d\zeta$.

## Hypotheses and conventions

The circle is positively oriented; $n$ is a nonnegative integer.

## Example

On a radius-$R$ circle about $z$, $|f^{(n)}(z)|\le n!\max_{\partial D}|f|/R^n$.

## Scope and common pitfalls

The evaluation point must stay off the integration curve.

## Proof idea

Apply Cauchy's theorem after removing a small disk around the evaluation point, then differentiate under the integral.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Cauchy–Goursat theorem](./ca.cauchy.md)

## Continue to

- [Power series and analyticity](./ca.series.md)
- [Liouville and the fundamental theorem of algebra](./ca.liouville.md)
- [Maximum modulus principle](./ca.maximum.md)
- [Montel's theorem](./ca.normal.md)

## Reference reading

CA: special Cauchy formula and applications.

- **CA** — Sigurdur Helgason; notes by Hongxi Wang. [MIT 18.112: Functions of a Complex Variable](https://ocw.mit.edu/courses/18-112-functions-of-a-complex-variable-fall-2008/pages/lecture-notes/). Fall 2008 lecture notes.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/complex-analysis.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
