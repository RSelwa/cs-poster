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

test("team A strokes emanate left, team B right", () => {
  const { strokes } = computePoster(series);
  const a = strokes.filter((s) => s.team === "a");
  const b = strokes.filter((s) => s.team === "b");
  // base angle PI for a (cos < 0 -> leftward), 0 for b (cos > 0 -> rightward),
  // jitter is < PI/2 so the horizontal sign is preserved
  assert.ok(a.every((s) => Math.cos(s.angle) < 0), "A strokes point left");
  assert.ok(b.every((s) => Math.cos(s.angle) > 0), "B strokes point right");
});

test("attractors mark actual events: clutches, aces, plants", () => {
  const { attractors } = computePoster(series);
  const kinds = new Set(attractors.map((a) => a.kind));
  assert.ok(kinds.has("clutch"));
  assert.ok(kinds.has("ace"));
  assert.ok(kinds.has("plant"));
  // ace is the strongest pull
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
