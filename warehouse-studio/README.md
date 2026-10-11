# Warehouse Studio

A local inventory tool with independent warehouses, type-based classification, time-based demand planning, and immediate JSON persistence. The interface uses a pure white background, serif typography, fine-line icons, and three-rule tables. Warehouse selection, settings, and JSON export are in the top bar. The interface, reference catalog, messages, and documentation are in English.

No third-party dependencies. Requires Node.js 20+ and a modern browser.

## Start

On Windows, double-click this project's `launch.cmd`, or run from the parent tools directory:

```powershell
.\launch.cmd warehouse-studio
```

Open <http://127.0.0.1:4186>. Keep the terminal running; press Ctrl+C to stop. The launcher finds Node.js 20+ on PATH, in the existing Codex runtime, or in the standard Node installation directory.

```powershell
# Start without opening a browser
.\warehouse-studio\launch.cmd -NoBrowser
# Use a different port and data file
.\warehouse-studio\launch.cmd -Port 4187 -DataFile D:\Inventory\stock.json
# Run syntax checks and tests
.\launch.cmd warehouse-studio -BuildOnly
```

On macOS / Linux, or to start manually:

```sh
cd warehouse-studio
node server.mjs
node server.mjs --port 4187 --data ./data/personal.json
node --test tests/*.test.mjs
```

No install or build step is required. Open the HTTP URL instead of opening the HTML file directly. Relative data paths resolve against the process working directory; the Windows launcher uses the project directory.

## Plan and edit

