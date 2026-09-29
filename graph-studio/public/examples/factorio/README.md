# Factorio production targets

Two independent, demand-driven Space Age 2.0.65 plans replace the old recipe atlas.

## Targets

- **Rocket:** 1 complete launch-ready vehicle per second (60 per minute). A vehicle needs 50 rocket parts: the plan therefore supplies 50 parts/s, requiring 50 processing units/s, 50 low density structures/s and 50 rocket fuel/s before tracing their inputs further upstream. This is not the rocket ammunition item. Payloads and launch animation cadence are outside this material target.
- **All science packs:** all 12 types simultaneously, each at 1 pack/s (60 per minute): automation, logistic, military, chemical, production, utility, space, metallurgic, electromagnetic, agricultural, cryogenic and promethium. Space science uses the Space Age orbital recipe, not a satellite launch.

Read from the target sinks on the right back towards raw resources. Every band is a per-second rate, not a per-craft quantity. Shared intermediates aggregate all downstream demand. Recipe details give crafts/s, input/output coefficients, fuel consumption and continuous machine equivalents. The two diagrams are separate factories; their demands are not added together.

## Calculation basis

Rates are solved with exact rational arithmetic and nonnegative material balances. Within the selected conventional routes, the calculation first minimizes required scrap recycling, then oil refining, then continuous machine equivalents. This avoids overproducing coproducts just to save machines; it is not a search over every possible alternative recipe or a claim of globally optimal resource use. Oil refining includes heavy/light cracking. Scrap coproducts are credited against other consumers before additional production is scheduled. Unused coproducts have explicit surplus sinks: they must be stored or disposed of, not silently consumed. All shared materials balance supply against production use, target output and surplus.

Use normal-quality machines and ingredients, without modules, beacons or researched productivity. Conventional assembling machines, electric furnaces and chemical plants are preferred where their recipe categories allow them. Required foundries, electromagnetic plants and biochambers include their built-in 50% productivity. Catalyst quantities marked ignored_by_productivity do not receive bonus output. Nutrient fuel for working biochambers and bioflux food for captive biter spawners are included using the pinned machine/fuel prototypes.

Returns retain gross flows: pentapod eggs circulate while their net growth supplies agricultural science; warm fluoroketone returns to cooling, and only net coolant loss is synthesized. These steady-state cycles need initial seed eggs, nutrients and coolant inventory, which are not amortized into per-second rates. Probabilistic crushing and recycling outputs use expected long-run yields, so practical production needs buffers. Fresh products are assumed to arrive without spoilage loss.

Raw supply starts at extracted ore, pumped fluids, harvested fruit or collected asteroid chunks. Mine/collector capacity, power generation, heating, transport between surfaces, buildings and launch scheduling are outside the material model. Surface restrictions remain in recipe details; this is an aggregate cross-surface material plan, not a transport layout. Machine equivalents are fractional active capacity, not rounded installed machine counts.

Items and fluid units retain their respective units on edges. Their combined width is a quantity visualization, not conserved mass; recipe nodes can have different incoming and outgoing totals because recipes transform units.

## Sources

