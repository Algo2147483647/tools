import assert from "node:assert/strict";
import { formatTimelineDate, parseTimelineDate, parseTimelineTime } from "../graph/timeline";
import { parseTimelineRangeInput, timelineRangeDates } from "../graph/timelineRange";
import { createTimelineAxis, extendTimelineAxis, timelineTimeToY, timelineYToTime } from "../layout/timeline-axis";
import { getTimelineAxisTicks, getVisibleTimeTicks } from "../layout/timeline-ticks";
import { defineSuite, defineTest } from "./harness";

const DAY = 86_400_000;
const at = (value: string) => parseTimelineDate(value)!.timestamp;

export const timelineAxisSuite = defineSuite("Timeline axes and historical precision", [
  defineTest("historical and coarse dates retain their precision without inventing month or day labels", () => {
    assert.deepEqual(parseTimelineDate("1911"), { timestamp: at("1911-01-01"), precision: "year" });
    assert.deepEqual(parseTimelineDate("1911-10"), { timestamp: at("1911-10-01"), precision: "month" });
    const qin = parseTimelineTime({ at: "-000220" });
    assert.equal(qin.label, "221 BCE");
    assert.equal(qin.status === "dated" && qin.precision, "year");
    assert.equal(new Date(at("-000220")).getUTCFullYear(), -220);
    assert.equal(formatTimelineDate(at("0000"), "year"), "1 BCE");
    assert.equal(parseTimelineTime({ at: "1911-10" }).label, "1911-10");
    assert.equal(parseTimelineTime({ start: "-000220", end: "-000205" }).label, "221 BCE → 206 BCE");
    const mixed = parseTimelineTime({ start: "1911", end: "1912-02" });
    assert.equal(mixed.status === "dated" && mixed.precision, "month");
  }),
  defineTest("calendar validation rejects malformed and unrepresentable historical timestamps", () => {
    for (const value of [
      "-220",
      "-000000",
      "-000220-02-30",
      "+999999",
      "2025-00",
      "2025-13",
      "2025T12:00Z",
      "2025-02T12:00Z",
    ])
      assert.equal(parseTimelineDate(value), null, value);
    assert.notEqual(parseTimelineDate("0000-02-29"), null);
    assert.equal(parseTimelineDate("-000100-02-29"), null);
    assert.equal(at("-000220-02-01T12:00+08:00"), at("-000220-02-01T04:00Z"));
  }),
  defineTest("year and month range limits include the complete requested period and round-trip BCE dates", () => {
    const range = parseTimelineRangeInput("-000220", "-000205");
    assert.equal(range.ok, true);
    if (!range.ok) return;
    assert.deepEqual(range.range, { start: at("-000220"), end: at("-000204") - 1 });
    assert.deepEqual(timelineRangeDates(range.range), { from: "-000220-01-01", to: "-000205-12-31" });
    const month = parseTimelineRangeInput("2024-02", "2024-02");
    assert.equal(month.ok && month.range!.end, at("2024-03") - 1);
    assert.equal(parseTimelineRangeInput("2025-02-30", "2025").ok, false);
    assert.equal(parseTimelineRangeInput("2025", "2024").ok, false);
  }),
  defineTest("linear mapping preserves true elapsed time and extrapolates reversibly", () => {
    const map = createTimelineAxis({ start: 100, end: 1100, originY: 80, height: 500, mode: "linear", timestamps: [] });
    for (const [time, y] of [
      [100, 80],
      [600, 330],
      [1100, 580],
      [1600, 830],
    ]) {
      assert.equal(timelineTimeToY(map, time), y);
      assert.equal(timelineYToTime(map, y), time);
    }
    assert.deepEqual(JSON.parse(JSON.stringify(map)), map);
  }),
  defineTest("adaptive mapping expands dense periods while retaining nonzero chronological distances", () => {
    const map = createTimelineAxis({
      start: 0,
      end: 1000,
      originY: 20,
      height: 1000,
      mode: "adaptive",
      timestamps: [0, 1, 2, 3, 100, 500, 1000],
    });
    assert.equal(timelineTimeToY(map, 0), 20);
    assert.equal(timelineTimeToY(map, 1000), 1020);
    assert.ok(timelineTimeToY(map, 3) - timelineTimeToY(map, 0) > 3 * 10, "dense three-unit period expands");
    assert.ok(
      timelineTimeToY(map, 1000) - timelineTimeToY(map, 500) < 500,
      "sparse five-hundred-unit period compresses",
    );
    assert.ok(
      timelineTimeToY(map, 1000) - timelineTimeToY(map, 500) > 50,
      "long gaps retain a substantial duration cue",
    );
    for (let time = 0; time <= 1000; time += 0.5) {
      const y = timelineTimeToY(map, time);
      assert.ok(Math.abs(timelineYToTime(map, y) - time) < 1e-8);
      if (time) assert.ok(y > timelineTimeToY(map, time - 0.5));
    }
  }),
  defineTest("coincident timestamps stay coincident; density is deterministic and includes endpoint demand", () => {
    const options = { start: 0, end: 100, originY: 0, height: 1000, mode: "adaptive" as const };
    const sparse = createTimelineAxis({ ...options, timestamps: [0, 10, 20, 100] });
    const values = [0, 10, 10, 10, 10, 10, 10, 20, 100];
    const dense = createTimelineAxis({ ...options, timestamps: values });
    assert.equal(dense.knots.filter((knot) => knot.time === 10).length, 1);
    assert.deepEqual(dense, createTimelineAxis({ ...options, timestamps: values.slice().reverse() }));
    assert.ok(timelineTimeToY(dense, 20) > timelineTimeToY(sparse, 20));
    const weighted = createTimelineAxis({ ...options, timestamps: [0, 10, 20, 100], weights: [1, 6, 1, 1] });
    assert.deepEqual(weighted, dense);
  }),
  defineTest("day-scale clusters remain readable within a millennial axis without equalizing centuries", () => {
    const timestamps = ["1000", "1840-01-01", "1840-01-02", "1840-01-03", "2020"].map(at);
    const options = {
      start: timestamps[0],
      end: timestamps[4],
      originY: 0,
      height: 2000,
      mode: "adaptive" as const,
      timestamps,
    };
    const map = createTimelineAxis(options);
    const dayGap = timelineTimeToY(map, timestamps[2]) - timelineTimeToY(map, timestamps[1]);
    const centuryGap = timelineTimeToY(map, timestamps[4]) - timelineTimeToY(map, timestamps[3]);
    assert.ok(dayGap >= 72, "adjacent distinct dates receive useful reading space");
    assert.ok(centuryGap > dayGap * 2, "elapsed time remains visible");
    const compact = createTimelineAxis({ ...options, compactness: 1 });
    const spacious = createTimelineAxis({ ...options, compactness: 0 });
    assert.ok(
      timelineTimeToY(compact, timestamps[1]) - timelineTimeToY(compact, timestamps[0]) <
        timelineTimeToY(spacious, timestamps[1]) - timelineTimeToY(spacious, timestamps[0]),
    );
    assert.ok(Math.abs(timelineYToTime(map, timelineTimeToY(map, timestamps[2])) - timestamps[2]) < 1);
  }),
  defineTest("point extents are finite and invalid geometry is rejected", () => {
    const map = createTimelineAxis({
      start: 10,
      end: 10,
      originY: 80,
      height: 1000,
      mode: "adaptive",
      timestamps: [10, 10],
    });
    assert.equal(timelineTimeToY(map, 10), 80);
    assert.equal(timelineYToTime(map, 100), 10);
    assert.equal(getTimelineAxisTicks(map, 0, 1000, 1).length, 1);
    assert.throws(
      () => createTimelineAxis({ start: 1, end: 0, originY: 0, height: 100, mode: "linear", timestamps: [] }),
      RangeError,
    );
  }),
  defineTest("widening a locked date window preserves all internal pixel distances and visible geometry", () => {
    const options = {
      start: at("1840"),
      end: at("1850"),
      originY: 112,
      height: 900,
      timestamps: ["1840", "1841", "1842", "1850"].map(at),
    };
    for (const mode of ["linear", "adaptive"] as const) {
      const locked = createTimelineAxis({ ...options, mode });
      const snapshot = JSON.stringify(locked);
      const full = extendTimelineAxis(locked, at("1800"), at("1900"), 112);
      assert.equal(JSON.stringify(locked), snapshot, "saved map stays immutable");
      assert.equal(full.start, at("1800"));
      assert.equal(full.end, at("1900"));
      assert.equal(full.originY, 112);
      assert.ok(full.knots.every((knot) => knot.y >= 112));
      assert.ok(full.knots[full.knots.length - 1].y === full.originY + full.height);
      const translation = timelineTimeToY(full, options.start) - timelineTimeToY(locked, options.start);
      for (const value of ["1840", "1841", "1842", "1845", "1850"]) {
        assert.ok(Math.abs(timelineTimeToY(full, at(value)) - timelineTimeToY(locked, at(value)) - translation) < 1e-8);
        assert.ok(Math.abs(timelineYToTime(full, timelineTimeToY(full, at(value))) - at(value)) <= 1);
      }
      assert.equal(extendTimelineAxis(full, at("1830"), at("1870")), full, "narrowing never refits a retained axis");
      const later = extendTimelineAxis(locked, options.start, at("1900"));
      assert.equal(timelineTimeToY(later, options.start), locked.originY, "end-only extension does not translate");
    }
    const point = createTimelineAxis({
      start: 0,
      end: 0,
      originY: 112,
      height: 900,
      mode: "adaptive",
      timestamps: [0],
    });
    const widened = extendTimelineAxis(point, -DAY, DAY, 112);
    assert.equal(widened.height, 1800);
    assert.equal(timelineYToTime(widened, timelineTimeToY(widened, DAY / 2)), DAY / 2);
  }),
  defineTest("fixed month ticks follow leap-year calendars and their true elapsed spacing", () => {
    const map = createTimelineAxis({
      start: at("2024-01"),
      end: at("2024-05"),
      originY: 0,
      height: 1210,
      mode: "linear",
      timestamps: [],
    });
    const ticks = getTimelineAxisTicks(map, 0, 1210, 1, { step: 1, unit: "month" });
    assert.deepEqual(
      ticks.map((tick) => tick.label),
      ["2024-01", "2024-02", "2024-03", "2024-04", "2024-05"],
    );
    assert.equal(ticks[2].time - ticks[1].time, 29 * DAY);
    assert.ok(ticks[2].y - ticks[1].y < ticks[1].y - ticks[0].y);
  }),
  defineTest("arbitrary calendar intervals survive zoom thinning and BCE ticks use historical labels", () => {
    const map = createTimelineAxis({
      start: at("-000300"),
      end: at("0300"),
      originY: 0,
      height: 1800,
      mode: "linear",
      timestamps: [],
    });
    const ticks = getTimelineAxisTicks(map, 0, 1800, 0.2, { step: 7, unit: "year" });
    assert.ok(ticks.length > 2);
    assert.ok(ticks.every((tick) => new Date(tick.time).getUTCFullYear() % 7 === 0));
    assert.ok(ticks.some((tick) => tick.label.endsWith("BCE")));
    assert.ok(ticks.every((tick) => tick.y === timelineTimeToY(map, tick.time)));
  }),
  defineTest("adaptive ruler follows the exact shared map and allocates finer ticks near dense events", () => {
    const dates = ["1000", "1500", "1501", "1502", "1503", "1504", "1900"].map(at);
    const map = createTimelineAxis({
      start: dates[0],
      end: dates[dates.length - 1],
      originY: 100,
      height: 3600,
      mode: "adaptive",
      timestamps: dates,
      compactness: 1,
    });
    const ticks = getTimelineAxisTicks(map, 100, 3700, 1);
    assert.ok(ticks.length >= 5);
    assert.ok(ticks.some((tick) => tick.time >= at("1500") && tick.time <= at("1504")));
    assert.ok(ticks.every((tick) => tick.y === timelineTimeToY(map, tick.time)));
    assert.ok(ticks.slice(1).every((tick, index) => tick.y - ticks[index].y >= 56));
  }),
  defineTest("very fine fixed intervals across centuries are bounded without changing their base alignment", () => {
    const map = createTimelineAxis({
      start: at("1000"),
      end: at("2000"),
      originY: 0,
      height: 1000,
      mode: "linear",
      timestamps: [],
    });
    const ticks = getTimelineAxisTicks(map, 0, 1000, 1, { step: 3, unit: "second" });
    assert.ok(ticks.length <= 20);
    assert.ok(ticks.every((tick) => tick.time % 3000 === 0));
    assert.deepEqual(getVisibleTimeTicks(null, null, 0, 0, 0, 500, 1), []);
  }),
]);
