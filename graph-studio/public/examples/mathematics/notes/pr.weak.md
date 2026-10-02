# Weak convergence and Portmanteau

Probability theory · Theorem · Core

Stable ID: `pr.weak`

Weak convergence is tested by bounded continuous functions and closed-set inequalities.

## Statement

For Borel probability measures on a metric space, weak convergence means convergence of integrals of all bounded continuous real functions. Equivalently, $\limsup_n\mu_n(F)\le\mu(F)$ for every closed F.

## Hypotheses and conventions

The measures live on the same metric space.

## Example

Probabilities converge for sets whose boundary has limiting measure zero.

## Scope and common pitfalls

Integrals of unbounded continuous functions need not converge.

## Proof idea

Approximate closed-set indicators by distance cutoffs and use level-set bounds for the converse.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Modes of convergence](./pr.convergence.md)

**From other subjects**

- [Topological spaces and continuity](./tp.spaces.md) — Topology

## Continue to

- [Central limit theorem](./pr.clt.md)

## Reference reading

PR: weak convergence.

- **PR** — Rick Durrett. [Probability: Theory and Examples](https://sites.math.duke.edu/~rtd/PTE/PTE5_011119.pdf). Fifth-edition author manuscript, 2019.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/probability-theory.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
