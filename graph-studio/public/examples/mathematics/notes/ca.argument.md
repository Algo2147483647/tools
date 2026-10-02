# Argument principle

Complex analysis · Theorem · Core

Stable ID: `ca.argument`

The winding of function values counts interior zeros minus poles.

## Statement

For a positively oriented Jordan boundary, $(2\pi i)^{-1}\int f'/f$ equals the number of zeros minus poles inside, counted with multiplicity.

## Hypotheses and conventions

The Jordan boundary is piecewise C1. The function is meromorphic near the enclosed closed region and has no zero or pole on the boundary.

## Example

A zero of order $m$ contributes residue $m$ to $f'/f$.

## Scope and common pitfalls

Zeros on the contour invalidate the formula without an additional limiting prescription.

## Proof idea

Compute the local residues of the logarithmic derivative.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Residue theorem](./ca.residues.md)

## Continue to

- [Rouché's theorem](./ca.rouche.md)

## Reference reading

CA: argument principle.

- **CA** — Sigurdur Helgason; notes by Hongxi Wang. [MIT 18.112: Functions of a Complex Variable](https://ocw.mit.edu/courses/18-112-functions-of-a-complex-variable-fall-2008/pages/lecture-notes/). Fall 2008 lecture notes.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/complex-analysis.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
