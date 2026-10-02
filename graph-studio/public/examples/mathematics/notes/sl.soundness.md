# Soundness

Set theory and mathematical logic · Theorem · Core

Stable ID: `sl.soundness`

Formal derivability implies semantic consequence for a sound proof calculus.

## Statement

For a standard classical first-order proof calculus, $T\vdash\varphi$ implies $T\models\varphi$.

## Hypotheses and conventions

Proof rules must be sound for the specified semantics, including the variable restrictions on quantifier rules.

## Example

No false conclusion can follow by these rules from premises true in a structure.

## Scope and common pitfalls

Soundness does not assert that T's nonlogical axioms are true in an intended structure.

## Proof idea

Induct on proof length, checking that each rule preserves truth under assignments.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Structures, satisfaction and elementary maps](./sl.semantics.md)

## Continue to

- [Gödel completeness theorem](./sl.completeness.md)

## Reference reading

LOGIC: soundness.

- **LOGIC** — Open Logic Project contributors. [Open Logic Text](https://builds.openlogicproject.org/open-logic-complete.pdf). Living open textbook; first-order logic, computability and set theory.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/set-theory-logic.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
