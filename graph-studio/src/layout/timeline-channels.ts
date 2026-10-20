import { getTimelineRelation } from "../graph/timeline";
import type { GraphEdge } from "../graph/types";

interface ChannelEvent {
  key: string;
  start: number;
  end: number;
}

interface Chain {
  events: ChannelEvent[];
  start: number;
  end: number;
  pin?: number;
}

interface Connection {
  source: ChannelEvent;
  target: ChannelEvent;
  priority: number;
  id: string;
}

const compareKeys = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const compareEvents = (a: ChannelEvent, b: ChannelEvent) => a.start - b.start || compareKeys(a.key, b.key);
// Fixed vertical clearance: horizontal spread must not change which events form a chain.
const TEMPORAL_CLEARANCE = 24;

/** Reserve a channel for a whole continuous chain, then reuse it after that chain ends. */
export function assignTimelineChannels(input: {
  events: ChannelEvent[];
  edges: GraphEdge[];
  minimum: number;
  step: number;
  pins?: Record<string, number>;
  fixedPositions?: Record<string, number>;
}): Map<string, number> {
  const { events, edges, minimum, step, pins = {}, fixedPositions = {} } = input;
  const sorted = events.slice().sort(compareEvents);
  const byKey = new Map(events.map((event) => [event.key, event]));
  const incoming = new Map<string, Connection[]>();
  const outgoing = new Map<string, Connection[]>();
  const connections: Connection[] = [];
  for (const edge of edges) {
    const source = byKey.get(edge.source),
      target = byKey.get(edge.target);
    if (!source || !target || source === target) continue;
    const kind = getTimelineRelation(edge.metadata).kind;
    const priority = kind === "sequence" ? 0 : kind === "dependency" ? 1 : kind === "rendezvous" ? 2 : 3;
    const connection = { source, target, priority, id: edge.id };
    connections.push(connection);
    // Same-time and backward edges retain their routes, but cannot become vertical continuations.
    if (priority > 1 || source.start >= target.start) continue;
    incoming.set(target.key, [...(incoming.get(target.key) ?? []), connection]);
    outgoing.set(source.key, [...(outgoing.get(source.key) ?? []), connection]);
  }
  const primary = new Map<string, Connection>();
  for (const [key, links] of outgoing) {
    links.sort((a, b) => a.priority - b.priority || compareEvents(a.target, b.target) || compareKeys(a.id, b.id));
    primary.set(key, links[0]);
  }

  const chains: Chain[] = [];
  const chainByKey = new Map<string, Chain>();
  for (const event of sorted) {
    // Resolved protocol rows are exact constraints; never clamp or reorder them.
    const pin = Number.isFinite(fixedPositions[event.key])
      ? fixedPositions[event.key]
      : Number.isFinite(pins[event.key])
        ? Math.max(minimum, pins[event.key])
        : undefined;
    const candidates = (incoming.get(event.key) ?? []).filter((link) => {
      const chain = chainByKey.get(link.source.key)!;
      return (
        primary.get(link.source.key) === link &&
        chain.events[chain.events.length - 1] === link.source &&
        event.start >= chain.end + TEMPORAL_CLEARANCE &&
        (pin === undefined || chain.pin === undefined || pin === chain.pin)
      );
    });
    // At a merge, prefer the established main chain, not the average position of its branches.
    candidates.sort(
      (a, b) =>
        a.priority - b.priority ||
        compareEvents(chainByKey.get(a.source.key)!.events[0], chainByKey.get(b.source.key)!.events[0]) ||
        compareKeys(a.id, b.id),
    );
    let chain = candidates.length ? chainByKey.get(candidates[0].source.key)! : undefined;
    if (chain) {
      chain.events.push(event);
      chain.end = event.end;
      chain.pin ??= pin;
    } else {
      chain = { events: [event], start: event.start, end: event.end, pin };
      chains.push(chain);
    }
    chainByKey.set(event.key, chain);
  }

  const neighbours = new Map<Chain, { chain: Chain; priority: number }[]>(chains.map((chain) => [chain, []]));
  for (const connection of connections) {
    const source = chainByKey.get(connection.source.key)!,
      target = chainByKey.get(connection.target.key)!;
    if (source === target) continue;
    neighbours.get(source)!.push({ chain: target, priority: connection.priority });
    neighbours.get(target)!.push({ chain: source, priority: connection.priority });
  }
  const positioned = new Map<Chain, number>();
  const positions = new Map<string, number>();
  const pending = new Set(chains);
  while (pending.size) {
    // Place continuations beside their established chain before unrelated chains take those channels.
    // Pins are reserved first; weak references do not pull independent histories into this traversal.
    const priority = (chain: Chain) =>
      chain.pin !== undefined
        ? -1
        : Math.min(
            3,
            ...neighbours
              .get(chain)!
              .filter((item) => positioned.has(item.chain))
              .map((item) => item.priority),
          );
    const chain = [...pending].sort((a, b) => priority(a) - priority(b) || compareEvents(a.events[0], b.events[0]))[0];
    pending.delete(chain);
    const adjacent = neighbours.get(chain)!.filter((item) => positioned.has(item.chain));
    adjacent.sort(
      (a, b) =>
        a.priority - b.priority ||
        Math.abs(a.chain.start - chain.start) - Math.abs(b.chain.start - chain.start) ||
        compareEvents(a.chain.events[0], b.chain.events[0]),
    );
    const desired = adjacent.length ? positioned.get(adjacent[0].chain)! : minimum;
    const blocked = [...positioned]
      .filter(([other]) => chain.start < other.end + TEMPORAL_CLEARANCE && chain.end + TEMPORAL_CLEARANCE > other.start)
      .map(([, x]) => x);
    const candidates = [desired, minimum, ...blocked.flatMap((x) => [x - step, x + step])];
    const x =
      chain.pin ??
      candidates
        .filter(
          (candidate) =>
            candidate >= minimum && blocked.every((occupied) => Math.abs(candidate - occupied) >= step - 1e-7),
        )
        .sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired) || a - b)[0];
    positioned.set(chain, x);
    for (const event of chain.events) positions.set(event.key, x);
  }
  return positions;
}