- **Independent warehouses:** Choose a warehouse from the top-bar dropdown. Each has its own materials, stock, types, and planning interval. Use the adjacent plus button to create a warehouse and Settings to edit or delete it. At least one warehouse must remain.
- **Types:** Use the cascading `Types` dropdowns to select a primary type and then narrower subtypes. Selecting `Medical` includes all its descendants; selecting `Hygiene` narrows this to `Medical / Hygiene`. More levels appear automatically for deeper paths. `All subtypes` returns to the current parent, and changing a parent clears the lower levels. Counts include every material in that branch of the current warehouse. Search and the shortfalls filter combine with the selected branch. Each row retains its full type path; select `+ New type…` to create a path such as `Medical / Hygiene / Dental`. Existing JSON type strings work without migration. Dropdown arrows are hidden; click the text area or use the keyboard to open them.
- **Units:** Stock, supply, and demand keep separate number and unit positions across all rows: numbers align right and units align left. Choose a standard or existing unit from the Stock / Unit dropdown, or use `+ New unit…`. Changing a unit relabels stock, supply, and demand; it does not convert the numbers. Set the corresponding quantities when changing measurement scales.
- **Single-line rows:** Each material occupies one compact row, with italic type labels. Names, types, stock, units, supply and demand rules, and the combined stock balance stay on one line. Notes remain in JSON for compatibility and are not displayed in the table.
- **Undo and redo:** Use `Ctrl+Z` to undo, `Ctrl+Shift+Z` / `Ctrl+Y` to redo, or the top-bar arrow buttons. Command shortcuts also work on macOS. Continuous typing in one field is one edit; leaving and revisiting the field starts a new edit. Material and warehouse additions/deletions, settings, units, types, and planning intervals are included. Undo saves immediately to JSON using the latest server revision. History is local to the current page session, retains up to 100 edits within a memory budget, and clears when data is reloaded. Search and unsubmitted dialog text keep their native text undo.
- **Overview:** Open `Overview` immediately to the left of Types for total materials, time-based materials, items to replenish, and fully covered items. An item is time-based if either supply or demand uses a rate. Counts refer to the entire selected warehouse and update while editing.
- **Planning interval:** Enter any positive duration in the `Duration` field (for example, 45 or 2.5 days), edit the start/end times, or choose the 1/7/14/30-day shortcuts. Duration edits keep the start and calculate a new end immediately, save to JSON, and support undo. Dates and duration stay synchronized. Fractional days round to the nearest minute; intervals must be at least one minute and at most 36,600 days, within calendar years 0001–9999. The end is exclusive: October 11 at 00:00 to October 18 at 00:00 is seven days. Calculations use wall-clock time, with 24 hours per day and 168 hours per week, independent of time zone or daylight-saving transitions.
- **Fixed quantities:** Required quantity equals the entered amount. A tent with a fixed quantity of one remains one for any valid interval.
- **Time-based materials:** Choose `Rate`. Required quantity equals the entered rate multiplied by the duration in the chosen unit (hour, day, or week). For example, 4,000 ml/day requires 28,000 ml over seven days. A zero rate means the rate has not been configured.
- **Supply rule:** Plan incoming quantities with `Fixed` or `Rate`, independently of the demand rule. Fixed supply is a total for the selected interval; rate supply uses hours, days, or weeks and scales with duration. New and existing materials default to zero supply. Supply edits save immediately and support undo/redo. Hover over the supply cell for the interval total.
- **Shortfalls:** `max(required - (stock + supplied), 0)`. Each material keeps its own unit. Changing the interval calculates projected supply and demand; it does not modify current stock. This is an end-of-interval plan, without individual delivery dates or a guarantee against temporary shortages before delivery.
- **Stock balance:** The final data column shows a segmented logistics bar, the net balance, and a muted `(supply/required)` pair for the selected interval, all on one line. Bar lengths and number positions stay aligned across rows. Totals use the row's unit; hover for exact quantities and units. Dark green covers demand, red hatching marks missing stock, and pale green marks surplus; the black tick is the required quantity. The bar compares current stock plus planned supply with demand. Its signed number shows the projected shortfall or surplus; `Ready` means available quantities exactly match demand. Hover for current stock, supply, available quantity, demand, and the legend. Zero demand with zero available quantity has a neutral bar; invalid or unconfigured quantities show a dash and are not shown as covered. Each meter has a complete accessible label.
- **Immediate persistence:** Edit material names, types, units, stock, modes, and rates directly in the table. Every valid edit triggers saving immediately; while a request is in flight, subsequent edits are combined into the next complete snapshot. No Save button is needed. "Saved to JSON" appears after the server finishes writing the file.
- **Validation:** Invalid quantities and blank required fields are not saved. Leaving an invalid cell restores its previous valid value. An invalid interval pauses demand calculations until corrected.
- **Search:** Search names and types, or show only shortfalls. Overview counts always describe the entire current warehouse. An edited row that no longer matches a filter stays visible until focus leaves it.
- **Export:** Download a JSON backup of all warehouses. Normal persistence does not require exporting.

## Data and reference catalog

On first load, the server creates `data/inventory.json`. The data directory is ignored by Git. The initial catalog contains three independent warehouses:

| Warehouse | Materials |
| --- | ---: |
| Basic Supplies | 68 |
| Survival Backpack | 45 |
| Kitchen Pantry | 39 |

All initial stock is zero. Each catalog now has complete editable demand rules, using one person / one small setup as the planning unit. These are inventory assumptions, not a complete diet or a medical treatment plan. Warehouses represent separate plans; their food and water quantities are not intended to be added together.

