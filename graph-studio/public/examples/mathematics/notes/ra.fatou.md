# Fatou's lemma

Real analysis · Theorem · Core

Stable ID: `ra.fatou`

Nonnegative limits obey a one-sided inequality for their integrals.

## Statement

For nonnegative measurable $f_n$, $\int\liminf_n f_n\,d\mu\le\liminf_n\int f_n\,d\mu$.

## Hypotheses and conventions

Nonnegativity may be replaced by a common integrable lower bound.

## Example

Indicators of intervals $[n,n+1]$ on $\mathbb R$ show that strict inequality can occur.

## Scope and common pitfalls

Fatou gives an inequality, not permission to exchange integral and limit.

## Proof idea

Apply monotone convergence to the increasing sequence of tail infima.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Monotone convergence](./ra.mct.md)

## Continue to

- [Dominated convergence](./ra.dct.md)

## Reference reading

RA: lecture 4.

- **RA** — Jeff Viaclovsky; notes by Ethan Brown. [MIT 18.125: Measure and Integration](https://ocw.mit.edu/courses/18-125-measure-and-integration-fall-2003/pages/lecture-notes/). Fall 2003 lecture notes.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/real-analysis.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
