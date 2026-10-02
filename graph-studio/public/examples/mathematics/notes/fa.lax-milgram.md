# Lax–Milgram theorem

Functional analysis · Theorem · Advanced gateway

Stable ID: `fa.lax-milgram`

Bounded coercive forms give unique variational solutions with a norm estimate.

## Statement

A bounded coercive sesquilinear form a on a Hilbert space yields a unique solution u to $a(u,v)=\ell(v)$ for every continuous antilinear functional $\ell$, with $\|u\|\le\|\ell\|/\alpha$.

## Hypotheses and conventions

The form is linear in its first variable and $\operatorname{Re}a(v,v)\ge\alpha\|v\|^2$ for some $\alpha>0$.

## Example

The weak Dirichlet problem for the coercive form integral of gradient products is a model application on H1_0 with an appropriate norm.

## Scope and common pitfalls

Positivity without a uniform coercivity bound is insufficient.

## Proof idea

Represent the form by a bounded operator, use coercivity for closed range and an adjoint argument for density.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Riesz representation in Hilbert space](./fa.riesz.md)

**From other subjects**

- [Sobolev spaces](./ra.sobolev.md) — Real analysis

## Continue to

- [Hodge theorem](./dg.hodge.md)

## Reference reading

FA2: coercive forms and variational methods.

- **FA2** — Haim Brezis. [Functional Analysis, Sobolev Spaces and Partial Differential Equations](https://link.springer.com/book/10.1007/978-0-387-70914-7). Springer, 2011.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/functional-analysis.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