- [Official Factorio wiki: rocket silo](https://wiki.factorio.com/Rocket_silo)
- [Official Factorio wiki: science packs](https://wiki.factorio.com/Science_pack)
- [Official Factorio wiki: data.raw](https://wiki.factorio.com/Data.raw)
- [Pinned 2.0.65 Space Age data.raw snapshot](https://gist.githubusercontent.com/Bilka2/6b8a6a9e4a4ec779573ad703d03c1ae7/raw)

All recipe, machine, fuel and rocket-parts quantities come from the pinned snapshot. Its SHA-256 is `4b52c795d4895896730344436ea39044866ae40a106b56e57e2f8989332c33d1`. This community example is not an official Wube product.

## Rocket · 1 launch-ready vehicle / s

### Raw supply per second

| Resource | Rate / s |
| --- | ---: |
| Crude oil | 8760.6838 |
| Water | 6982.906 |
| Coal | 225 |
| Copper ore | 3000 |
| Iron ore | 1705 |

### Production rates

| Process | Crafts / s | Machine | Active equivalents |
| --- | ---: | --- | ---: |
| Advanced circuit | 100 | Assembling machine 3 | 480 |
| Advanced oil processing | 87.606838 | Oil refinery | 438.03419 |
| Copper cable | 2000 | Assembling machine 3 | 800 |
| Copper plate | 3000 | Electric furnace | 4800 |
| Electronic circuit | 1200 | Assembling machine 3 | 480 |
| Heavy oil cracking | 54.754274 | Chemical plant | 109.50855 |
| Iron plate | 1705 | Electric furnace | 2728 |
| Light oil cracking | 2.8311966 | Chemical plant | 5.6623932 |
| Low density structure | 50 | Assembling machine 3 | 600 |
| Plastic bar | 225 | Chemical plant | 225 |
| Processing unit | 50 | Assembling machine 3 | 400 |
| Rocket fuel | 50 | Assembling machine 3 | 600 |
| Rocket part | 50 | Rocket silo | 150 |
| Solid fuel from light oil | 500 | Chemical plant | 500 |
| Steel plate | 100 | Electric furnace | 800 |
| Sulfur | 12.5 | Chemical plant | 12.5 |
| Sulfuric acid | 5 | Chemical plant | 5 |

## All 12 science packs · 1 of each / s

### Raw supply per second

| Resource | Rate / s |
| --- | ---: |
| Ammoniacal solution | 15.333333 |
| Crude oil | 79.306616 |
| Fluorine | 3.3333333 |
| Lithium brine | 12 |
| Water | 187.34645 |
| Calcite | 0.18962963 |
| Carbonic asteroid chunk | 0.18488889 |
| Coal | 6.4112593 |
| Copper ore | 24.343407 |
| Iron ore | 49.895481 |
| Jellynut | 0.96798215 |
| Promethium asteroid chunk | 2.5 |
| Scrap | 119.37778 |
| Stone | 18.895852 |
| Tungsten ore | 7.6888889 |
| Yumako | 2.6421776 |

### Production rates

| Process | Crafts / s | Machine | Active equivalents |
| --- | ---: | --- | ---: |
| Accumulator | 0.66666667 | Assembling machine 3 | 5.3333333 |
| Advanced circuit | 1.252 | Assembling machine 3 | 6.0096 |
| Advanced oil processing | 0.79306616 | Oil refinery | 3.9653308 |
| Agricultural science pack | 0.66666667 | Biochamber | 1.3333333 |
| Ammoniacal solution separation | 0.30666667 | Chemical plant | 0.30666667 |
| Automation science pack | 1 | Assembling machine 3 | 4 |
| Bioflux | 0.32266072 | Biochamber | 0.96798215 |
| Biter egg | 0.2 | Captive biter spawner | 2 |
| Carbon fiber | 0.044444444 | Biochamber | 0.11111111 |
| Carbonic asteroid crushing | 0.23111111 | Crusher | 0.46222222 |
| Chemical science pack | 0.5 | Assembling machine 3 | 9.6 |
| Copper cable | 13.636 | Assembling machine 3 | 5.4544 |
| Copper plate | 15.454519 | Electric furnace | 24.72723 |
| Cryogenic science pack | 1 | Cryogenic plant | 10 |
| Electric engine unit | 0.33333333 | Assembling machine 3 | 2.6666667 |
| Electric furnace | 0.33333333 | Assembling machine 3 | 1.3333333 |
| Electrolyte | 1.4074074 | Electromagnetic plant | 3.5185185 |
| Electromagnetic science pack | 0.66666667 | Electromagnetic plant | 3.3333333 |
| Electronic circuit | 8.6151111 | Assembling machine 3 | 3.4460444 |
| Engine unit | 1.3333333 | Assembling machine 3 | 10.666667 |
| Firearm magazine | 0.5 | Assembling machine 3 | 0.4 |
| Fluoroketone | 0.066666667 | Cryogenic plant | 0.33333333 |
| Fluoroketone cooling | 0.66666667 | Cryogenic plant | 1.6666667 |
| Flying robot frame | 0.33333333 | Assembling machine 3 | 5.3333333 |
| Grenade | 0.5 | Assembling machine 3 | 3.2 |
| Heavy oil cracking | 0.018814498 | Chemical plant | 0.037628997 |
| Holmium plate | 1.4474074 | Assembling machine 3 | 1.1579259 |
| Holmium solution | 0.59688889 | Chemical plant | 5.9688889 |
| Inserter | 1 | Assembling machine 3 | 0.4 |
| Iron plate | 49.302889 | Electric furnace | 78.884622 |
| Iron stick | 2.5 | Assembling machine 3 | 1 |
| Jellynut processing | 0.96798215 | Assembling machine 3 | 0.77438572 |
| Light oil cracking | 1.1553273 | Chemical plant | 2.3106546 |
| Lithium | 0.24 | Chemical plant | 4.8 |
| Lithium plate | 1.1333333 | Electric furnace | 3.6266667 |
| Logistic science pack | 1 | Assembling machine 3 | 4.8 |
| Lubricant | 0.5 | Chemical plant | 0.5 |
| Metallurgic science pack | 0.66666667 | Foundry | 1.6666667 |
| Military science pack | 0.5 | Assembling machine 3 | 4 |
| Molten copper | 0.17777778 | Foundry | 1.4222222 |
| Molten iron | 0.011851852 | Foundry | 0.094814815 |
| Nutrients from bioflux | 0.24719286 | Biochamber | 0.24719286 |
| Pentapod egg | 0.44444444 | Biochamber | 3.3333333 |
| Piercing rounds magazine | 0.25 | Assembling machine 3 | 1.2 |
| Pipe | 2.6666667 | Assembling machine 3 | 1.0666667 |
| Plastic bar | 1.4112593 | Chemical plant | 1.4112593 |
| Production science pack | 0.33333333 | Assembling machine 3 | 5.6 |
| Productivity module | 0.33333333 | Assembling machine 3 | 4 |
| Promethium science pack | 0.1 | Cryogenic plant | 0.25 |
| Quantum processor | 0.066666667 | Electromagnetic plant | 1 |
| Rail | 5 | Assembling machine 3 | 2 |
| Scrap recycling | 119.37778 | Recycler | 47.751111 |
| Space science pack | 0.2 | Assembling machine 3 | 2.4 |
| Steel plate | 5.4748889 | Electric furnace | 43.799111 |
| Stone brick | 8.3333333 | Electric furnace | 13.333333 |
| Stone wall | 1 | Assembling machine 3 | 0.4 |
| Sulfur | 1.2833333 | Chemical plant | 1.2833333 |
| Sulfuric acid | 0.41333333 | Chemical plant | 0.41333333 |
| Supercapacitor | 0.44444444 | Electromagnetic plant | 2.2222222 |
| Superconductor | 0.31851852 | Electromagnetic plant | 0.7962963 |
| Transport belt | 0.5 | Assembling machine 3 | 0.2 |
| Tungsten carbide | 2.0666667 | Assembling machine 3 | 1.6533333 |
| Tungsten plate | 0.88888889 | Foundry | 2.2222222 |
| Utility science pack | 0.33333333 | Assembling machine 3 | 5.6 |
| Yumako processing | 2.6421776 | Assembling machine 3 | 2.1137421 |
