# Example workspaces

Below Recent workspaces, the homepage includes six separate workspaces, including Chinese-language Chinese and European history timelines. Each has its own folder under `public/examples/`, containing a standard workspace manifest, independent v3 graph documents, and Markdown notes. Opening an example from the homepage creates new in-memory files with no writable source handles. Save JSON exports your edited graph; reopening a sample starts from the original files. Unsaved-change confirmation still applies when replacing an edited document.

| Workspace            | Contents                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 中国历史：分流与交汇 | 1273 events and periods, 2322 relationships; Chinese guides and sources, from early archaeological evidence to the present                       |
| 欧洲历史：分流与交汇 | 585 point events, 13 periods, 673 relationships; original-language names, Chinese explanations, six guides and source catalogs, c. 1900 BCE–2026 |
| Commerce operations  | 32 services and operations, 45 relationships, 14 nested groups; overview, order fulfillment and return journeys, plus operating notes            |
| Mathematics          | 202 concepts; subject overview, complete atlas, ten subject views; 202 linked concept notes, ten study guides and bibliography                   |
| Factorio production  | Two complete upstream production plans: 1 launch-ready rocket/s, or all 12 science packs at 1 each/s; calculated rates and source notes          |
| World space history  | One timeline containing all 298 events and completed phases and 408 relationships, with eight themes and Apollo 11's vehicle branches            |

Examples also appear in Recents and restore the last graph without requesting a local folder. Refresh reloads the example's file list while preserving the currently edited document.

The [Commerce operations guide](compound.md) covers the nested node-link example. Its checked-in graphs are validated by the compound and example regression suites in `npm run check`.

## European history

The independent `europe-history` workspace starts with Aegean Bronze Age evidence and reaches Bulgaria's euro adoption in January 2026. It includes parallel regional routes, political and social changes, religion, science, colonialism, wars and international institutions. The 598-node canvas uses 585 points and only 13 qualified period bars. Chronology and contextual bridges are labelled separately; cross-region joins never imply voluntary union or a single inevitable cause.

Chinese prose accompanies original-language proper names, preserving Greek, Cyrillic, Arabic-script Ottoman names and European diacritics. The names guide distinguishes normalized historical spelling, multilingual states, later historiographical terms and archaeological cultures without deciphered self-designations. Every node includes sources and precision notes; the bibliography distinguishes primary institutional sources from secondary overview articles. Contemporary entries are dated snapshots, not predictions or a live status feed.

Edit `scripts/data/europe-history/`, run `npm run examples:europe-history`, and verify with `npm run examples:europe-history:check`. Six handwritten guides under `public/examples/europe-history/notes/` are preserved by generation; catalogs, names, bibliography and graph files are generated. The example and European history suites verify loading, local links, serialization, date semantics, distinct institutional stages and the complete timeline layout.

## World space history

The [Timeline guide](timeline.md) explains the date-aware chart type. The space history workspace covers 1957–2025 with sourced launch, arrival, rendezvous, return and science milestones alongside completed flight and mission phases. Eight themes cover early spaceflight, crewed lunar exploration, space stations, robotic lunar missions, Mars, deep space, launch and commercial space, and observatories. Apollo 11's Eagle and Columbia branches and reunion are included in the same graph.

The single **space-history.json** opens directly with every node and relationship. Use Type, Track and Time range to inspect a theme or period, and Show all events to restore the entire history. Edges explicitly distinguish within-mission chronology, interval membership, documented rendezvous and contextual references. Chronology does not assert technical causation. The corpus is a historical snapshot through 2025, not a live mission-status feed. Intervals describe named, completed phases; spacecraft that continued operating are not given invented mission-end dates.

Edit the workspace files under `public/examples/space-history/`. The example and space-history regression suites validate the corpus when running `npm run check`. Source links, precision conventions and scope are recorded in the example's README and node details.

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
npm run check
```

Edit the checked-in workspace files under `public/examples/mathematics/`. Run `npm run check` to validate manifests, v3 documents, references, subject coverage and layout behavior. The earlier generator scripts are no longer part of this repository; the check command validates the maintained example files directly.
