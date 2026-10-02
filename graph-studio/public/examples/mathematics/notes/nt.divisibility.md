# Euclidean algorithm and unique factorization

Number theory · Theorem · Core

Stable ID: `nt.divisibility`

The Euclidean algorithm underlies Bezout identities and unique integer factorization.

## Statement

Every integer greater than one factors uniquely into primes up to order. For integers a,b not both zero, their positive gcd is $ua+vb$ for some integers u,v.

## Hypotheses and conventions

Factorization is in the ordinary integers.

## Example

$\gcd(30,18)=6=2\cdot18-30$.

## Scope and common pitfalls

Unique factorization of elements may fail in rings of algebraic integers.

## Proof idea

The Euclidean algorithm gives Bezout's identity; Euclid's lemma then proves uniqueness by induction.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**From other subjects**

- [Sets, functions and relations](./sl.sets.md) — Set theory and mathematical logic

## Continue to

- [Chinese remainder theorem](./nt.crt.md)
- [Finite fields](./nt.finite-fields.md)
- [p-adic numbers and Hensel lifting](./nt.padic.md)
- [Riemann zeta function](./nt.zeta.md)

## Reference reading

NT: unique factorization.

- **NT** — J. S. Milne. [Algebraic Number Theory](https://www.jmilne.org/math/CourseNotes/ANT.pdf). Version 3.08, 2020.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/number-theory.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
