# Rouché's theorem

Complex analysis · Theorem · Core

Stable ID: `ca.rouche`

A strict boundary perturbation bound preserves the number of interior zeros.

## Statement

If $f,g$ are holomorphic near a closed Jordan region and $|g|<|f|$ on its boundary, then $f$ and $f+g$ have the same number of interior zeros.

## Hypotheses and conventions

Zeros are counted with multiplicity; the strict boundary inequality is the stated version.

## Example

On $|z|=2$, $z^5$ dominates $z+1$, so $z^5+z+1$ has five zeros inside.

## Scope and common pitfalls

The theorem counts zeros but does not locate individual roots.

## Proof idea

The boundary functions $f+tg$ avoid zero, so their winding number is constant for $0\le t\le1$.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Argument principle](./ca.argument.md)

## Reference reading

CA: Rouché theorem.

- **CA** — Sigurdur Helgason; notes by Hongxi Wang. [MIT 18.112: Functions of a Complex Variable](https://ocw.mit.edu/courses/18-112-functions-of-a-complex-variable-fall-2008/pages/lecture-notes/). Fall 2008 lecture notes.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/complex-analysis.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
