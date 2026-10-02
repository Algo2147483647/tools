# Doob maximal inequality

Probability theory · Theorem · Core

Stable ID: `pr.doob`

A terminal Lp bound controls the maximum along a finite martingale path.

## Statement

For a discrete-time martingale, finite horizon n and $p>1$, $\|\max_{0\le k\le n}|M_k|\|_p\le p/(p-1)\,\|M_n\|_p$.

## Hypotheses and conventions

The terminal value is in Lp.

## Example

The terminal Lp size controls the maximum along a finite path.

## Scope and common pitfalls

The strong inequality has no finite constant of this form at p = 1.

## Proof idea

Stop at the first threshold crossing, bound the tail and integrate using Holder's inequality.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Filtrations and martingales](./pr.martingale.md)

**From other subjects**

- [Hölder and Minkowski inequalities](./ra.holder.md) — Real analysis

## Reference reading

PR: maximal inequalities.

- **PR** — Rick Durrett. [Probability: Theory and Examples](https://sites.math.duke.edu/~rtd/PTE/PTE5_011119.pdf). Fifth-edition author manuscript, 2019.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/probability-theory.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
