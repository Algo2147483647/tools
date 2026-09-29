# Example workspaces

Below Recent workspaces, the homepage includes three separate English workspaces. Each has its own folder under `public/examples/`, containing a standard workspace manifest, independent v2 graph documents, and Markdown notes. Opening an example from the homepage creates new in-memory files with no writable source handles. Save JSON exports your edited graph; reopening a sample starts from the original files. Unsaved-change confirmation still applies when replacing an edited document.

| Workspace | Contents |
| --- | --- |
| Mathematics | 112 concepts; complete map and eight subject views; 112 linked concept notes |
| Factorio production | 648 recipes and 328 recipe products; 13 Sankey views; source and quantity notes |
| Energy flows | 8 nodes, 9 flows; GWh values with conserved intermediate flows |

Examples also appear in Recents and restore the last graph without requesting a local folder. Refresh reloads the example's file list while preserving the currently edited document.

## Factorio data and interpretation

The source is the **2.0.65 Space Age data.raw snapshot** linked by the [official Factorio wiki](https://wiki.factorio.com/Data.raw). The factual recipe subset is checked into `scripts/data/factorio-recipes-2.0.65.json` with the original URL and SHA-256. The application never downloads external game data at runtime.

Every recipe with products is included, including hidden recycling recipes. The ten parameter placeholders and empty `recipe-unknown` placeholder are excluded. The full atlas's recipe count and product coverage are tested against that pinned subset. “All products” means all recipe outputs in this snapshot. Non-recipe events such as mining, harvesting, spoilage and rocket-launch transformations are outside its scope; raw inputs remain boundary nodes.

Every view uses **ingredient roles → recipes → product roles**. Input and output occurrences of the same material are separate nodes. This keeps alternatives, catalyst returns and recycling visible without circular Sankey links. The atlas does not automatically route one recipe's outputs into another recipe's inputs.

Values represent **one craft of each recipe** at normal quality, without productivity bonuses. Probabilistic results use expected quantities. Item amounts in the pre-runtime dump are coerced to integers, then `extra_count_fraction` is applied once. Item counts and fluid units remain distinct units in the edge labels; their combined widths are not conserved mass. The interface reports unequal totals rather than changing them.

Raw ingredient/result data, recipe duration and surface conditions are preserved in node details. Wube's [official prototype repository](https://github.com/wube/factorio-data) and [quantity documentation](https://lua-api.factorio.com/latest/types/ItemProductPrototype.html) provide further context. The latest documentation may describe a newer version than the pinned example.

## Regeneration

From the Graph Studio directory:

```sh
python scripts/generate-examples.py ../../math/content
npm test
```

The mathematics source is the neighboring `math/content/math.json` and its concept notes; the generator does not modify them. Compact English notes retain definitions and cross-links. The energy source is `public/sankey-example.json`.

To rebuild the Factorio subset, download the wiki-linked dump to `.example-source-cache/factorio-2.0.65.lua`, then run `python scripts/read-factorio-dump.py`. This parser reads Lua data tables without executing Lua code. The 20 MB cache is ignored by Git. Review the source checksum when refreshing a snapshot; changing versions requires revisiting the documented counts and tests.

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
    all-products.json
    start-here.json
    ...
    README.md
  energy/
    graph-studio.workspace.json
    energy.json
    README.md
```

Each folder can also be selected with **Open workspace**. The homepage fetches its manifest, the graph paths in `graphs`, and the relative note paths in `metadata.assets`. Requests are bounded to six at a time. Every file must load successfully before the new workspace replaces the current one. There is no separate example bundle format; individual graph documents use Graph Studio v2.
