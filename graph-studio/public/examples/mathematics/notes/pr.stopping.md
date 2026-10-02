# Optional stopping

Probability theory · Theorem · Core

Stable ID: `pr.stopping`

Optional stopping preserves martingale identities under boundedness or uniform integrability.

## Statement

For a discrete-time martingale and bounded stopping times $S\le T$, $\mathbb E[M_T\mid\mathcal F_S]=M_S$. The same holds for almost-surely finite S,T when the martingale is uniformly integrable.

## Hypotheses and conventions

Stopping times cannot depend on future information; integrability controls passage to limits.

## Example

Stopping an integrable fair game before a fixed round preserves expected capital.

## Scope and common pitfalls

An unbounded doubling strategy lacks the required integrability control.

## Proof idea

Sum stopped increments at finite horizons, then use uniform integrability for unbounded horizons.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Filtrations and martingales](./pr.martingale.md)
- [Uniform integrability](./pr.ui.md)

## Reference reading

PR: optional stopping.

- **PR** — Rick Durrett. [Probability: Theory and Examples](https://sites.math.duke.edu/~rtd/PTE/PTE5_011119.pdf). Fifth-edition author manuscript, 2019.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/probability-theory.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
