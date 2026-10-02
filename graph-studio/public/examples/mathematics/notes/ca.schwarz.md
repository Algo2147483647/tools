# Schwarz lemma

Complex analysis · Theorem · Core

Stable ID: `ca.schwarz`

A disk self-map fixing zero contracts radial size, with rigid equality cases.

## Statement

For holomorphic $f:\mathbb D\to\mathbb D$ with $f(0)=0$, $|f(z)|\le|z|$ and $|f'(0)|\le1$. Equality at a nonzero point, or in the derivative bound, forces a rotation.

## Hypotheses and conventions

The normalization at zero is essential to this form.

## Example

$f(z)=e^{i\theta}z$ realizes equality.

## Scope and common pitfalls

For general disk maps use automorphisms and Schwarz–Pick, not the unnormalized inequality.

## Proof idea

Apply the maximum principle to the removable extension of $f(z)/z$.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Maximum modulus principle](./ca.maximum.md)

## Continue to

- [Riemann mapping theorem](./ca.riemann-mapping.md)

## Reference reading

CA: Schwarz lemma.

- **CA** — Sigurdur Helgason; notes by Hongxi Wang. [MIT 18.112: Functions of a Complex Variable](https://ocw.mit.edu/courses/18-112-functions-of-a-complex-variable-fall-2008/pages/lecture-notes/). Fall 2008 lecture notes.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/complex-analysis.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
