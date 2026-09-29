# Factorio production

A recipe reference for Factorio **2.0.65 with Space Age**, pinned to the official wiki's data.raw snapshot. It includes **648 production and recycling recipes** and **328 distinct recipe products**. All recipe products in that snapshot are included; ten parameter placeholders and the empty recipe-unknown placeholder are excluded.

## Explore

Start here follows iron and copper ore through smelting, copper cable and electronic circuits. Choose All products for the connected network of every recipe, or a focused manufacturing view in Explorer. Topic views recursively include representative upstream recipes, stopping at external resources. They use production before recycling, prefer the material's named recipe, then non-catalytic recipes with fewer surface constraints and ingredients. Unpacking a barrel is not treated as a source of its own fluid. Other alternatives remain available in All products. Double-click a recipe for its original ingredients, results, crafting time and surface conditions. Item names are readable forms of the official prototype identifiers.

## Read the flows

Each item or fluid has one shared material node connecting **all producing and consuming recipes in the view**. Follow a material across as many production stages as its dependencies require. Recycling outputs and catalyst returns use return bands below the chart; additional cycles are routed there automatically. Arrows and Return flow labels retain the original direction. No relationship is dropped or duplicated to flatten the diagram.

The complete network includes every recipe alternative at once, so it is large. Use topic views for readable chains. Their focusRecipes, upstreamRecipeCount and externalInputs metadata explain their scope. Raw mined resources, harvested inputs, collected asteroid chunks and spoilage can enter from outside the recipe model; no mining or harvesting recipe is invented. Catalyst cycles require an initial supply that is not calculated here.

Band values are the quantities for **one craft of each recipe**, at normal quality with no productivity bonus. Probabilistic outputs show expected amounts. Recycling fractions are counted once after integer coercion of the item amount. These are recipe quantities, not a balanced factory plan or rates per second.

Item counts and fluid units have different units; combined band widths must not be read as conserved mass or energy. Recipe nodes commonly have unequal incoming and outgoing totals. Surface constraints, temperatures and catalyst quantities remain available in the recipe details. Machine speed, quality, productivity, power and transport are outside this model.

Raw resources are boundary inputs. Non-recipe events such as mining, harvesting, spoiling and rocket launch transformations are outside the recipe atlas. All products means all recipe outputs in this version, not every possible entity or inventory item. Mods and later versions may differ.

## Sources

- [Official Factorio wiki: data.raw](https://wiki.factorio.com/Data.raw)
- [Wiki-linked 2.0.65 Space Age snapshot](https://gist.githubusercontent.com/Bilka2/6b8a6a9e4a4ec779573ad703d03c1ae7/raw)
- [Wube's official prototype repository](https://github.com/wube/factorio-data)
- [Official product quantity documentation](https://lua-api.factorio.com/latest/types/ItemProductPrototype.html)

Source SHA-256: `4b52c795d4895896730344436ea39044866ae40a106b56e57e2f8989332c33d1`.

This community example uses factual recipe quantities. Factorio is a game by Wube Software; this workspace is not an official Wube product.
