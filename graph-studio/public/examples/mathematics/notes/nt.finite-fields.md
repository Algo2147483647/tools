# Finite fields

Number theory · Theorem · Core

Stable ID: `nt.finite-fields`

Finite fields exist uniquely at prime-power sizes and have cyclic unit groups.

## Statement

A finite field has $p^n$ elements. For each prime p and positive n there is exactly one up to isomorphism, the splitting field of $x^{p^n}-x$ over $\mathbb F_p$. Its multiplicative group is cyclic.

## Hypotheses and conventions

Cardinality must be a prime power.

## Example

$\mathbb F_4=\mathbb F_2[t]/(t^2+t+1)$.

## Scope and common pitfalls

$\mathbb Z/4\mathbb Z$ is not a field.

## Proof idea

Frobenius identifies the roots as a field; root bounds for polynomials prove multiplicative cyclicity.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Euclidean algorithm and unique factorization](./nt.divisibility.md)

**From other subjects**

- [Groups and homomorphisms](./gt.groups.md) — Group theory

## Continue to

- [Quadratic reciprocity](./nt.reciprocity.md)
- [Splitting and ramification](./nt.ramification.md)

## Reference reading

FT: finite fields.

- **FT** — J. S. Milne. [Fields and Galois Theory](https://www.jmilne.org/math/CourseNotes/FT.pdf). Version 5.10, 2022.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/number-theory.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
