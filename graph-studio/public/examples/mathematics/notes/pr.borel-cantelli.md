# Borel–Cantelli lemmas

Probability theory · Theorem · Core

Stable ID: `pr.borel-cantelli`

Summable event probabilities prevent infinitely many occurrences almost surely.

## Statement

If $\sum_n\mathbb P(A_n)<\infty$, only finitely many $A_n$ occur almost surely. If the events are independent and the sum diverges, infinitely many occur almost surely.

## Hypotheses and conventions

Independence is needed for the second conclusion in this version.

## Example

Independent fair tosses produce infinitely many heads almost surely.

## Scope and common pitfalls

Divergence of the sum for dependent events does not suffice.

## Proof idea

A union bound proves the first part; independence and a product bound prove the second.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Independence and product laws](./pr.independence.md)

## Continue to

- [Strong law of large numbers](./pr.slln.md)

## Reference reading

PR: Borel-Cantelli lemmas.

- **PR** — Rick Durrett. [Probability: Theory and Examples](https://sites.math.duke.edu/~rtd/PTE/PTE5_011119.pdf). Fifth-edition author manuscript, 2019.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/probability-theory.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
