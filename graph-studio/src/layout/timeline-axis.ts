export type TimelineAxisMode = "linear" | "adaptive";

/** Plain data so the same map can be saved, reused by filters, and sent to the layout worker. */
export interface TimelineAxisMap {
  mode: TimelineAxisMode;
  start: number;
  end: number;
  originY: number;
  height: number;
  knots: { time: number; y: number }[];
}

export interface TimelineAxisOptions {
  start: number;
  end: number;
  originY: number;
  height: number;
  mode: TimelineAxisMode;
  /** 0 retains more elapsed-time spacing, 1 compresses sparse periods more strongly. */
  compactness?: number;
  /** Include each instant and both endpoints of each duration. Duplicates express local demand. */
  timestamps: number[];
  /** Optional demand per timestamp, e.g. relation count or label size; defaults to 1. */
  weights?: number[];
}

export function createTimelineAxis(options: TimelineAxisOptions): TimelineAxisMap {
  const { start, end, originY, height, mode, timestamps, weights } = options;
  if (![start, end, originY, height].every(Number.isFinite) || start > end || height <= 0)
    throw new RangeError("A timeline axis needs finite ordered times and a positive height.");
  const map: TimelineAxisMap = { mode, start, end, originY, height, knots: [{ time: start, y: originY }] };
  if (start === end) return map;
  if (mode === "linear") {
    map.knots.push({ time: end, y: originY + height });
    return map;
  }

  const demand = new Map<number, number>([
    [start, 0],
    [end, 0],
  ]);
  timestamps.forEach((time, index) => {
    if (!Number.isFinite(time) || time < start || time > end) return;
    const weight = weights?.[index];
    demand.set(time, (demand.get(time) || 0) + (Number.isFinite(weight) && weight! > 0 ? weight! : 1));
  });
  const times = [...demand.keys()].sort((a, b) => a - b);
  const span = end - start;
  const compactness = Number.isFinite(options.compactness) ? Math.max(0, Math.min(1, options.compactness!)) : 0.5;
  // A sublinear elapsed-time term prevents the misleading "one equal step per event" effect.
  // Local demand uses a square root and a cap, so simultaneous events do not swallow the axis.
  const exponent = 0.66 - compactness * 0.38;
  const elapsedShare = 0.28 - compactness * 0.18;
  const gaps = times.slice(1).map((time, index) => time - times[index]);
  const localDemand = gaps.map((_, index) =>
    Math.min(4, Math.sqrt(1 + ((demand.get(times[index]) || 0) + (demand.get(times[index + 1]) || 0)) / 2)),
  );
  const scores = gaps.map((gap, index) => Math.pow(gap / span, exponent) * localDemand[index]);
  const totalScore = scores.reduce((sum, score) => sum + score, 0);
  let fractions = gaps.map(
    (gap, index) => (elapsedShare * gap) / span + ((1 - elapsedShare) * scores[index]) / totalScore,
  );
  // Gently smooth local scale changes in log space. A real elapsed-time floor survives all
  // smoothing: no sparse interval disappears and the map remains strictly invertible.
  const slopes = fractions.map((fraction, index) => (fraction * span) / gaps[index]);
  const smoothed = slopes.map((slope, index) => {
    const left = slopes[Math.max(0, index - 1)];
    const right = slopes[Math.min(slopes.length - 1, index + 1)];
    return Math.max(
      0.06,
      Math.min(2000, Math.exp(0.84 * Math.log(slope) + 0.08 * Math.log(left) + 0.08 * Math.log(right))),
    );
  });
  const normalization = smoothed.reduce((sum, slope, index) => sum + (slope * gaps[index]) / span, 0);
  // A demand budget keeps day-scale events readable even inside a millennial history.
  // Most space remains time-derived; a day and a century never become equal by default.
  const informationShare = 0.15 + compactness * 0.3;
  const totalDemand = localDemand.reduce((sum, value) => sum + value, 0);
  fractions = smoothed.map(
    (slope, index) =>
      (0.06 * gaps[index]) / span +
      ((0.94 - informationShare) * slope * gaps[index]) / span / normalization +
      (informationShare * localDemand[index]) / totalDemand,
  );
  let y = originY;
  for (let index = 0; index < gaps.length; index++) {
    y += fractions[index] * height;
    map.knots.push({ time: times[index + 1], y: index === gaps.length - 1 ? originY + height : y });
  }
  return map;
}

/** Outside the extent, extrapolate with the nearest segment; callers can clip explicitly. */
export function timelineTimeToY(map: TimelineAxisMap, time: number): number {
  if (map.knots.length === 1) return map.originY;
  const index = segmentIndex(map.knots, time, "time");
  const left = map.knots[index],
    right = map.knots[index + 1];
  return left.y + ((time - left.time) / (right.time - left.time)) * (right.y - left.y);
}

export function timelineYToTime(map: TimelineAxisMap, y: number): number {
  if (map.knots.length === 1) return map.start;
  const index = segmentIndex(map.knots, y, "y");
  const left = map.knots[index],
    right = map.knots[index + 1];
  return left.time + ((y - left.y) / (right.y - left.y)) * (right.time - left.time);
}

/** Widen a retained axis without refitting it. Internal time distances remain exact;
 * only a uniform translation may be needed to keep newly revealed events on the canvas.
 */
export function extendTimelineAxis(
  map: TimelineAxisMap,
  start: number,
  end: number,
  minimumOriginY = 0,
): TimelineAxisMap {
  if (![start, end, minimumOriginY].every(Number.isFinite) || start > end)
    throw new RangeError("Axis extension needs finite ordered times and a finite origin.");
  const extendedStart = Math.min(map.start, start),
    extendedEnd = Math.max(map.end, end);
  if (extendedStart === map.start && extendedEnd === map.end) return map;
  const project =
    map.start === map.end
      ? (time: number) => map.originY + ((time - map.start) * map.height) / 86_400_000
      : (time: number) => timelineTimeToY(map, time);
  const knots = map.knots.map((knot) => ({ ...knot }));
  if (extendedStart < map.start) knots.unshift({ time: extendedStart, y: project(extendedStart) });
  if (extendedEnd > map.end) knots.push({ time: extendedEnd, y: project(extendedEnd) });
  const shift = Math.max(0, minimumOriginY - knots[0].y);
  if (shift)
    knots.forEach((knot) => {
      knot.y += shift;
    });
  return {
    ...map,
    start: extendedStart,
    end: extendedEnd,
    originY: knots[0].y,
    height: knots[knots.length - 1].y - knots[0].y,
    knots,
  };
}

function segmentIndex(knots: TimelineAxisMap["knots"], value: number, key: "time" | "y"): number {
  let low = 0,
    high = knots.length - 1;
  while (low + 1 < high) {
    const mid = (low + high) >>> 1;
    if (knots[mid][key] <= value) low = mid;
    else high = mid;
  }
  return Math.min(low, knots.length - 2);
}
