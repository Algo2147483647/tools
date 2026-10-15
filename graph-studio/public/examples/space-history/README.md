# History of Technology

This workspace currently contains the World space history timeline.

Explore **298 nodes** and **408 relationships** together in **one complete timeline**, spanning eight themes. The historical snapshot ends on **2025-12-31**.

**space-history.json** opens with the entire corpus. Use **Type**, **Track** and **Time range** to focus within this one graph, then **Show all events** to restore the full history. To inspect Apollo 11, select the crewed lunar theme and July 16–24, 1969; Eagle and Columbia retain their parallel activity and later docking.

## Read the timeline

- A dot is a dated milestone; a thick bar is one named continuous interval. Each remains a graph node.
- Time spacing is proportional. Zoom into dense periods to read individual events, or filter by theme and date.
- Thematic tracks are editorial lanes, not spacecraft or national ownership. Agency and country context appears in the node details. Apollo 11 has explicit vehicle tracks.
- Thin lines carry their own relationship labels. Chronology is not causality; two adjacent dates need not represent a technical dependency.
- Date-only values have day precision. Apollo 11 carries finer UTC timestamps.
- No open-ended bar claims a historical mission is still operating; active spacecraft are represented by completed phases and past milestones.

## Theme guide

- [Early spaceflight](./notes/early-spaceflight.md) — Satellites, human orbital flight, spacewalks and rendezvous.
- [Crewed lunar exploration](./notes/crewed-lunar.md) — Apollo flight histories and the parallel Eagle / Columbia branches of Apollo 11.
- [Space stations](./notes/space-stations.md) — Orbital laboratories, visiting crews and international assembly.
- [Robotic Moon](./notes/robotic-moon.md) — Impactors, orbiters, landers, rovers and sample-return missions.
- [Mars exploration](./notes/mars.md) — Cruises, orbital insertion, landings and surface exploration across agencies.
- [Deep space](./notes/deep-space.md) — Gravity assists, outer planets, comet rendezvous and asteroid samples.
- [Launch and commercial space](./notes/launch-commercial.md) — Launch demonstrations, reusable spacecraft and commercial transport.
- [Observatories and solar science](./notes/observatories.md) — Space telescopes, solar exploration and completed science phases.

[Sources and date conventions](./SOURCES.md)

## Reproducible corpus

The source catalog is **scripts/data/space-history/catalog.mjs**. Rebuild with **node scripts/build-space-history.mjs**, or verify committed outputs without writing with **node scripts/build-space-history.mjs --check**. The build is offline and deterministic; live websites are reference material, not runtime dependencies. Every event and relationship is emitted once in the single timeline graph.
