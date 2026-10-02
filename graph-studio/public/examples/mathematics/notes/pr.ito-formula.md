# Itô's formula

Probability theory · Theorem · Advanced gateway

Stable ID: `pr.ito-formula`

The stochastic chain rule includes a second-order quadratic-variation correction.

## Statement

For $f\in C^{1,2}([0,T]\times\mathbb R)$, $df(t,B_t)=(f_t+\tfrac12f_{xx})(t,B_t)dt+f_x(t,B_t)dB_t$, locally when global integrability is unavailable.

## Hypotheses and conventions

One continuous time derivative and two continuous spatial derivatives suffice in this version.

## Example

$d(B_t^2)=2B_t\,dB_t+dt$.

## Scope and common pitfalls

The second-derivative term records quadratic variation and cannot be omitted.

## Proof idea

Taylor-expand along partitions; squared increments converge to elapsed time and higher-order remainders vanish after localization.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Itô integral and isometry](./pr.ito-integral.md)

## Reference reading

PR: Ito formula.

- **PR** — Rick Durrett. [Probability: Theory and Examples](https://sites.math.duke.edu/~rtd/PTE/PTE5_011119.pdf). Fifth-edition author manuscript, 2019.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/probability-theory.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
