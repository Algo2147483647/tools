# p-adic numbers and Hensel lifting

Number theory · Theorem · Core

Stable ID: `nt.padic`

Prime-adic completion supports lifting simple polynomial roots to exact roots.

## Statement

Complete $\mathbb Q$ for $|x|_p=p^{-v_p(x)}$ to obtain $\mathbb Q_p$. If $f\in\mathbb Z_p[x]$, $f(a)\equiv0\pmod p$ and $f'(a)\not\equiv0\pmod p$, f has a unique root congruent to a modulo p in $\mathbb Z_p$.

## Hypotheses and conventions

This is the simple-root form of Hensel's lemma.

## Example

$x^2-2$ has a root in $\mathbb Z_7$ lifting 3 modulo 7.

## Scope and common pitfalls

A multiple root modulo p need not lift by this criterion.

## Proof idea

Newton iteration improves the p-adic error and converges by completeness.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Euclidean algorithm and unique factorization](./nt.divisibility.md)

**From other subjects**

- [Metric limits and completeness](./ra.metric.md) — Real analysis

## Continue to

- [Local–global principles and limits](./nt.local-global.md)

## Reference reading

NT: completions and Hensel lemma.

- **NT** — J. S. Milne. [Algebraic Number Theory](https://www.jmilne.org/math/CourseNotes/ANT.pdf). Version 3.08, 2020.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/number-theory.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
