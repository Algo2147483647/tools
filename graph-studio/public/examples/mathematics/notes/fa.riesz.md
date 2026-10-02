# Riesz representation in Hilbert space

Functional analysis · Theorem · Core

Stable ID: `fa.riesz`

Every continuous Hilbert-space functional is inner product with a unique vector.

## Statement

With inner product linear in the first variable, every continuous linear functional on H has the unique form $x\mapsto\langle x,y\rangle$ for some y, with norm $\|y\|$.

## Hypotheses and conventions

H is a Hilbert space; the convention fixes the conjugate-linearity of the representing correspondence.

## Example

Coordinate evaluation on $\ell^2$ is represented by a standard basis vector.

## Scope and common pitfalls

This is distinct from the Riesz–Markov theorem representing functionals by measures.

## Proof idea

Project onto the orthogonal complement of the functional's kernel.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Hilbert spaces and orthogonal projection](./fa.hilbert.md)
- [Continuous dual and bidual](./fa.dual.md)

## Continue to

- [Spectral theorem for bounded normal operators](./fa.spectral-measure.md)
- [Lax–Milgram theorem](./fa.lax-milgram.md)

## Reference reading

FA: Hilbert space representation.

- **FA** — Casey Rodriguez; Richard Melrose. [MIT 18.102: Introduction to Functional Analysis](https://ocw.mit.edu/courses/18-102-introduction-to-functional-analysis-spring-2021/pages/lecture-notes-and-readings/). Spring 2021; includes Melrose's 2020 notes.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/functional-analysis.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
