# Dominated convergence

Real analysis · Theorem · Core

Stable ID: `ra.dct`

A common integrable bound upgrades almost-everywhere convergence to convergence in mean.

## Statement

If $f_n\to f$ almost everywhere and $|f_n|\le g$ for one $g\in L^1(\mu)$, then $f\in L^1$ and $\|f_n-f\|_1\to0$.

## Hypotheses and conventions

The dominating function is independent of $n$ and integrable on the whole domain.

## Example

$n\mathbf1_{(0,1/n)}$ has no such domination and its integrals do not approach the integral of its pointwise limit.

## Scope and common pitfalls

Pointwise convergence plus bounded integrals alone is insufficient.

## Proof idea

Apply Fatou to an integrable upper bound minus the absolute error.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Fatou's lemma](./ra.fatou.md)

## Continue to

- [Tonelli and Fubini](./ra.fubini.md)
- [Plancherel theorem](./ra.fourier.md)

## Reference reading

RA: lecture 5.

- **RA** — Jeff Viaclovsky; notes by Ethan Brown. [MIT 18.125: Measure and Integration](https://ocw.mit.edu/courses/18-125-measure-and-integration-fall-2003/pages/lecture-notes/). Fall 2003 lecture notes.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/real-analysis.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
