# Itô integral and isometry

Probability theory · Theorem · Advanced gateway

Stable ID: `pr.ito-integral`

The Brownian stochastic integral is constructed by an L2 isometry.

## Statement

For predictable H with $\mathbb E\int_0^T H_t^2dt<\infty$, the Brownian integral obeys $\mathbb E(\int_0^T H_t\,dB_t)^2=\mathbb E\int_0^T H_t^2dt$.

## Hypotheses and conventions

Use a Brownian filtration with the usual conditions and square integrability in time and probability.

## Example

$\int_0^T B_t\,dB_t=(B_T^2-T)/2$.

## Scope and common pitfalls

This is not ordinary integration against a path of bounded variation.

## Proof idea

Define the integral on adapted step processes, prove the isometry by independent increments and complete in L2.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Brownian motion](./pr.brownian.md)
- [Filtrations and martingales](./pr.martingale.md)

**From other subjects**

- [Hilbert spaces and orthogonal projection](./fa.hilbert.md) — Functional analysis

## Continue to

- [Itô's formula](./pr.ito-formula.md)

## Reference reading

PR: stochastic integration.

- **PR** — Rick Durrett. [Probability: Theory and Examples](https://sites.math.duke.edu/~rtd/PTE/PTE5_011119.pdf). Fifth-edition author manuscript, 2019.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/probability-theory.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
