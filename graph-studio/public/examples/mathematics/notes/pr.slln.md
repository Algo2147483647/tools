# Strong law of large numbers

Probability theory · Theorem · Core

Stable ID: `pr.slln`

Independent identically distributed integrable averages converge almost surely to the mean.

## Statement

For iid real variables with $\mathbb E|X_1|<\infty$, $n^{-1}\sum_{k=1}^nX_k\to\mathbb E X_1$ almost surely.

## Hypotheses and conventions

The variables are independent, identically distributed and absolutely integrable.

## Example

Empirical event frequencies converge to their probabilities.

## Scope and common pitfalls

Finite variance is unnecessary, but an undefined mean cannot appear as the limit here.

## Proof idea

Truncate large values, control centered partial sums, apply Borel–Cantelli and remove truncation.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Borel–Cantelli lemmas](./pr.borel-cantelli.md)

**From other subjects**

- [Lebesgue integration](./ra.integral.md) — Real analysis

## Reference reading

PR: laws of large numbers.

- **PR** — Rick Durrett. [Probability: Theory and Examples](https://sites.math.duke.edu/~rtd/PTE/PTE5_011119.pdf). Fifth-edition author manuscript, 2019.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/probability-theory.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
