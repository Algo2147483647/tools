# Riemann zeta function

Number theory · Theorem · Core

Stable ID: `nt.zeta`

The zeta function connects integer summation with an Euler product over primes.

## Statement

For $\operatorname{Re}s>1$, $\zeta(s)=\sum_{n\ge1}n^{-s}=\prod_p(1-p^{-s})^{-1}$. It extends meromorphically to the plane with only a simple pole at 1, of residue one.

## Hypotheses and conventions

Absolute convergence of the series and product holds in the stated half-plane.

## Example

The logarithmic derivative encodes prime powers.

## Scope and common pitfalls

Continuation does not justify using a divergent Euler product term by term.

## Proof idea

Unique factorization gives the product; integral representations provide continuation.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Euclidean algorithm and unique factorization](./nt.divisibility.md)

**From other subjects**

- [Analytic continuation and monodromy](./ca.continuation.md) — Complex analysis

## Continue to

- [Dirichlet characters and L-functions](./nt.dirichlet-characters.md)
- [Prime number theorem](./nt.pnt.md)

## Reference reading

NT2: zeta function.

- **NT2** — Andrew V. Sutherland. [MIT 18.785: Number Theory I](https://ocw.mit.edu/courses/18-785-number-theory-i-fall-2021/pages/lecture-notes/). Fall 2021 lecture notes.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/number-theory.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
