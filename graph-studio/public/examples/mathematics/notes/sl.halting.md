# Undecidability of halting

Set theory and mathematical logic · Theorem · Core

Stable ID: `sl.halting`

## Statement

No algorithm decides, for every encoded machine and input, whether that computation eventually halts.

## Hypotheses and conventions

The input describes arbitrary computations in a universal effective model.

## Example

The halting set is computably enumerable but not decidable.

## Scope and common pitfalls

Undecidability of the general problem does not prevent deciding many particular programs.

## Proof idea

A hypothetical decider yields a program that halts on its own code exactly when the decider predicts nonhalting.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Computability and enumerable theories](./sl.computability.md)

## Reference reading

LOGIC: halting problem.

- **LOGIC** — Open Logic Project contributors. [Open Logic Text](https://builds.openlogicproject.org/open-logic-complete.pdf). Living open textbook; first-order logic, computability and set theory.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/set-theory-logic.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
