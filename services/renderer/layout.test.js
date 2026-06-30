import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computePoster, dramaScore } from "./layout.js";

const series = JSON.parse(
  readFileSync(new URL("../../data/sample-match.json", import.meta.url), "utf8")
);

test("computePoster is deterministic (same input -> same output)", () => {
  const a = computePoster(series);
  const b = computePoster(series);
  assert.deepEqual(a.strokes, b.strokes);
  assert.equal(a.strokes.length, b.strokes.length);
});

test("band width is proportional to round count", () => {
  const { bands, cfg } = computePoster(series);
  bands.forEach((band, i) => {
    assert.equal(band.w, series.maps[i].rounds.length * cfg.slotW);
  });
  // the OT decider (most rounds) is the widest band
  const widest = bands.reduce((p, c) => (c.w > p.w ? c : p));
  assert.equal(widest.name, "Nuke");
});

test("strokes are traced polylines (curved paths, not single segments)", () => {
  const { strokes } = computePoster(series);
  assert.ok(strokes.every((s) => Array.isArray(s.points) && s.points.length >= 2));
  // a traced flow line has many points, not just start+end
  const avgPts = strokes.reduce((n, s) => n + s.points.length, 0) / strokes.length;
  assert.ok(avgPts > 5, "flow lines should integrate into multiple points");
});

test("team A flows left, team B flows right (net horizontal displacement)", () => {
  const { strokes } = computePoster(series);
  const dx = (s) => s.points[s.points.length - 1][0] - s.points[0][0];
  const mean = (arr, f) => arr.reduce((n, x) => n + f(x), 0) / arr.length;
  const a = strokes.filter((s) => s.team === "a");
  const b = strokes.filter((s) => s.team === "b");
  // base direction dominates net horizontal flow even with swirl
  assert.ok(mean(a, dx) < 0, "A net flow is leftward");
  assert.ok(mean(b, dx) > 0, "B net flow is rightward");
});

test("attractors mark events and dynamics; never empty for a real map", () => {
  const { attractors } = computePoster(series);
  const kinds = new Set(attractors.map((a) => a.kind));
  assert.ok(kinds.has("clutch"));
  assert.ok(kinds.has("ace"));
  // even without explicit events, decisive-round + momentum keep the field alive
  assert.ok(kinds.has("decisive"));
  assert.ok(attractors.every((a) => a.radius > 0));
  const ace = attractors.find((a) => a.kind === "ace");
  assert.equal(ace.strength, 1);
});

test("side switches mark round 13 and OT halves", () => {
  const { sideSwitches } = computePoster(series);
  // 3 maps each cross round 13 once; the OT map adds extra half markers
  assert.ok(sideSwitches.length >= 3);
});

test("dramaScore rises with overtime + close series", () => {
  assert.ok(dramaScore(series) > 0.3);
  const flat = {
    ...series,
    seriesScore: { a: 2, b: 0 },
    maps: [
      { ...series.maps[0], overtime: false, score: { a: 13, b: 2 } },
      { ...series.maps[1], overtime: false, score: { a: 13, b: 1 } }
    ]
  };
  assert.ok(dramaScore(flat) < dramaScore(series));
});
