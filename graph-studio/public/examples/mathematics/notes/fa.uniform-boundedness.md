# Uniform boundedness principle

Functional analysis · Theorem · Core

Stable ID: `fa.uniform-boundedness`

Pointwise bounded operator families on a Banach domain have uniformly bounded norms.

## Statement

If X is Banach and $\{T_i:X\to Y\}$ are bounded linear maps with $\sup_i\|T_i x\|<\infty$ for each x, then $\sup_i\|T_i\|<\infty$.

## Hypotheses and conventions

Y need only be normed; the completeness requirement is on X.

## Example

Pointwise bounded continuous linear functionals on a Banach space have uniformly bounded norms.

## Scope and common pitfalls

Pointwise boundedness on a merely dense set is not enough.

## Proof idea

Apply Baire to closed sets on which all operator values have a common bound, then translate and rescale a ball.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Baire category theorem](./fa.baire.md)
- [Bounded linear operators](./fa.operators.md)

## Reference reading

FA: uniform boundedness.

- **FA** — Casey Rodriguez; Richard Melrose. [MIT 18.102: Introduction to Functional Analysis](https://ocw.mit.edu/courses/18-102-introduction-to-functional-analysis-spring-2021/pages/lecture-notes-and-readings/). Spring 2021; includes Melrose's 2020 notes.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/functional-analysis.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
