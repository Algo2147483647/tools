# Brownian motion

Probability theory · Definition · Core

Stable ID: `pr.brownian`

Brownian motion has continuous paths and independent Gaussian increments.

## Statement

Standard Brownian motion starts at zero, has continuous paths and independent stationary increments with $B_t-B_s\sim N(0,t-s)$ for $0\le s<t$.

## Hypotheses and conventions

For stochastic calculus the filtration must make future increments independent of present information.

## Example

$\mathbb E[B_sB_t]=\min(s,t)$.

## Scope and common pitfalls

Paths are almost surely nowhere differentiable despite continuity.

## Selected prerequisites

**Within this subject**

- [Kolmogorov extension theorem](./pr.extension.md)
- [Independence and product laws](./pr.independence.md)

## Continue to

- [Itô integral and isometry](./pr.ito-integral.md)

## Reference reading

PR: Brownian motion.

- **PR** — Rick Durrett. [Probability: Theory and Examples](https://sites.math.duke.edu/~rtd/PTE/PTE5_011119.pdf). Fifth-edition author manuscript, 2019.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/probability-theory.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
