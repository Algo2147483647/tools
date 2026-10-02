# Martingale convergence

Probability theory · Theorem · Core

Stable ID: `pr.martingale-limit`

L1-bounded martingales converge almost surely; uniform integrability strengthens the limit.

## Statement

If $\sup_n\mathbb E|M_n|<\infty$, a discrete-time martingale converges almost surely to an integrable limit. Under uniform integrability it also converges in $L^1$ and $M_n=\mathbb E[M_\infty\mid\mathcal F_n]$.

## Hypotheses and conventions

L1 boundedness and uniform integrability have distinct consequences.

## Example

Nonnegative martingales converge almost surely but can lose expectation in the limit.

## Scope and common pitfalls

L1 boundedness alone does not ensure L1 convergence.

## Proof idea

The upcrossing inequality excludes oscillation; Fatou gives integrability and uniform integrability justifies the conditional limit.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Filtrations and martingales](./pr.martingale.md)
- [Uniform integrability](./pr.ui.md)

## Reference reading

PR: martingale convergence.

- **PR** — Rick Durrett. [Probability: Theory and Examples](https://sites.math.duke.edu/~rtd/PTE/PTE5_011119.pdf). Fifth-edition author manuscript, 2019.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/probability-theory.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
