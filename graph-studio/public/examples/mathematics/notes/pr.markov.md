# Finite-state Markov chains

Probability theory · Theorem · Core

Stable ID: `pr.markov`

## Statement

An irreducible finite-state Markov chain has a unique stationary probability vector. If also aperiodic, its distribution converges to that vector from every initial distribution.

## Hypotheses and conventions

Transition-matrix rows sum to one; irreducibility means all states communicate.

## Example

Deterministic alternation between two states is irreducible but periodic.

## Scope and common pitfalls

Stationarity alone does not guarantee convergence.

## Proof idea

Irreducibility yields the stationary eigenvector; aperiodicity removes other peripheral eigenvalues.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Conditional expectation](./pr.conditional.md)

## Reference reading

PR: Markov chains.

- **PR** — Rick Durrett. [Probability: Theory and Examples](https://sites.math.duke.edu/~rtd/PTE/PTE5_011119.pdf). Fifth-edition author manuscript, 2019.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/probability-theory.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
