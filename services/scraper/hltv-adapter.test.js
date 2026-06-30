import { test } from "node:test";
import assert from "node:assert/strict";
import { toSeries, outcomeInfo, reconstructFromHalves, cleanMapName } from "./hltv-adapter.js";
import { assertValid } from "./validate.js";

test("cleanMapName strips de_ and capitalizes", () => {
  assert.equal(cleanMapName("de_mirage"), "Mirage");
  assert.equal(cleanMapName("de_dust2"), "Dust2");
});

test("reconstructFromHalves keeps real totals/per-half counts, spreads evenly", () => {
  // Mirage from match 2395002: halves [{4,8},{4,5}] -> a=8, b=13, 21 rounds
  const r = reconstructFromHalves([{ team1Rounds: 4, team2Rounds: 8 }, { team1Rounds: 4, team2Rounds: 5 }], false);
  assert.equal(r.length, 21);
  assert.equal(r.filter((x) => x.winner === "a").length, 8);
  assert.equal(r.filter((x) => x.winner === "b").length, 13);
  // first half = rounds 1..12, all half 1
  assert.equal(r.filter((x) => x.half === 1).length, 12);
  assert.deepEqual(r.map((x) => x.n).slice(0, 3), [1, 2, 3]);
  // even spread: not all of one team bunched first (mix within first 4)
  const firstFour = r.slice(0, 4).map((x) => x.winner);
  assert.ok(firstFour.includes("a") && firstFour.includes("b"), "wins interleaved, not bunched");
});

test("toSeries falls back to half reconstruction when stats are missing", () => {
  const noStats = {
    id: 1,
    team1: { id: 1, name: "A" },
    team2: { id: 2, name: "B" },
    maps: [
      { name: "de_mirage", statsId: 9, result: { team1TotalRounds: 8, team2TotalRounds: 13, halfResults: [{ team1Rounds: 4, team2Rounds: 8 }, { team1Rounds: 4, team2Rounds: 5 }] } }
    ]
  };
  const s = toSeries({ match: noStats, mapStatsById: {} }); // no stats -> reconstruct
  assertValid(s);
  assert.equal(s.maps[0].name, "Mirage");
  assert.equal(s.maps[0].rounds.length, 21);
});

test("outcomeInfo decodes side + win type, robust to enum spelling", () => {
  assert.deepEqual(outcomeInfo("CTWin"), { winType: "elimination", ctSideWon: true });
  assert.deepEqual(outcomeInfo("t_win"), { winType: "elimination", ctSideWon: false });
  assert.deepEqual(outcomeInfo("BombDefused"), { winType: "bomb_defuse", ctSideWon: true });
  assert.deepEqual(outcomeInfo("bomb_exploded"), { winType: "bomb_detonate", ctSideWon: false });
  assert.deepEqual(outcomeInfo("stopwatch"), { winType: "time", ctSideWon: true });
  assert.equal(outcomeInfo("emptyHistory"), null);
  assert.equal(outcomeInfo(""), null);
});

// team1 id=1 (a), team2 id=2 (b)
const match = {
  id: 2306295,
  title: "Alpha vs Bravo",
  date: 1754800000000,
  significance: "Grand Final",
  format: { type: "bo3" },
  event: { name: "IEM Cologne 2025" },
  team1: { id: 1, name: "Alpha" },
  team2: { id: 2, name: "Bravo" },
  maps: [
    { name: "Mirage", statsId: 111, result: { team1TotalRounds: 13, team2TotalRounds: 11, halfResults: [] } },
    { name: "Inferno", statsId: 222, result: { team1TotalRounds: 9, team2TotalRounds: 13, halfResults: [] } },
    { name: "Nuke", statsId: 0, result: null } // not played
  ]
};

const mapStatsById = {
  111: {
    roundHistory: [
      { outcome: "CTWin", ctTeam: 1, tTeam: 2 }, // a is CT, ct won -> a, elim
      { outcome: "BombExploded", ctTeam: 1, tTeam: 2 }, // t won -> b, detonate, plant
      { outcome: "emptyHistory", ctTeam: 1, tTeam: 2 }, // padding, skipped
      { outcome: "TWin", ctTeam: 2, tTeam: 1 }, // sides swapped, a is T, t won -> a, elim
      { outcome: "BombDefused", ctTeam: 2, tTeam: 1 } // a is T, ct won -> b, defuse, plant
    ],
    playerStats: {
      team1: [{ player: { name: "alpha1", id: 9 }, kills: 24, deaths: 16, ADR: 88.37, rating2: 1.21 }],
      team2: [{ player: { name: "bravo1", id: 7 }, kills: 18, deaths: 20, ADR: 70.1, rating1: 0.95 }]
    }
  },
  222: { roundHistory: [], playerStats: { team1: [], team2: [] } }
};

test("toSeries emits contract-valid output", () => {
  assertValid(toSeries({ match, mapStatsById }));
});

test("only played maps; series score counted from map wins", () => {
  const s = toSeries({ match, mapStatsById });
  assert.equal(s.maps.length, 2); // Nuke dropped (not played)
  assert.deepEqual(s.seriesScore, { a: 1, b: 1 });
  assert.equal(s.format, "bo3");
  assert.equal(s.event, "IEM Cologne 2025");
  assert.equal(s.date, "2025-08-10");
});

test("round history decodes winner, side and win type", () => {
  const { rounds } = toSeries({ match, mapStatsById }).maps[0];
  assert.equal(rounds.length, 4); // empty cell skipped
  assert.deepEqual(rounds.map((r) => r.winner), ["a", "b", "a", "b"]);
  assert.deepEqual(rounds.map((r) => r.winType), [
    "elimination",
    "bomb_detonate",
    "elimination",
    "bomb_defuse"
  ]);
  assert.deepEqual(rounds.map((r) => r.bombPlant), [false, true, false, true]);
  assert.equal(rounds[0].side.a, "CT"); // a started CT
  assert.equal(rounds[2].side.a, "T"); // sides swapped after the empty cell
});

test("player ADR/rating mapped; rating2 preferred over rating1", () => {
  const { players } = toSeries({ match, mapStatsById }).maps[0];
  const a1 = players.find((p) => p.name === "alpha1");
  assert.equal(a1.team, "a");
  assert.equal(a1.adr, 88.4);
  assert.equal(a1.rating, 1.21);
  const b1 = players.find((p) => p.name === "bravo1");
  assert.equal(b1.rating, 0.95); // fell back to rating1
});
