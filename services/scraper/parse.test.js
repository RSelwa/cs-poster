import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseSeries } from "./parse.js";
import { assertValid, isValid } from "./validate.js";

// Minimal HLTV-shaped fixture: 1 map, team A wins 3-1 with mixed win types.
// Row 0 = team A outcomes, row 1 = team B; only winner's row carries an icon.
const FIXTURE = `
<div class="teamsBox">
  <div class="team"><div class="teamName">Alpha</div></div>
  <div class="team"><div class="teamName">Bravo</div></div>
</div>
<div class="mapholder">
  <div class="mapname">Mirage</div>
  <div class="results-team-score">3</div>
  <div class="results-team-score">1</div>
  <div class="round-history-team-row">
    <img class="round-history-outcome" src="/img/ct_win.svg">
    <img class="round-history-outcome" src="/img/emptyHistory.svg">
    <img class="round-history-outcome" src="/img/bomb_defused.svg">
    <img class="round-history-outcome" src="/img/t_win.svg">
  </div>
  <div class="round-history-team-row">
    <img class="round-history-outcome" src="/img/emptyHistory.svg">
    <img class="round-history-outcome" src="/img/bomb_exploded.svg">
    <img class="round-history-outcome" src="/img/emptyHistory.svg">
    <img class="round-history-outcome" src="/img/emptyHistory.svg">
  </div>
</div>`;

test("parseSeries emits contract-valid output", () => {
  const s = parseSeries(FIXTURE, { event: "Test Cup" });
  assertValid(s); // throws on violation
});

test("parseSeries reads teams, score, winner", () => {
  const s = parseSeries(FIXTURE);
  assert.equal(s.teams.a.name, "Alpha");
  assert.equal(s.teams.b.name, "Bravo");
  assert.equal(s.maps[0].score.a, 3);
  assert.equal(s.maps[0].score.b, 1);
  assert.equal(s.maps[0].winner, "a");
  assert.equal(s.format, "bo1");
});

test("round history decodes winner and win type per round", () => {
  const { rounds } = parseSeries(FIXTURE).maps[0];
  assert.equal(rounds.length, 4);
  assert.deepEqual(rounds.map((r) => r.winner), ["a", "b", "a", "a"]);
  assert.deepEqual(rounds.map((r) => r.winType), [
    "elimination", // ct_win
    "bomb_detonate", // bomb_exploded (B won)
    "bomb_defuse", // bomb_defused
    "elimination" // t_win
  ]);
  assert.equal(rounds[1].bombPlant, true);
  assert.equal(rounds[2].bombPlant, true);
  assert.equal(rounds[0].bombPlant, false);
});

test("maps with non-numeric score ('-') are dropped, output stays valid", () => {
  // regression: a TBD/not-played map row has score "-"; parseInt -> NaN, which
  // previously slipped past the `=0` default and produced `score.a must be integer`.
  const withTbd = `
    <div class="teamsBox"><div class="team"><div class="teamName">A</div></div>
      <div class="team"><div class="teamName">B</div></div></div>
    <div class="mapholder"><div class="mapname">Mirage</div>
      <div class="results-team-score">13</div><div class="results-team-score">9</div></div>
    <div class="mapholder"><div class="mapname">Nuke</div>
      <div class="results-team-score">-</div><div class="results-team-score">-</div></div>`;
  const s = parseSeries(withTbd);
  assertValid(s); // must not throw
  assert.equal(s.maps.length, 1);
  assert.equal(s.maps[0].name, "Mirage");
});

test("sample-match.json is valid against the contract", () => {
  const sample = JSON.parse(
    readFileSync(new URL("../../data/sample-match.json", import.meta.url), "utf8")
  );
  assert.ok(isValid(sample), "data/sample-match.json must satisfy the schema");
  assert.equal(sample.maps.length, 3);
  assert.equal(sample.maps[2].decider, true);
  assert.equal(sample.maps[2].overtime, true);
});
