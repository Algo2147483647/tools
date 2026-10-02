# Monotone convergence

Real analysis · Theorem · Core

Stable ID: `ra.mct`

Increasing nonnegative functions permit interchange of limits and integrals.

## Statement

If $0\le f_n\uparrow f$ almost everywhere, then $\int f_n\,d\mu\uparrow\int f\,d\mu$, allowing infinity.

## Hypotheses and conventions

The functions are measurable and nonnegative; no finite total measure assumption is needed.

## Example

Increasing simple approximations compute the integral of a nonnegative measurable function.

## Scope and common pitfalls

Decreasing sequences require a finite-integral bound for the analogous conclusion.

## Proof idea

Compare the limiting integrals with every simple function lying below the limit.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Lebesgue integration](./ra.integral.md)

## Continue to

- [Fatou's lemma](./ra.fatou.md)
- [Tonelli and Fubini](./ra.fubini.md)

## Reference reading

RA: lecture 4.

- **RA** — Jeff Viaclovsky; notes by Ethan Brown. [MIT 18.125: Measure and Integration](https://ocw.mit.edu/courses/18-125-measure-and-integration-fall-2003/pages/lecture-notes/). Fall 2003 lecture notes.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/real-analysis.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