- **Basic Supplies:** Daily water 4,000 ml, added salt 2 g, sugar 25 g, protein material 60 g, lipids 25 g, electricity 2 kWh, and example liquid fuel 0.15 L. Soap uses 5 g/day, toothpaste 2 g/day, dishwashing liquid 5 ml/day, vinegar 5 ml/day, MSG 0.5 g/day, and laundry powder 50 g/week. Equipment is fixed; underwear has three sets. Stored oxygen defaults to zero for an ordinary ambient-air setting.
- **Survival Backpack:** Daily water 4,000 ml, added salt 2 g, sugar 25 g, protein material 60 g, and edible oil 25 g; laundry powder uses 30 g/week. Other contents are fixed reserves, including one pair of shoes, two clothing sets, and complete hygiene kits. The water total covers the whole interval and may require planned resupply; it is not a carry-weight calculation. Sugar, protein, and oil entries alone do not form a complete survival food plan.
- **Kitchen Pantry:** All 39 ingredients have positive daily or weekly consumption rates. Meat and staple choices share a weekly shopping plan rather than each being assigned a full daily serving: beef/pork 150 g each per week, chicken/fish 300 g each per week, flour/noodles 350 g each per week, bread 700 g/week, and rice 1,050 g/week. Eggs use 1/day, milk 250 ml/day, potatoes 100 g/day, and cooking water 1,000 ml/day. Herbs, spices, and sauces have smaller weekly amounts. See `seed.mjs` for every individual rule.
- **Medical reserves:** Vitamins are one packaged product, not grams per day. Medicines, dressings, protective supplies, and mixed kits are fixed inventory reserves. Antibiotics and syringes default to zero until the user specifies a need. No medication dose is inferred from trip length.

The 4 L water example rounds up the [CDC emergency storage baseline of one US gallon per person per day](https://www.cdc.gov/water-emergency/about/how-to-create-and-store-an-emergency-water-supply.html), which includes drinking and sanitation; conditions and personal needs can require more. Added-salt and sugar inventory examples are informed by the [WHO healthy-diet guidance](https://www.who.int/news-room/fact-sheets/detail/healthy-diet), whose limits concern the entire diet, including other foods. Remaining amounts are editable planning estimates, not values attributed to those sources.

The seed catalog applies to new data files. Existing files are not reset when the server restarts, and manually changed inventory is preserved.

Example file structure:

```json
{
  "version": 1,
  "revision": 0,
  "updatedAt": "2026-10-11T00:00:00.000Z",
  "warehouses": [
    {
      "id": "backpack",
      "name": "Survival Backpack",
      "description": "Personal supplies",
      "period": { "start": "2026-10-11T00:00", "end": "2026-10-18T00:00" },
      "items": [
        {
          "id": "water", "name": "Water H2O", "type": "Life Supplies / Water",
          "unit": "ml", "stock": 1000,
          "mode": "rate", "amount": 4000, "rateUnit": "day",
          "supplyMode": "fixed", "supplyAmount": 0, "supplyRateUnit": "day",
          "note": ""
        }
      ]
    }
  ]
}
```

To restore a backup or edit the file manually, stop the server, replace or edit the JSON, restart the server, and reload the page. Corrupt or incompatible files are preserved and reported instead of silently reset.

Older version-1 files without the three supply fields remain valid and mean zero planned supply. The page fills their defaults in memory and includes them on the next edit; simply opening a file does not rewrite it. When supplied, all three fields are required and validated together.

Multiple pages connected to the same server use `revision` to detect conflicting edits. An older page cannot overwrite newer saved changes. On conflict, export unsaved data before reloading. Connection or write failures retain pending changes in the current page for retry; closing the page loses unsaved edits. Run only one server process per JSON file.

Writes use a temporary file in the same directory, flush it to disk, and atomically replace the destination before acknowledging success. The server listens only on `127.0.0.1` and requires no cloud account.

## Implementation and checks

- `server.mjs`: Local HTTP service, validation, atomic JSON persistence, and revision checks.
- `seed.mjs`: Initial reference catalog.
- `public/`: Interface, styling, and pure calculation helpers.
- `tests/`: Seventeen calculation, supply, duration, catalog, and stock-bar cases; five undo/redo cases; three hierarchical type-filter cases; and nine API tests covering fractional days, calendar edges, floating-point shortfalls, history grouping, restoration, parent/descendant matching, branch counts, legacy JSON compatibility, persistence across restart, warehouse isolation, concurrent revisions, invalid inputs, storage errors, and corrupt-file preservation.

`GET /api/state` reads the complete state. `PUT /api/state` submits the complete state with its current `revision`; success returns the persisted state with a new revision. Conflicts return 409, invalid data returns 400, and storage failures return 500.

