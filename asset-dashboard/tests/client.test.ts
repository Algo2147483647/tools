import assert from "node:assert/strict";
import test from "node:test";
import { createRequestGate } from "../lib/client/requestGate";
import { formatMoney, formatNumber } from "../lib/client/format";

test("late results cannot overwrite a newer request even when fetch ignores abort", async () => {
  const gate = createRequestGate();
  const old = gate.begin();
  const latest = gate.begin();
  assert.equal(old.signal.aborted, true);
  let committed = "";
  if (latest.isCurrent()) committed = "CNY";
  await Promise.resolve();
  if (old.isCurrent()) committed = "USD";
  assert.equal(committed, "CNY");
  latest.cancel();
  assert.equal(latest.isCurrent(), false);
});

test("unknown or invalid valuations never look like zero money", () => {
  for (const value of [null, undefined, Infinity, NaN]) {
    assert.equal(formatMoney(value), "—");
    assert.equal(formatNumber(value), "—");
  }
  assert.equal(formatMoney(0), "$0.00");
  assert.equal(formatMoney(0, "g gold"), "0 g");
});
