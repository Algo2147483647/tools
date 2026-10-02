# Conditional expectation

Probability theory · Theorem · Core

Stable ID: `pr.conditional`

Conditional expectation matches integrals on all events observable in a sub-sigma-algebra.

## Statement

For $X\in L^1$ and a sub-sigma-algebra $\mathcal G$, there is a $\mathcal G$-measurable integrable Y such that $\int_A Y\,d\mathbb P=\int_A X\,d\mathbb P$ for all $A\in\mathcal G$. It is unique almost surely and denoted $\mathbb E[X\mid\mathcal G]$.

## Hypotheses and conventions

Equality and uniqueness are modulo null sets.

## Example

For a finite partition, conditioning averages over cells of positive probability.

## Scope and common pitfalls

The elementary ratio formula cannot condition directly on a probability-zero event.

## Proof idea

Apply Radon–Nikodym to positive and negative parts on the sub-sigma-algebra.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Probability spaces and random variables](./pr.space.md)

**From other subjects**

- [Radon–Nikodym theorem](./ra.rn.md) — Real analysis

## Continue to

- [Regular conditional distributions](./pr.regular.md)
- [Filtrations and martingales](./pr.martingale.md)
- [Finite-state Markov chains](./pr.markov.md)

## Reference reading

PR: conditional expectation.

- **PR** — Rick Durrett. [Probability: Theory and Examples](https://sites.math.duke.edu/~rtd/PTE/PTE5_011119.pdf). Fifth-edition author manuscript, 2019.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/probability-theory.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
