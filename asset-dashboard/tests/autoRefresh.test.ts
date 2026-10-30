import assert from "node:assert/strict";
import test from "node:test";
import { createAutoRefresh } from "../lib/client/autoRefresh";

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test("automatic refresh repeats each minute, pauses while hidden, refreshes on return and stops on disposal", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1000 });
  let visible = true, calls = 0;
  const scheduler = createAutoRefresh({ run: async () => { calls++; return true; }, isVisible: () => visible });
  scheduler.start(); await flush();
  assert.equal(calls, 1);
  context.mock.timers.tick(59_999); await flush(); assert.equal(calls, 1);
  context.mock.timers.tick(1); await flush(); assert.equal(calls, 2);
  visible = false; scheduler.visibilityChanged();
  context.mock.timers.tick(300_000); await flush(); assert.equal(calls, 2);
  visible = true; scheduler.visibilityChanged(); await flush(); assert.equal(calls, 3);
  scheduler.stop();
  context.mock.timers.tick(300_000); await flush(); assert.equal(calls, 3);
});

test("visibility changes never overlap an active request, including a slow response after disposal", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1000 });
  let calls = 0;
  let resolve!: (success: boolean) => void;
  const scheduler = createAutoRefresh({ run: () => { calls++; return new Promise<boolean>((done) => { resolve = done; }); }, isVisible: () => true });
  scheduler.start();
  scheduler.visibilityChanged();
  context.mock.timers.tick(300_000); await flush(); assert.equal(calls, 1);
  resolve(true); await flush();
  context.mock.timers.tick(60_000); await flush(); assert.equal(calls, 2);
  scheduler.stop(); resolve(true); await flush();
  context.mock.timers.tick(300_000); await flush(); assert.equal(calls, 2);
});

test("partial or failed valuations back off, visibility respects the retry deadline, and recovery resets it", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1000 });
  let calls = 0, success = false;
  const scheduler = createAutoRefresh({ run: async () => { calls++; return success; }, isVisible: () => true });
  scheduler.start(); await flush();
  scheduler.visibilityChanged(); await flush(); assert.equal(calls, 1);
  context.mock.timers.tick(119_999); await flush(); assert.equal(calls, 1);
  context.mock.timers.tick(1); await flush(); assert.equal(calls, 2);
  context.mock.timers.tick(239_999); await flush(); assert.equal(calls, 2);
  context.mock.timers.tick(1); await flush(); assert.equal(calls, 3);
  success = true;
  context.mock.timers.tick(300_000); await flush(); assert.equal(calls, 4);
  context.mock.timers.tick(60_000); await flush(); assert.equal(calls, 5);
  scheduler.stop();
});
