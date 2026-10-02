# Plancherel theorem

Real analysis · Theorem · Core

Stable ID: `ra.fourier`

The Fourier transform preserves the L2 inner product under the stated normalization.

## Statement

With $\widehat f(\xi)=\int e^{-2\pi ix\cdot\xi}f(x)\,dx$, the Fourier transform extends uniquely from Schwartz functions to a unitary operator on $L^2(\mathbb R^n)$.

## Hypotheses and conventions

The extension is in the L2 norm; the integral formula need not converge pointwise for every L2 function.

## Example

The Gaussian is mapped to a Gaussian under this convention.

## Scope and common pitfalls

L2 inversion is not automatically pointwise inversion.

## Proof idea

Prove the inner-product identity on a dense class and extend by completion.

This is a proof strategy; details and intermediate lemmas are in the references.

## Selected prerequisites

**Within this subject**

- [Lp spaces](./ra.lp.md)
- [Dominated convergence](./ra.dct.md)

## Continue to

- [Characteristic functions](./pr.characteristic.md)

## Reference reading

RA2: Fourier analysis.

- **RA2** — Gerald B. Folland. [Real Analysis: Modern Techniques and Their Applications](https://www.wiley-vch.de/de/fachgebiete/mathematik-und-statistik/real-analysis-978-0-471-31716-6). Second edition, Wiley, 1999.

Locators identify topics or explicitly named lectures, not invented theorem numbers.

[Subject guide](../guides/real-analysis.md) · [Atlas guide](../README.md) · [Bibliography](../BIBLIOGRAPHY.md)
