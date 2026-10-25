# Example workspaces

Below Recent workspaces, the homepage includes independent example workspaces, including Graph Studio workflow and Human History with Chinese and European history timelines. Each has its own folder under `public/examples/`, containing a standard workspace manifest, independent v3 graph documents, and Markdown notes. Opening an example from the homepage creates new in-memory files with no writable source handles. Save JSON exports your edited graph; reopening a sample starts from the original files. Unsaved-change confirmation still applies when replacing an edited document.

| Workspace             | Contents                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Graph Studio workflow | Two English nested graphs: the core application workflow and the complete Appearance loading-to-rendering pipeline                                                                    |
| Human History         | Two timelines: Chinese history (1273 nodes, 2322 relationships) and European history (598 nodes, 673 relationships), with guides and sources                                          |
| Commerce operations   | 32 services and operations, 45 relationships, 14 nested groups; overview, order fulfillment and return journeys, plus operating notes                                                 |
| Mathematics           | 202 concepts; subject overview, complete atlas, ten subject views; 202 linked concept notes, ten study guides and bibliography                                                        |
| Factorio production   | Two complete upstream production plans: 1 launch-ready rocket/s, or all 12 science packs at 1 each/s; calculated rates and source notes                                               |
| History of Technology | Three timelines: space history (298 nodes, 408 relationships), mathematics–physics (250 points, 317 relationships), and AGI research (231 points and 25 intervals, 484 relationships) |

Examples also appear in Recents and restore the last graph without requesting a local folder. Refresh reloads the example's file list while preserving the currently edited document.

The [Commerce operations guide](charts/compound.md) covers the nested node-link example. Its checked-in graphs are validated by the compound and example regression suites in `npm run check`.

## Graph Studio workflow

The [workflow guide](../public/examples/graph-studio/README.md) explains the application as a nested process graph. Open **Graph Studio workflow** from the homepage to follow document loading, transactional edits, appearance resolution, layout, SVG rendering and output. Editing and layout contain their own subgroups, including AI command validation and optional arrangement previews. Node details map each step to its implementation. Switch to **appearance-pipeline.json** for the full Appearance chain, including default composition, linked-style activation, history, geometry inputs, CSS variable conversion and SVG stylesheet layers. The [Appearance pipeline guide](../public/examples/graph-studio/appearance-pipeline.md) explains each path.

The example uses a linked appearance file with visible group borders and edge labels. Containment represents ownership; labelled relationships represent data and control flow, including feedback cycles. The complete graph and its original relationships remain available when groups are collapsed.

## European history

The European history canvas in **Human History** starts with Aegean Bronze Age evidence and reaches Bulgaria's euro adoption in January 2026. It includes parallel regional routes, political and social changes, religion, science, colonialism, wars and international institutions. The 598-node canvas uses 585 points and only 13 qualified period bars. Chronology and contextual bridges are labelled separately; cross-region joins never imply voluntary union or a single inevitable cause.

Chinese prose accompanies original-language proper names, preserving Greek, Cyrillic, Arabic-script Ottoman names and European diacritics. The names guide distinguishes normalized historical spelling, multilingual states, later historiographical terms and archaeological cultures without deciphered self-designations. Every node includes sources and precision notes; the bibliography distinguishes primary institutional sources from secondary overview articles. Contemporary entries are dated snapshots, not predictions or a live status feed.

The graph, catalogs, names guide, bibliography and six handwritten guides are checked in under `public/examples/china-history/europe/`. This checkout does not contain their original generator or input dataset. After editing these documents, run `npm run check`; the example and European history suites verify loading, local links, serialization, date semantics, distinct institutional stages and the complete timeline layout.

## History of Technology

The [Timeline guide](charts/timeline.md) explains the date-aware chart type. History of Technology contains three separate canvases, totaling 804 nodes and 1209 relationships. The original space-history canvas covers 1957–2025 with sourced launch, arrival, rendezvous, return and science milestones alongside completed flight and mission phases. Eight themes cover early spaceflight, crewed lunar exploration, space stations, robotic lunar missions, Mars, deep space, launch and commercial space, and observatories. Apollo 11's Eagle and Columbia branches and reunion remain in the space-history graph.

The default **space-history.json** opens with the complete space corpus. Use the workspace graph list to switch to **mathematics-physics/mathematics-physics.json**, which combines mathematical and physical history in one canvas. Its 250 points span approximately 1850 BCE–2024 across 11 subjects, with 104 explicit connections among its 317 edges. English prose accompanies original-language personal names and separate lookup aliases. Five period guides, event catalogs, a names guide and a source index explain the selection. No long era bars are used in the new canvas.

Use Type, Track and Time range to inspect a subject or period, and Show all events to restore the complete canvas. Chronology is not causality. The science canvas distinguishes approximate manuscript dates, lectures, publications, proposals, experiments and later verification. Its adaptive axis compresses quiet gaps; switch to a linear axis to compare elapsed durations. The space canvas retains its original completed-phase intervals and finer mission dates.

The third canvas, **agi/agi-history.json**, follows the history of AGI research through 231 point milestones, 25 duration bars, 484 distinct relationships and 13 research strands from 1666 to 2026. Its English accounts distinguish contributions, limitations, dates and sources. The overview connects eight periods; thirteen strand guides, a chronological catalog and a source index support deeper reading. The coverage includes symbolic and neural methods, cognitive architectures, probability, reinforcement learning, embodiment, foundation models, reasoning and agents, open-ended learning, institutions, evaluation and alignment. It is a systematic selection of principal lineages, not a claim to enumerate every AI publication. Research announcements retain their attributed and conditional status.

The AGI graph opens in a vertical adaptive Timeline view. Five duration bars describe documented programs or bounded development efforts, including Dartmouth, Shakey, FGCS, Deep Blue and CALO. Twenty overlapping bars describe editorial research phases across all thirteen strands. The interval guide states their evidence and boundary conventions. Filter Type by **Research phase** or **Research program** to see the longer developments. Part-of edges connect intervals to milestones at the corresponding dates; reading-order edges are editorial chronology; dependencies indicate concrete continuations or components; reference edges describe conceptual connections without asserting direct influence. The snapshot was compiled on October 21, 2026 and includes events through October 9, 2026.

Maintain the graphs and reading files directly under `public/examples/space-history/`, with their shared workspace manifest. The example, space-history, science-history and AGI-history regression suites validate loading, local links, language, chronology, connections and timeline layout as part of `npm run check`.

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
