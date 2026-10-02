# Example workspaces

Below Recent workspaces, the homepage includes four separate English workspaces. Each has its own folder under `public/examples/`, containing a standard workspace manifest, independent v3 graph documents, and Markdown notes. Opening an example from the homepage creates new in-memory files with no writable source handles. Save JSON exports your edited graph; reopening a sample starts from the original files. Unsaved-change confirmation still applies when replacing an edited document.

| Workspace           | Contents                                                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Commerce operations | 32 services and operations, 45 relationships, 14 nested groups; overview, order fulfillment and return journeys, plus operating notes |
| Mathematics         | 202 concepts; subject overview, complete atlas, ten subject views; 202 linked concept notes, ten study guides and bibliography          |
| Factorio production | Two complete upstream production plans: 1 launch-ready rocket/s, or all 12 science packs at 1 each/s; calculated rates and source notes |
| Energy flows        | 8 nodes, 9 flows; GWh values with conserved intermediate flows                                                                          |

Examples also appear in Recents and restore the last graph without requesting a local folder. Refresh reloads the example's file list while preserving the currently edited document.

The [Commerce operations guide](compound.md) covers the nested node-link example. Regenerate its graphs with `npm run examples:commerce`; its reproducibility check runs in `npm run check`.

## Factorio data and interpretation

The source is the **2.0.65 Space Age data.raw snapshot** linked by the [official Factorio wiki](https://wiki.factorio.com/Data.raw). The generated graphs retain recipe quantities and source metadata. The application never downloads external game data at runtime.

The workspace contains two independent material plans. **Rocket** targets one complete launch-ready vehicle per second: 50 rocket parts/s, each using one processing unit, one low density structure and one rocket fuel. **All science packs** targets all 12 Space Age science packs simultaneously at one pack/s each. This includes orbital space science and promethium science. Payloads and launch cadence are excluded from the rocket material target.

Every item/fluid has one shared material node aggregating upstream supply and downstream demand. Start at the target sinks on the right and trace back to raw supplies. Bands keep their physical production direction. Recipe details include crafts/s, machine equivalents, effective input/output quantities, fuel and surface restrictions. Catalyst eggs and coolant retain their gross return flows, with only net consumption replenished upstream. Extra coproducts end at explicit surplus sinks.

The material plans use representative conventional production routes. Scrap coproducts are credited before additional production is scheduled, and oil cracking balances refinery outputs. This is not a global optimization across all alternative recipes. The example tests check material balances and trace every process and target to raw supply.

Rates include batch sizes, expected probabilistic yields, and the selected machines' built-in productivity. Catalyst quantities excluded from productivity remain excluded. Working biochambers consume nutrients and captive biter spawners consume bioflux, including those fuel chains upstream. There are no modules, beacons, researched productivity bonuses or quality tiers. Probabilistic production needs buffers; seed inventory for biological/coolant cycles is not included in steady-state rates.

Raw boundaries are mining, pumping, fruit harvesting and asteroid collection. Power generation, heating, interplanetary transport, spoilage in transit and building construction are excluded. This is an aggregate cross-surface plan, not a transport layout. Machine equivalents describe fractional active capacity, not rounded installed counts. Item and fluid-unit edge labels remain distinct; combined band widths are quantities, not conserved mass. Full assumptions and generated rate tables are in the workspace's `README.md`.

## Mathematics content and regeneration

The English corpus covers complex analysis, real analysis, functional analysis, group theory, number theory, probability, set theory and mathematical logic, topology, differential geometry, and algebraic geometry. Each concept has a kind, level, precise statement, hypotheses, example, limitation, selected prerequisites and reference reading. Formula-heavy concepts use a separate plain-English `define` caption so the canvas stays readable; `statement` and the study note retain the full mathematics. Theorem entries include proof ideas. Subject guides add assumed background, learning outcomes, reading routes and problems.

`mathematics.json` opens an 11-node overview. `all-mathematics.json` includes all 202 concepts and 11 navigation nodes, preserving cross-subject prerequisite edges. Each subject graph has one subject hub as its entry point and contains only local concepts and internal prerequisite edges. Node details and study notes group internal and external prerequisites separately, with links to their notes. A `prerequisite` edge is selected study background, not formal implication or an exhaustive proof dependency. `contains` and `bridge` edges are navigation. All views and Markdown notes derive from one corpus, so shared concepts stay consistent.

The scope is selected advanced undergraduate and beginning graduate mathematics, with explicitly marked advanced gateways. It is a study atlas with references, not a complete textbook or externally peer-reviewed publication. Primary references include MIT course materials, author-hosted texts, the Open Logic Project and the Stacks Project. The bundled bibliography gives editions and links.

From the Graph Studio directory:

```sh
npm run examples:mathematics
npm run check
```

Edit the subject modules, curriculum and references in `scripts/data/mathematics/`, then regenerate with `scripts/build-mathematics.mjs`. No neighboring repository or external content download is required. The builder validates IDs, dependencies, acyclicity, bibliography fields, local links and KaTeX expressions before writing. It refuses to silently delete unrecognized files. `npm run examples:mathematics:check` verifies byte-for-byte reproducibility without writing; this check is included in `npm run check`.

Factorio and energy are maintained as checked-in workspace files. Their loader, serialization, balance and layout checks run with `npm test`. Changing Factorio versions requires revisiting the documented production assumptions and these tests.

The generated files are ordinary, directly editable workspace folders:

```text
public/examples/
  mathematics/
    graph-studio.workspace.json
    mathematics.json
    all-mathematics.json
    complex-analysis.json
    algebraic-geometry.json
    ...
    README.md
    BIBLIOGRAPHY.md
    STUDY-PATHWAYS.md
    guides/
      complex-analysis.md
      ...
    notes/
      sl.sets.md
      ...
  factorio/
    graph-studio.workspace.json
    rocket-1-per-second.json
    science-1-per-second.json
    README.md
  energy/
    graph-studio.workspace.json
    energy.json
    README.md
```

Each folder can also be selected with **Open workspace**. The homepage fetches its manifest, the graph paths in `graphs`, and the relative note paths in `metadata.assets`. Requests are bounded to six at a time. Every file must load successfully before the new workspace replaces the current one. There is no separate example bundle format; individual graph documents use Graph Studio v3.
