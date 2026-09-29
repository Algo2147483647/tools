# Example workspaces

Below Recent workspaces, the homepage includes three separate English workspaces. Each has its own folder under `public/examples/`, containing a standard workspace manifest, independent v2 graph documents, and Markdown notes. Opening an example from the homepage creates new in-memory files with no writable source handles. Save JSON exports your edited graph; reopening a sample starts from the original files. Unsaved-change confirmation still applies when replacing an edited document.

| Workspace | Contents |
| --- | --- |
| Mathematics | 112 concepts; complete map and eight subject views; 112 linked concept notes |
| Factorio production | Two complete upstream production plans: 1 launch-ready rocket/s, or all 12 science packs at 1 each/s; calculated rates and source notes |
| Energy flows | 8 nodes, 9 flows; GWh values with conserved intermediate flows |

Examples also appear in Recents and restore the last graph without requesting a local folder. Refresh reloads the example's file list while preserving the currently edited document.

## Factorio data and interpretation

The source is the **2.0.65 Space Age data.raw snapshot** linked by the [official Factorio wiki](https://wiki.factorio.com/Data.raw). The factual recipe subset is checked into `scripts/data/factorio-recipes-2.0.65.json` with the original URL and SHA-256. The application never downloads external game data at runtime.

The workspace contains two independent material plans. **Rocket** targets one complete launch-ready vehicle per second: 50 rocket parts/s, each using one processing unit, one low density structure and one rocket fuel. **All science packs** targets all 12 Space Age science packs simultaneously at one pack/s each. This includes orbital space science and promethium science. Payloads and launch cadence are excluded from the rocket material target.

Every item/fluid has one shared material node aggregating upstream supply and downstream demand. Start at the target sinks on the right and trace back to raw supplies. Bands keep their physical production direction. Recipe details include crafts/s, machine equivalents, effective input/output quantities, fuel and surface restrictions. Catalyst eggs and coolant retain their gross return flows, with only net consumption replenished upstream. Extra coproducts end at explicit surplus sinks.

The generator uses exact rational material balances and representative conventional production routes. It minimizes required scrap recycling, then oil refining, then active machine capacity within those routes. Scrap coproducts are credited before additional production is scheduled, and oil cracking balances refinery outputs. This is not a global optimization across all alternative recipes. Missing upstream routes fail generation rather than silently turning an intermediate into a raw resource.

Rates include batch sizes, expected probabilistic yields, and the selected machines' built-in productivity. Catalyst quantities excluded from productivity remain excluded. Working biochambers consume nutrients and captive biter spawners consume bioflux, including those fuel chains upstream. There are no modules, beacons, researched productivity bonuses or quality tiers. Probabilistic production needs buffers; seed inventory for biological/coolant cycles is not included in steady-state rates.

Raw boundaries are mining, pumping, fruit harvesting and asteroid collection. Power generation, heating, interplanetary transport, spoilage in transit and building construction are excluded. This is an aggregate cross-surface plan, not a transport layout. Machine equivalents describe fractional active capacity, not rounded installed counts. Item and fluid-unit edge labels remain distinct; combined band widths are quantities, not conserved mass. Full assumptions and generated rate tables are in the workspace's `README.md`.

## Regeneration

From the Graph Studio directory:

```sh
python scripts/generate-examples.py ../../math/content
python -B -m unittest discover -s scripts -p "test_factorio_plans.py"
npm test
```

The mathematics source is the neighboring `math/content/math.json` and its concept notes; the generator does not modify them. Compact English notes retain definitions and cross-links. The energy source is `public/sankey-example.json`.

To rebuild the Factorio subset, download the wiki-linked dump to `.example-source-cache/factorio-2.0.65.lua`, then run `python scripts/read-factorio-dump.py`. This parser reads Lua data tables without executing Lua code. The 20 MB cache is ignored by Git. Review the source checksum when refreshing a snapshot; the subset also retains machine productivity, speed, fuel and rocket-parts requirements. Changing versions requires revisiting the production assumptions and tests.

The generated files are ordinary, directly editable workspace folders:

```text
public/examples/
  mathematics/
    graph-studio.workspace.json
    mathematics.json
    algebra.json
    ...
    README.md
    notes/
      Set.md
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

Each folder can also be selected with **Open workspace**. The homepage fetches its manifest, the graph paths in `graphs`, and the relative note paths in `metadata.assets`. Requests are bounded to six at a time. Every file must load successfully before the new workspace replaces the current one. There is no separate example bundle format; individual graph documents use Graph Studio v2.
