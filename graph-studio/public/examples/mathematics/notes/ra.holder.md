# Hölder and Minkowski inequalities

Real analysis · Theorem · Core

Stable ID: `ra.holder`

Conjugate exponents control products, and Minkowski supplies the triangle inequality.

## Statement

For conjugate exponents $p,q\in[1,\infty]$, $\|fg\|_1\le\|f\|_p\|g\|_q$. For $p\ge1$, $\|f+g\|_p\le\|f\|_p+\|g\|_p$.

## Hypotheses and conventions

Conjugacy means $1/p+1/q=1$, with $1/\infty=0$.

## Example

The case $p=q=2$ gives the integral Cauchy–Schwarz inequality.

## Scope and common pitfalls

Endpoint cases need essential suprema; strict convexity equality statements depend on the exponent.

## Proof idea

Use Young's inequality after normalization, then apply Hölder to the expansion controlling the pth power.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Lp spaces](./ra.lp.md)

## Continue to

- [Continuous dual and bidual](./fa.dual.md)
- [Doob maximal inequality](./pr.doob.md)

## Reference reading

RA: Lp inequalities.

- **RA** — Jeff Viaclovsky; notes by Ethan Brown. [MIT 18.125: Measure and Integration](https://ocw.mit.edu/courses/18-125-measure-and-integration-fall-2003/pages/lecture-notes/). Fall 2003 lecture notes.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/real-analysis.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
