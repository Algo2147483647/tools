# Power series and analyticity

Complex analysis · Theorem · Core

Stable ID: `ca.series`

## Statement

A complex power series converges locally uniformly inside its radius of convergence and may be differentiated termwise there. Holomorphic functions locally equal their Taylor series.

## Hypotheses and conventions

Taylor expansion is inside a disk contained in the domain of holomorphy.

## Example

$1/(1-z)=\sum_{n\ge0}z^n$ for $|z|<1$.

## Scope and common pitfalls

Real smoothness does not imply analyticity; boundary convergence needs a separate argument.

## Proof idea

Use uniform convergence on smaller disks and Cauchy estimates for the Taylor remainder.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Cauchy integral formula](./ca.cauchy-formula.md)

**From other subjects**

- [Uniform convergence](./ra.uniform.md) — Real analysis

## Continue to

- [Identity theorem](./ca.identity.md)
- [Laurent series and isolated singularities](./ca.singularities.md)

## Reference reading

CA: power series; Cauchy formula.

- **CA** — Sigurdur Helgason; notes by Hongxi Wang. [MIT 18.112: Functions of a Complex Variable](https://ocw.mit.edu/courses/18-112-functions-of-a-complex-variable-fall-2008/pages/lecture-notes/). Fall 2008 lecture notes.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/complex-analysis.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
