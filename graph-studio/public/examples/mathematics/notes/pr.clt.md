# Central limit theorem

Probability theory · Theorem · Core

Stable ID: `pr.clt`

Finite-variance independent identically distributed sums have a Gaussian scaling limit.

## Statement

For iid real variables with mean $\mu$ and variance $0<\sigma^2<\infty$, $(\sum_{k=1}^nX_k-n\mu)/(\sigma\sqrt n)$ converges in law to $N(0,1)$.

## Hypotheses and conventions

This version assumes finite, strictly positive variance.

## Example

Standardized binomial counts approach the normal law.

## Scope and common pitfalls

Infinite-variance laws may require different scaling and different limits.

## Proof idea

Expand the characteristic function at zero to second order and apply its continuity theorem.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Characteristic functions](./pr.characteristic.md)
- [Weak convergence and Portmanteau](./pr.weak.md)

## Reference reading

PR: central limit theorem.

- **PR** — Rick Durrett. [Probability: Theory and Examples](https://sites.math.duke.edu/~rtd/PTE/PTE5_011119.pdf). Fifth-edition author manuscript, 2019.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/probability-theory.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
