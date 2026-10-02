# Mathematics — a connected study atlas

202 concepts across 10 subjects, with one note per concept, subject study guides, scoped theorem statements and reference reading. The default graph is a compact subject overview; the complete concept atlas is a separate graph.

## Academic scope

Selected advanced-undergraduate and beginning-graduate core with advanced gateways. Entries give precise scoped statements and proof ideas, not full proofs or exhaustive courses. Definitions, constructions, axioms and theorems are labeled separately. Theorems have explicit hypotheses, examples, limitations and proof ideas. Advanced gateways are marked. This is a curated study map, not an externally peer-reviewed publication.

## Graphs

Open `mathematics.json` for orientation or `all-mathematics.json` for all concepts and cross-field prerequisites. Choose the following graph files from the workspace list for detailed study:

| Subject | Concepts | Graph file | Guide |
| --- | ---: | --- | --- |
| Complex analysis | 20 | `complex-analysis.json` | [Read](./guides/complex-analysis.md) |
| Real analysis | 21 | `real-analysis.json` | [Read](./guides/real-analysis.md) |
| Functional analysis | 20 | `functional-analysis.json` | [Read](./guides/functional-analysis.md) |
| Group theory | 20 | `group-theory.json` | [Read](./guides/group-theory.md) |
| Number theory | 20 | `number-theory.json` | [Read](./guides/number-theory.md) |
| Probability theory | 20 | `probability-theory.json` | [Read](./guides/probability-theory.md) |
| Set theory and mathematical logic | 20 | `set-theory-logic.json` | [Read](./guides/set-theory-logic.md) |
| Topology | 20 | `topology.json` | [Read](./guides/topology.md) |
| Differential geometry | 20 | `differential-geometry.json` | [Read](./guides/differential-geometry.md) |
| Algebraic geometry | 21 | `algebraic-geometry.json` | [Read](./guides/algebraic-geometry.md) |

## Edge semantics

- **prerequisite**: Selected learning prerequisite: source supplies background for target. Not a formal implication, a complete proof dependency, or a claim of necessity in every approach.
- **contains**: Navigation only: a subject points to its entry concepts; the atlas points to subjects.
- **bridge**: Navigation only: a connection between fields, not a prerequisite for an entire subject.

Each subject view has one subject hub as its entry point and displays only its local concepts and internal prerequisite edges. Node details and study notes group prerequisites into "Within this subject" and "From other subjects", with links to the relevant notes. The complete atlas retains all cross-subject prerequisite edges. Shared concepts have identical mathematical content in both views. Navigation hubs are excluded from the concept count.

## Conventions

Analysis uses real or complex scalars as stated, and functions in Lp are identified almost everywhere. Manifolds are Hausdorff, second countable and finite dimensional; boundary is included only when named. Algebraic geometry uses commutative unital rings and identity-preserving homomorphisms; varieties are reduced and irreducible unless otherwise specified. Logic uses classical first-order semantics and states its metatheoretic assumptions explicitly.

## Study and references

[Study pathways](./STUDY-PATHWAYS.md) · [Bibliography and source policy](./BIBLIOGRAPHY.md)

Each subject guide includes learning outcomes and problems. Clicking a note link opens the bundled Markdown with rendered mathematical notation; follow its prerequisite and continuation links for adjacent concepts.

## Maintenance

The source of truth is `scripts/data/mathematics/` in the Graph Studio repository. Run `npm run examples:mathematics` to regenerate, or `npm run examples:mathematics:check` to validate reproducibility without writing. The generated manifest lists every graph and note. Edit source entries rather than maintaining duplicate definitions in individual views.
