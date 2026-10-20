import type { CompoundBox } from "./compound-routes";
type Size = { width: number; height: number };
type Arrangement = { boxes: Map<string, CompoundBox>; width: number; height: number };
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const shapeCost = ({width, height}: Size) => Math.log(Math.max(1, width * height)) + 0.35 * Math.abs(Math.log(Math.max(1, width) / Math.max(1, height) / 1.6));

/** Condense cycles before ranking. Every edge between components must point downstream. */
function topology(ids: string[], edges: [string, string][]) {
  const outgoing = new Map(ids.map(id => [id, new Set<string>()]));
  const incoming = new Map(ids.map(id => [id, new Set<string>()]));
  for (const [a,b] of edges) if (a !== b) { outgoing.get(a)!.add(b); incoming.get(b)!.add(a); }
  const visited = new Set<string>(), finish: string[] = [];
  for (const id of ids) {
    if (visited.has(id)) continue;
    visited.add(id);
    const stack: {id: string; next: Iterator<string>}[] = [{id, next: outgoing.get(id)!.values()}];
    while (stack.length) {
      const item = stack[stack.length - 1], next = item.next.next();
      if (next.done) { finish.push(item.id); stack.pop(); }
      else if (!visited.has(next.value)) { visited.add(next.value); stack.push({id: next.value, next: outgoing.get(next.value)!.values()}); }
    }
  }
  const component = new Map<string, number>(), members: string[][] = [];
  for (const id of finish.reverse()) {
    if (component.has(id)) continue;
    const index = members.length, group: string[] = [], stack = [id];
    component.set(id, index);
    while (stack.length) {
      const current = stack.pop()!; group.push(current);
      for (const previous of incoming.get(current)!) if (!component.has(previous)) { component.set(previous, index); stack.push(previous); }
    }
    members.push(group.sort(compare));
  }
  // Components arrive in topological order. Within a cycle favor sources/sinks;
  // backward relationships remain feedback edges, never reversed document edges.
  const order: string[] = [];
  for (const group of members) {
    const remaining = new Set(group), left: string[] = [], right: string[] = [];
    while (remaining.size) {
      const degree = (id: string, map: Map<string, Set<string>>) => [...map.get(id)!].filter(other => remaining.has(other)).length;
      const sink = [...remaining].find(id => degree(id, outgoing) === 0);
      const next = sink ?? [...remaining].sort((a,b) => (degree(b, outgoing) - degree(b, incoming)) - (degree(a, outgoing) - degree(a, incoming)) || compare(a,b))[0];
      remaining.delete(next);
      if (sink) right.push(next); else left.push(next);
    }
    order.push(...left, ...right.reverse());
  }
  const position = new Map(order.map((id, i) => [id, i])), rank = new Map(ids.map(id => [id, 0]));
  for (const id of order) for (const next of outgoing.get(id)!) {
    if (position.get(next)! > position.get(id)!) rank.set(next, Math.max(rank.get(next)!, rank.get(id)! + 1));
  }
  const layers: string[][] = [];
  for (const id of order) (layers[rank.get(id)!] ??= []).push(id);
  const row = new Map<string, number>();
  layers.forEach(layer => {
    const barycenter = (id: string) => {
      const predecessors = [...incoming.get(id)!].filter(p => rank.get(p)! < rank.get(id)!);
      return predecessors.length ? predecessors.reduce((sum,p) => sum + (row.get(p) ?? 0), 0) / predecessors.length : 0;
    };
    layer.sort((a,b) => barycenter(a) - barycenter(b) || compare(a,b));
    layer.forEach((id,i) => row.set(id,i));
  });
  return layers;
}

function grid(layers: string[][], sizes: Map<string, Size>, columnGap: number, rowGap: number, down: boolean): Arrangement {
  const widthOf = (id: string) => down ? sizes.get(id)!.height : sizes.get(id)!.width;
  const heightOf = (id: string) => down ? sizes.get(id)!.width : sizes.get(id)!.height;
  const widths = layers.map(layer => Math.max(0, ...layer.map(widthOf)));
  const heights = Array.from({length: Math.max(0, ...layers.map(layer => layer.length))}, (_,i) => Math.max(0, ...layers.map(layer => layer[i] ? heightOf(layer[i]) : 0)));
  const offsets = (values: number[], gap: number) => { let at = 0; return values.map(value => { const start=at; at+=value+gap; return start; }); };
  const xs = offsets(widths, down ? rowGap : columnGap), ys = offsets(heights, down ? columnGap : rowGap);
  const boxes = new Map<string, CompoundBox>();
  layers.forEach((layer,col) => layer.forEach((id,row) => boxes.set(id, { ...sizes.get(id)!, x: down ? ys[row] : xs[col], y: down ? xs[col] : ys[row] })));
  const width = widths.length ? xs[xs.length-1]+widths[widths.length-1] : 0, height=heights.length ? ys[ys.length-1]+heights[heights.length-1] : 0;
  return { boxes, width: down ? height : width, height: down ? width : height };
}

/** Rank first; choose an aligned orientation using only local, already-fixed rectangles. */
export function arrangeTopology(ids: string[], edges: [string, string][], sizes: Map<string, Size>, columnGap: number, rowGap: number): Arrangement {
  columnGap = Math.max(0, columnGap); rowGap = Math.max(0, rowGap);
  edges = [...edges].sort(([a,b],[c,d])=>compare(a,c)||compare(b,d));
  const adjacent = new Map(ids.map(id => [id,new Set<string>()]));
  for (const [a,b] of edges) { adjacent.get(a)!.add(b); adjacent.get(b)!.add(a); }
  const visited = new Set<string>(), pieces: Arrangement[] = [];
  for (const id of [...ids].sort(compare)) {
    if (visited.has(id)) continue;
    const members: string[] = [], stack = [id]; visited.add(id);
    while (stack.length) { const current=stack.pop()!; members.push(current); for (const next of adjacent.get(current)!) if (!visited.has(next)) {visited.add(next);stack.push(next);} }
    const memberSet = new Set(members);
    const layers=topology(members.sort(compare),edges.filter(([a,b])=>memberSet.has(a)&&memberSet.has(b)));
    const candidates=[grid(layers,sizes,columnGap,rowGap,false),grid(layers,sizes,columnGap,rowGap,true)];
    pieces.push(candidates.sort((a,b)=>shapeCost(a)-shapeCost(b))[0]);
  }
  if (!pieces.length) return {boxes:new Map(),width:0,height:0};
  const keys=pieces.map((_,i)=>String(i)), pieceSizes=new Map(keys.map((key,i)=>[key,pieces[i]]));
  let packed: Arrangement | undefined;
  for (let columns=1;columns<=pieces.length;columns++) {
    const layers=Array.from({length:columns},()=>[] as string[]);
    keys.forEach((key,i)=>layers[i%columns].push(key));
    const candidate=grid(layers,pieceSizes,columnGap,rowGap,false);
    if (!packed || shapeCost(candidate)<shapeCost(packed)) packed=candidate;
  }
  const boxes=new Map<string,CompoundBox>();
  pieces.forEach((piece,i)=>{const offset=packed!.boxes.get(String(i))!;for(const [id,box]of piece.boxes)boxes.set(id,{...box,x:box.x+offset.x,y:box.y+offset.y});});
  return {boxes,width:packed!.width,height:packed!.height};
}
