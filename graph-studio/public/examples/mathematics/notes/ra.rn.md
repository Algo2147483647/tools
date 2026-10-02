# Radon–Nikodym theorem

Real analysis · Theorem · Core

Stable ID: `ra.rn`

Absolute continuity of sigma-finite measures yields an almost-everywhere density.

## Statement

For sigma-finite positive measures $\nu\ll\mu$ on the same sigma-algebra, there is measurable $h\ge0$ with $\nu(A)=\int_A h\,d\mu$, unique $\mu$-almost everywhere.

## Hypotheses and conventions

Absolute continuity means every mu-null set is nu-null.

## Example

Probability densities are Radon–Nikodym derivatives relative to a chosen reference measure.

## Scope and common pitfalls

A point mass has no density with respect to Lebesgue measure.

## Proof idea

Construct the absolutely continuous component and use maximality to show that the residual measure vanishes.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Lebesgue integration](./ra.integral.md)

## Continue to

- [Conditional expectation](./pr.conditional.md)

## Reference reading

RA: Radon–Nikodym theorem.

- **RA** — Jeff Viaclovsky; notes by Ethan Brown. [MIT 18.125: Measure and Integration](https://ocw.mit.edu/courses/18-125-measure-and-integration-fall-2003/pages/lecture-notes/). Fall 2003 lecture notes.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/real-analysis.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
