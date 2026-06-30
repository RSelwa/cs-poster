import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computePoster, dramaScore } from "./layout.js";

const series = JSON.parse(
  readFileSync(new URL("../../data/sample-match.json", import.meta.url), "utf8")
);
const totalRounds = series.maps.reduce((n, m) => n + m.rounds.length, 0);

test("computePoster is deterministic (same input -> same output)", () => {
  const a = computePoster(series);
  const b = computePoster(series);
  assert.deepEqual(a.strokes, b.strokes);
});

test("one grid, 1 cell = 1 round, all rounds across all maps, reading order", () => {
  const { grid } = computePoster(series, { cols: 8 });
  assert.equal(grid.cols, 8);
  assert.equal(grid.total, totalRounds);
  assert.equal(grid.rows, Math.ceil(totalRounds / 8));
});

test("grid footprint is fixed; cell height shrinks as rounds grow", () => {
  const few = computePoster({ ...series, maps: [series.maps[0]] }); // ~22 rounds
  const many = computePoster(series); // ~78 rounds
  assert.equal(few.grid.gridH, many.grid.gridH); // footprint constant
  assert.ok(many.grid.cellH < few.grid.cellH); // more rounds -> shorter cells
});

test("strokes are traced polylines with per-point pressure", () => {
  const { strokes } = computePoster(series);
  assert.ok(strokes.every((s) => Array.isArray(s.points) && s.points.length >= 2));
  const avg = strokes.reduce((n, s) => n + s.points.length, 0) / strokes.length;
  assert.ok(avg > 6, "long sweeping flow lines integrate to many points");
  const s = strokes.find((x) => x.points.length > 6);
  assert.ok(s.points.every((p) => p.length === 3 && p[2] > 0 && p[2] <= 1));
  assert.ok(s.points[Math.floor(s.points.length / 2)][2] > s.points[0][2], "mid pressure > tapered end");
});

test("team A flows left, team B flows right (net horizontal displacement)", () => {
  const { strokes } = computePoster(series);
  const dx = (s) => s.points[s.points.length - 1][0] - s.points[0][0];
  const mean = (arr, f) => arr.reduce((n, x) => n + f(x), 0) / arr.length;
  assert.ok(mean(strokes.filter((s) => s.team === "a"), dx) < 0, "A net flow leftward");
  assert.ok(mean(strokes.filter((s) => s.team === "b"), dx) > 0, "B net flow rightward");
});

test("gravity wells: map-clinch always present; clutch mocked when data lacks it", () => {
  const { wells } = computePoster(series, { mockClutches: true });
  const kinds = new Set(wells.map((w) => w.kind));
  assert.ok(kinds.has("map"), "each map's clinch round is a well");
  assert.ok(kinds.has("ace") || kinds.has("clutch") || kinds.has("clutch*"));
  assert.ok(wells.every((w) => w.radius > 0));
  // sample has explicit clutches/aces -> mock should NOT fire for those maps
  assert.ok([...kinds].some((k) => k === "clutch" || k === "ace"));
});

test("mockClutches=false drops the synthetic clutch wells", () => {
  const noMock = computePoster({ ...series, maps: [{ ...series.maps[0], players: [] }] }, { mockClutches: false });
  // map 0 with no players -> no real clutch/ace -> with mock off, only map/pistol wells
  assert.ok(!noMock.wells.some((w) => w.kind === "clutch*"));
});

test("dramaScore rises with overtime + close series", () => {
  assert.ok(dramaScore(series) > 0.3);
});
