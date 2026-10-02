# Absolute continuity and the FTC

Real analysis · Theorem · Core

Stable ID: `ra.absolute-continuity`

Absolute continuity is exactly reconstruction by an integrable derivative on an interval.

## Statement

On $[a,b]$, a function is absolutely continuous exactly when it has the form $f(x)=f(a)+\int_a^x g(t)\,dt$ for some $g\in L^1$; then $f'=g$ almost everywhere.

## Hypotheses and conventions

The interval is compact and the derivative is interpreted almost everywhere.

## Example

The Cantor function is continuous with derivative zero almost everywhere but is not absolutely continuous.

## Scope and common pitfalls

Almost-everywhere differentiability alone does not reconstruct a function from its derivative.

## Proof idea

Use differentiation of the indefinite integral and the measure induced by an absolutely continuous function.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Lebesgue differentiation theorem](./ra.differentiation.md)

## Reference reading

RA: absolute continuity and differentiation.

- **RA** — Jeff Viaclovsky; notes by Ethan Brown. [MIT 18.125: Measure and Integration](https://ocw.mit.edu/courses/18-125-measure-and-integration-fall-2003/pages/lecture-notes/). Fall 2003 lecture notes.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/real-analysis.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
