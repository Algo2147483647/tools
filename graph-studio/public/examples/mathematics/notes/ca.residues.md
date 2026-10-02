# Residue theorem

Complex analysis · Theorem · Core

Stable ID: `ca.residues`

Contour integrals of meromorphic functions reduce to weighted residues at poles.

## Statement

For a meromorphic function with finitely many poles relevant to a null-homologous contour, $\int_\gamma f\,dz=2\pi i\sum_a\operatorname{Ind}(\gamma,a)\operatorname{Res}_a f$.

## Hypotheses and conventions

The contour avoids poles and is null-homologous in the original domain before removing them.

## Example

The residue of $g(z)/(z-a)$ is $g(a)$ when $g$ is holomorphic near $a$.

## Scope and common pitfalls

Higher-order poles require the Laurent coefficient, not simply the numerator value.

## Proof idea

Subtract principal parts and apply Cauchy's theorem to the remaining holomorphic function.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Laurent series and isolated singularities](./ca.singularities.md)
- [Contour integrals and winding number](./ca.contours.md)

## Continue to

- [Argument principle](./ca.argument.md)
- [Prime number theorem](./nt.pnt.md)

## Reference reading

CA: residue theorem.

- **CA** — Sigurdur Helgason; notes by Hongxi Wang. [MIT 18.112: Functions of a Complex Variable](https://ocw.mit.edu/courses/18-112-functions-of-a-complex-variable-fall-2008/pages/lecture-notes/). Fall 2008 lecture notes.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/complex-analysis.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
