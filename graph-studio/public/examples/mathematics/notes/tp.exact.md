# Long exact sequence of a pair

Topology · Theorem · Core

Stable ID: `tp.exact`

Relative homology connects a subspace, its ambient space and their pair.

## Statement

For $A\subseteq X$, relative chains give $\cdots\to H_n(A)\to H_n(X)\to H_n(X,A)\to H_{n-1}(A)\to\cdots$.

## Hypotheses and conventions

All groups use the same coefficients; relative chains are the quotient chain complex.

## Example

The pair consisting of a disk and its boundary computes sphere homology.

## Scope and common pitfalls

Exactness means image equals kernel, not that all maps are injective or surjective.

## Proof idea

Lift a relative cycle, take its boundary in A and check the resulting connecting map and exactness.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Singular homology](./tp.homology.md)

## Continue to

- [Excision](./tp.excision.md)
- [Poincaré duality](./tp.poincare.md)

## Reference reading

AT: relative homology.

- **AT** — Allen Hatcher. [Algebraic Topology](https://pi.math.cornell.edu/~hatcher/AT/ATpage.html). Cambridge University Press, 2002; author-hosted text.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/topology.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
