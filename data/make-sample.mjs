// Deterministic synthetic series, valid against contracts/match.schema.json.
// Lets the renderer be built and tested before the live scraper is wired.
// Run: node data/make-sample.mjs   ->   data/sample-match.json
import { writeFileSync } from "node:fs";

// seeded LCG so kills-per-round is varied but reproducible (no Math.random)
let seed = 1337;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const ri = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

// build rounds for a map given final score and side assignment per half
function rounds({ aScore, bScore, otHalves = 0 }) {
  const out = [];
  const total = aScore + bScore;
  let a = 0, b = 0, n = 0;
  // regulation: 24 rounds max in MR12 (12 per half), sides swap at round 13
  const reg = Math.min(total, otHalves ? 24 : total);
  for (n = 1; n <= reg; n++) {
    const half = n <= 12 ? 1 : 2;
    // team a is T first half, CT second half (arbitrary but consistent)
    const side = half === 1 ? { a: "T", b: "CT" } : { a: "CT", b: "T" };
    const winner = a < aScore && (b >= bScore || rnd() > 0.5) ? "a" : "b";
    if (winner === "a") a++; else b++;
    out.push(round(n, half, winner, side));
  }
  // overtime: MR3 (3 per half), sides swap each half, half index 3+
  let ot = 0;
  while (n <= total) {
    const otHalf = Math.floor(ot / 3);
    const half = 3 + otHalf;
    const side = otHalf % 2 === 0 ? { a: "T", b: "CT" } : { a: "CT", b: "T" };
    const winner = a < aScore && (b >= bScore || rnd() > 0.5) ? "a" : "b";
    if (winner === "a") a++; else b++;
    out.push(round(n, half, winner, side));
    n++; ot++;
  }
  return out;
}

function round(n, half, winner, side) {
  const types = ["elimination", "bomb_detonate", "bomb_defuse", "time"];
  const winType = types[ri(0, 3)];
  return {
    n, half, winner, side,
    winType,
    bombPlant: winType === "bomb_detonate" || winType === "bomb_defuse" || rnd() > 0.6,
    kills: ri(3, 10)
  };
}

function players(teamA, teamB, mapSeed, clutchRounds = [], aceRounds = []) {
  const mk = (team, name, i) => ({
    team, name,
    kills: ri(12, 28), deaths: ri(12, 24),
    adr: Math.round((60 + rnd() * 50) * 10) / 10,
    rating: Math.round((0.8 + rnd() * 0.6) * 100) / 100,
    clutches: i === 0 && clutchRounds.length ? clutchRounds.map(r => ({ round: r, vs: ri(2, 4) })) : [],
    aces: i === 1 && aceRounds.length ? aceRounds : []
  });
  return [
    ...["p1", "p2", "p3", "p4", "p5"].map((p, i) => mk("a", `${teamA}_${p}`, i)),
    ...["p1", "p2", "p3", "p4", "p5"].map((p, i) => mk("b", `${teamB}_${p}`, i))
  ];
}

const series = {
  event: "IEM Cologne 2025",
  stage: "Grand Final (SAMPLE / synthetic data)",
  date: "2025-08-10",
  sourceUrl: "synthetic",
  format: "bo3",
  teams: {
    a: { name: "Team A", color: "#d2691e" },
    b: { name: "Team B", color: "#2f5fa6" }
  },
  seriesScore: { a: 2, b: 1 },
  maps: [
    {
      name: "Mirage", score: { a: 13, b: 9 }, winner: "a", overtime: false, decider: false,
      rounds: rounds({ aScore: 13, bScore: 9 }),
      players: players("A", "B", 1, [14], [])
    },
    {
      name: "Inferno", score: { a: 11, b: 13 }, winner: "b", overtime: false, decider: false,
      rounds: rounds({ aScore: 11, bScore: 13 }),
      players: players("A", "B", 2, [], [7])
    },
    {
      name: "Nuke", score: { a: 19, b: 16 }, winner: "a", overtime: true, decider: true,
      rounds: rounds({ aScore: 19, bScore: 16, otHalves: 4 }),
      players: players("A", "B", 3, [25, 33], [29])
    }
  ]
};

writeFileSync(new URL("./sample-match.json", import.meta.url), JSON.stringify(series, null, 2));
console.log("wrote data/sample-match.json");
