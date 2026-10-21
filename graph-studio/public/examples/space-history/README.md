# History of Technology

This workspace contains three independent canvases:

- [World space history](./space-history.json) — 298 events and completed mission phases, 408 relationships, 1957–2025.
- [History of Mathematics and Physics](./mathematics-physics/mathematics-physics.json) — one combined mathematics–physics canvas with 250 point events and 317 relationships, c. 1850 BCE–2024. [Reading guide, names and sources](./mathematics-physics/README.md).
- [History of AGI Research](./agi/agi-history.json) — 233 point events and 368 relationships across 13 research strands, 1666–2026. [Reading guide](./agi/README.md), [historical overview](./agi/OVERVIEW.md), [event catalog](./agi/CATALOG.md), and [sources](./agi/SOURCES.md).

Select a canvas from the workspace graph list. Each opens in Timeline mode. Mathematics and physics share one canvas; spaceflight and AGI research each have their own. All exposition is in English. The mathematics–physics canvas also preserves original-language personal names.

## History of AGI Research

Follow logic and computation, symbolic reasoning, cognitive architectures, neural networks, probability and causality, reinforcement learning, embodiment and world models, foundation models, reasoning and agents, open-ended learning, research infrastructure, evaluation, and alignment. Each event includes its historical account, significance, limitations, contributors, date precision and source links. Thirteen strand guides explain the interacting research programs; the overview connects them across eight historical periods.

The AGI canvas uses an adaptive vertical axis to keep dense periods readable. Spacing is not proportional to elapsed time; choose a linear axis to compare durations. Filter with **Track**, **Type**, and **Time range**, and double-click events for details. Reading-order links, concrete dependencies and conceptual references have distinct meanings. This is a systematic selection of principal research lineages, with a snapshot compiled on October 21, 2026; the latest included event is October 9, 2026.

## World space history

Explore **298 nodes** and **408 relationships** in the space-history timeline, spanning eight themes. Its historical snapshot ends on **2025-12-31**.

**space-history.json** opens with the entire corpus. Use **Type**, **Track** and **Time range** to focus within this one graph, then **Show all events** to restore the full history. To inspect Apollo 11, select the crewed lunar theme and July 16–24, 1969; Eagle and Columbia retain their parallel activity and later docking.

## Read the spaceflight timeline

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

Maintain the three graphs and their linked reading files directly. Their original authoring scripts are not required at runtime. Keep the shared manifest's asset list and per-graph counts consistent with the files. Run `npm run check` from Graph Studio to validate loading, local links, chronology, serialization and complete and filtered timeline layouts.
