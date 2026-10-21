# Sources and transformations

Sky and city data retrieved 2026-10-21; Beijing rail data checked 2026-10-22. This workspace contains reference examples, with no live network requests when opened.

## All-sky constellations

[d3-celestial by Olaf Frohn](https://github.com/ofrohn/d3-celestial): `stars.6.json`, `starnames.json`, `constellations.json`, `constellations.bounds.json`, `constellations.lines.json` under `data/`. Its documentation identifies the underlying star catalogs and J2000 coordinate conventions. The upstream BSD license is included in [CELESTIAL-LICENSE](./CELESTIAL-LICENSE.txt).

Every catalog star is retained. `space` contains `[1, longitudeDegrees, declinationDegrees]`; longitude represents right ascension wrapped to −180°…180°. Types use catalog constellation identifiers where present, otherwise containment in the source constellation boundaries (including wrapped longitudes and polar regions). Serpens' two regions share one Type. Line vertices match star coordinates to four decimal places; three additional unmatched endpoints are retained explicitly without an invented magnitude. The lines are traditional visual associations, not physical connections or constellation borders.

## World cities

[Natural Earth 110m populated places](https://www.naturalearthdata.com/downloads/110m-cultural-vectors/110m-populated-places/) and the corresponding 110m country attributes from the [Natural Earth repository](https://github.com/nvkelso/natural-earth-vector/tree/master/geojson). Natural Earth publishes these data in the [public domain](https://www.naturalearthdata.com/about/terms-of-use/).

All 243 reference places are retained, with spherical `[6371, longitude, latitude]` in kilometers/degrees and no inferred altitude. Titles use local-language endonyms from Natural Earth NAME fields, supplemented for missing scripts with the city-specific names and Wikidata sources listed in `scripts/spatial-city-names.json`. Each node retains `name_native` keyed by language and the source English `name_en`. The first local name is the canvas title; multilingual alternatives remain in name_native in the details. Type uses continent attributes joined by source country or sovereignty codes; small states absent from the 110m country layer use the source timezone region. This is a visualization grouping, not a claim about administrative status. Each city connects to its two nearest same-Type cities by spherical angular distance, with duplicate undirected pairs removed. Edge metadata explicitly says `isTransportRoute: false`.

## Beijing metro / urban rail network

Checked 2026-10-22 against the [Beijing Subway interactive network map](https://map.bjsubway.com/) and its [structured station/line snapshot](https://map.bjsubway.com/subwaymap/beijing.xml?v=20260630). The source supplies line order, station names, colors and schematic positions. The reviewed extraction is committed in `scripts/beijing-metro-source.json`; `python scripts/build-beijing-metro.py` regenerates this canvas offline. Attribution is retained; the operator does not declare an open-data license in this feed.

Coverage is all 28 through-service routes shown in that map: Lines 1/Batong, 2, 3, 4/Daxing, 5–19, S1, Changping, Fangshan, Yanfang, Yizhuang, Capital Airport, Daxing Airport, Xijiao and Yizhuang T1. Counting Line 1 and Batong separately, and Line 4 and Daxing separately, yields 30 named lines. This covers urban rail, including the two trams and airport services; national rail and suburban railway services are outside this map's scope.

The graph contains 423 unique station-name nodes, 515 rail segments and 106 interchange nodes. Its line memberships total 540, with 128 possible line-pair transfers represented by shared station memberships rather than artificial transfer edges. These counts are not interchangeable with official infrastructure totals. Type filtering uses node `lines` and edge `metadata.line`, so a selected line retains every interchange without including another service's parallel edge. Line colors come from the operator's `lc` values.

### Geographic station coordinates

Coordinates are from [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/), retrieved through the [OSM API](https://wiki.openstreetmap.org/wiki/API_v0.6) on 2026-10-22. The attributed extracted coordinate table is committed as `scripts/beijing-metro-coordinates.json`. Every row retains the source object URL, ID, version, timestamp, source name and coordinate method. The generated graph also retains each point's source URL and method.

The source objects were located through the [Beijing subway network relation](https://www.openstreetmap.org/relation/13495290), its route members, [Line 12](https://www.openstreetmap.org/relation/18444658) and [Line 18](https://www.openstreetmap.org/relation/20010805). A mapped station node is preferred where route data include one; otherwise a named rail-stop point inside that station is retained. When several source nodes represent one interchange, one existing source point is selected deterministically, with no averaging, rounding, jitter or visual offset. Airport terminal names are normalized from the source's prefixed names. [Zhufangbei](https://www.openstreetmap.org/way/1431968152) is represented as a station footprint; its polygon centroid is the representative station point, explicitly identified as such.

`space` is exactly `[longitude, latitude]` in **WGS84 / EPSG:4326**, with the source numeric precision retained. The 2D Cartesian chart is a plate carrée longitude/latitude plot: both axes are angular degrees, not metric distances. All stations, including distant suburban termini, use the same affine mapping. No schematic coordinates from the operator map are used for positioning. GCJ-02 and BD-09 coordinates are not mixed into this WGS84 dataset. Public mapped coordinates have not been independently surveyed; preserving decimal precision does not certify physical accuracy or establish separate platform positions.

Line edges connect consecutive passenger stops with straight segments; they are not surveyed track geometry. A shared node represents an interchange. Muxidi, Dazhongsi, Bagou and Rongchang Dongjie are marked as out-of-station transfers. Fare boundaries, walking routes and timings are not modeled. Labels can be suppressed to avoid overlap, while actual point coordinates remain unchanged. The flat-map camera fits the actual point and label extent instead of fitting the empty margins reserved for 3D orbit views.

Two services sharing consecutive stations retain separate bidirectional service edges. Where necessary, their storage orientations are opposite to satisfy the v3 unique-ordered-pair rule; both retain `direction: "both"`. In the full view, an alternating color overlay keeps both services visible; after line filtering the remaining service is solid.

Only Lines 2 and 10 are closed rings. The feed's erroneous `loop=true` on Line 11 is deliberately overridden. Most links are bidirectional and stored once. Capital Airport service is explicitly Beixinqiao ↔ Dongzhimen ↔ Sanyuanqiao, then Sanyuanqiao → Terminal 3 → Terminal 2 → Sanyuanqiao; the three terminal-loop edges retain and display their direction.

Service checks and exclusions:

- [The 2025-12-27 openings](https://www.beijing.gov.cn/fuwu/bmfw/sy/jrts/202512/t20251228_4370895.html) establish Line 18, through operation of Line 17, and the Line 6 extension to Luyang.
- [The Line 17 operator page](https://xcx-www.mtr.bj.cn/service/line/line-17.html) records Wangjingxi opening on 2026-01-31 and Guangqumenwai remaining unopened on Line 17. Its Line 7 station is retained.
- [Tongyunmen opened on 2026-06-30](https://www.beijing.gov.cn/fuwu/bmfw/sy/jrts/202606/t20260630_4738884.html), and is included on Line 6.
- [Bajiao Amusement Park closure notice](https://bjsubway.com/news/qyxw/yyzd/2025-05-26/129660.html): closed from 2025-06-02, planned reopening 2027-05-03. The graph connects Gucheng to Babaoshan as consecutive passenger stops. The omitted stop and dates remain in `metadata.excludedStops`.
- Line 14 Taoranqiao and Gaojiayuan are not passenger stops in the current network; Line 12 Gaojiayuan is included. [The Yizhuang T1 description](https://www.beijing.gov.cn/renwen/rwzyd/qxdw/lsychmqdd/jkqT1x/202309/t20230927_3268022.html) distinguishes its 14 open stops from the deferred Laoguanli stop.
- The source flag `iu=false` is not uniformly a station closure: Muxidi and Dazhongsi remain open, with the in-station transfer unavailable. They are retained and their transfers marked outside the paid area. See [Muxidi's transfer arrangement](https://www.beijing.gov.cn/fuwu/bmfw/sy/jrts/202301/t20230101_2889315.html) and current [Line 12 Dazhongsi station information](https://www.bjsubway.com/station/xltcx/line12/2024-12-11/624.html).

This is a dated offline snapshot. Planned extensions and unopened station-line combinations are excluded; same-day disruptions and temporary entrance restrictions are not modeled. Rechecking the operator map and reviewed exceptions is required before advancing the snapshot date.

## Dimension examples

The 0D/1D/polar/cylindrical/4D/5D examples are synthetic mathematical constructions generated by `scripts/build-spatial-examples.py`.
