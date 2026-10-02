# Downward Löwenheim–Skolem theorem

Set theory and mathematical logic · Theorem · Core

Stable ID: `sl.lowenheim-skolem`

Infinite structures have small elementary substructures containing specified parameters.

## Statement

For an infinite structure M in language L and $A\subseteq M$, there is an elementary substructure containing A of cardinality at most $\max(|A|,|L|,\aleph_0)$.

## Hypotheses and conventions

The theorem is stated in ordinary ZFC metatheory.

## Example

A countable-language theory with an infinite model has a countable model.

## Scope and common pitfalls

An externally countable model may internally regard some of its sets as uncountable; its internal bijections are restricted.

## Proof idea

Close the parameter set under chosen witnesses for existential formulas and apply the Tarski–Vaught criterion.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Structures, satisfaction and elementary maps](./sl.semantics.md)
- [Axiom of choice, Zorn and well-ordering](./sl.choice.md)

## Continue to

- [Types and saturation](./sl.types.md)

## Reference reading

LOGIC: Lowenheim-Skolem.

- **LOGIC** — Open Logic Project contributors. [Open Logic Text](https://builds.openlogicproject.org/open-logic-complete.pdf). Living open textbook; first-order logic, computability and set theory.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/set-theory-logic.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
