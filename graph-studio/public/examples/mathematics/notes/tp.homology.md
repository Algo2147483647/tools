# Singular homology

Topology · Definition · Core

Stable ID: `tp.homology`

Homology records cycles modulo boundaries in a chain complex.

## Statement

Singular chains are finite linear combinations of maps from simplices to X. The alternating face boundary satisfies $\partial^2=0$, giving $H_n(X;R)=\ker\partial_n/\operatorname{im}\partial_{n+1}$.

## Hypotheses and conventions

Fix a coefficient ring; homology is functorial and homotopy invariant.

## Example

$H_1(S^1;\mathbb Z)\cong\mathbb Z$.

## Scope and common pitfalls

Cycles need not be boundaries; the quotient records precisely this difference.

## Selected prerequisites

**Within this subject**

- [Homotopies and homotopy equivalence](./tp.homotopy.md)

**From other subjects**

- [Normal subgroups and quotients](./gt.quotients.md) — Group theory

## Continue to

- [Long exact sequence of a pair](./tp.exact.md)
- [Cohomology and cup product](./tp.cohomology.md)
- [Gauss–Bonnet for closed surfaces](./dg.gauss-bonnet.md)

## Reference reading

AT: singular homology.

- **AT** — Allen Hatcher. [Algebraic Topology](https://pi.math.cornell.edu/~hatcher/AT/ATpage.html). Cambridge University Press, 2002; author-hosted text.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/topology.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
