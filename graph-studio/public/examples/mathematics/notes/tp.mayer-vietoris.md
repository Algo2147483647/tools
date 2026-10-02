# Mayer–Vietoris sequence

Topology · Theorem · Core

Stable ID: `tp.mayer-vietoris`

An open cover relates homology of the pieces, their intersection and their union.

## Statement

For an open cover $X=U\cup V$, homology fits into $\cdots\to H_n(U\cap V)\to H_n(U)\oplus H_n(V)\to H_n(X)\to H_{n-1}(U\cap V)\to\cdots$.

## Hypotheses and conventions

Use a consistent sign convention for the two inclusion maps.

## Example

Two enlarged hemispheres compute the reduced homology of a sphere.

## Scope and common pitfalls

The intersection carries gluing information and cannot generally be discarded.

## Proof idea

Use small chains for the cover and the short exact sequence comparing intersection, pieces and union.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Excision](./tp.excision.md)

## Reference reading

AT: Mayer-Vietoris.

- **AT** — Allen Hatcher. [Algebraic Topology](https://pi.math.cornell.edu/~hatcher/AT/ATpage.html). Cambridge University Press, 2002; author-hosted text.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/topology.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
