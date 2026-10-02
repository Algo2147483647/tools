# Excision

Topology · Theorem · Core

Stable ID: `tp.excision`

Removing a suitably interior subset preserves relative homology.

## Statement

If $U\subseteq A\subseteq X$ and $\overline U\subseteq\operatorname{int}_X A$, inclusion induces $H_n(X\setminus U,A\setminus U)\cong H_n(X,A)$ for every n.

## Hypotheses and conventions

The closure-interior condition is taken in X.

## Example

Excision turns suitable local relative-homology calculations into computations in a small neighborhood.

## Scope and common pitfalls

Removing an arbitrary subset from both members of a pair need not preserve relative homology.

## Proof idea

Repeated barycentric subdivision makes chains small enough for the relevant open cover.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Long exact sequence of a pair](./tp.exact.md)

## Continue to

- [Mayer–Vietoris sequence](./tp.mayer-vietoris.md)

## Reference reading

AT: excision.

- **AT** — Allen Hatcher. [Algebraic Topology](https://pi.math.cornell.edu/~hatcher/AT/ATpage.html). Cambridge University Press, 2002; author-hosted text.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/topology.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
