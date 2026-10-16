# History of Technology

This workspace contains two independent canvases:

- [World space history](./space-history.json) — 298 events and completed mission phases, 408 relationships, 1957–2025.
- [History of Mathematics and Physics](./mathematics-physics/mathematics-physics.json) — one combined mathematics–physics canvas with 250 point events and 317 relationships, c. 1850 BCE–2024. [Reading guide, names and sources](./mathematics-physics/README.md).

Select a canvas from the workspace graph list. Mathematics and physics share the new canvas, while space history remains a separate graph. Personal names in the new canvas retain original-language forms; all other exposition is in English.

## World space history

Explore **298 nodes** and **408 relationships** in the space-history timeline, spanning eight themes. Its historical snapshot ends on **2025-12-31**.

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

## Maintaining the workspace

The space-history corpus is maintained in space-history.json and its linked notes. The mathematics–physics source corpus and generator are documented in its [reading guide](./mathematics-physics/README.md). The generator updates workspace totals while preserving the separate space-history file. Historical and workspace regression tests check both canvases.
