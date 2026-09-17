import assert from "node:assert/strict";
import { test } from "node:test";
import { visibleTileStatus } from "../src/lib/map-tiles";

const viewport = { left: 0, top: 0, right: 256, bottom: 256 };
const loaded = { bounds: viewport, complete: true, naturalWidth: 256 };
const failed = { ...loaded, naturalWidth: 0 };

test("loaded tiles remain usable, including partial coverage with failed neighbours", () => {
  assert.deepEqual(visibleTileStatus(viewport, [loaded]), { available: true, failed: false, pending: false });
  assert.deepEqual(visibleTileStatus(viewport, [loaded, failed]), { available: true, failed: true, pending: false });
});

test("pending tiles do not trigger a missing-map fallback", () => {
  assert.deepEqual(visibleTileStatus(viewport, []), { available: false, failed: false, pending: true });
  assert.deepEqual(visibleTileStatus(viewport, [failed, { ...failed, complete: false }]), {
    available: false, failed: true, pending: true,
  });
});

test("only usable tiles overlapping the current viewport prevent fallback", () => {
  const outside = { ...loaded, bounds: { left: 256, right: 512, top: 0, bottom: 256 } };
  assert.deepEqual(visibleTileStatus(viewport, [outside, failed]), { available: false, failed: true, pending: false });
  const overlap = { ...loaded, bounds: { left: 255, right: 511, top: 0, bottom: 256 } };
  assert.equal(visibleTileStatus(viewport, [overlap, failed]).available, true);
});
