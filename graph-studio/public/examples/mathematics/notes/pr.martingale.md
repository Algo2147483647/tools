# Filtrations and martingales

Probability theory · Definition · Core

Stable ID: `pr.martingale`

A martingale preserves its conditional mean as information grows.

## Statement

A filtration is an increasing sequence $\mathcal F_n$ of sigma-algebras. An integrable adapted process is a martingale if $\mathbb E[M_{n+1}\mid\mathcal F_n]=M_n$ almost surely.

## Hypotheses and conventions

The filtration is part of the data.

## Example

Centered partial sums of independent integrable increments form a martingale.

## Scope and common pitfalls

Martingales need not have independent increments.

## Selected prerequisites

**Within this subject**

- [Conditional expectation](./pr.conditional.md)

## Continue to

- [Doob maximal inequality](./pr.doob.md)
- [Optional stopping](./pr.stopping.md)
- [Martingale convergence](./pr.martingale-limit.md)
- [Itô integral and isometry](./pr.ito-integral.md)

## Reference reading

PR: martingales.

- **PR** — Rick Durrett. [Probability: Theory and Examples](https://sites.math.duke.edu/~rtd/PTE/PTE5_011119.pdf). Fifth-edition author manuscript, 2019.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/probability-theory.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
