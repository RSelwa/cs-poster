// Pure: gigobyte/HLTV objects -> contract-shaped series. No network here, so
// it is unit-tested with mock lib objects in hltv-adapter.test.js.
//
// Source data:
//   getMatch -> teams, map list (+ per-map statsId), format, event, date
//   getMatchMapStats(statsId) per map -> roundHistory[] + playerStats
//
// roundHistory entries carry the winning SIDE (via outcome) and the CT/T team
// ids for that round, so we recover both the winning team and the side each
// team played. Clutch/ace counts are not exposed by the lib -> those attractors
// degrade to bomb plants (see layout.js).

// Robust to enum string differences across lib versions: match on substrings,
// not exact values. Returns win type + whether the CT side won the round.
export function outcomeInfo(raw) {
  const s = String(raw || "").toLowerCase().replace(/[^a-z]/g, "");
  if (!s || s.includes("empty")) return null; // not played / padding cell
  if (s.includes("defus")) return { winType: "bomb_defuse", ctSideWon: true };
  if (s.includes("explod")) return { winType: "bomb_detonate", ctSideWon: false };
  if (s.includes("stopwatch") || s.includes("timeran") || s === "time")
    return { winType: "time", ctSideWon: true };
  if (s.startsWith("ct")) return { winType: "elimination", ctSideWon: true };
  if (s.startsWith("t")) return { winType: "elimination", ctSideWon: false };
  return { winType: "unknown", ctSideWon: true };
}

function halfOf(n, overtime) {
  if (n <= 12) return 1;
  if (n <= 24) return 2;
  return overtime ? 3 + Math.floor((n - 25) / 3) : 2;
}

// "de_mirage" -> "Mirage", "de_dust2" -> "Dust2"
export function cleanMapName(raw) {
  return String(raw || "")
    .replace(/^de_/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Fallback when getMatchMapStats is Cloudflare-blocked: getMatch still gives
// per-half round counts. We know how many rounds each team won in each half and
// the total, but NOT the exact order within a half, so we spread the wins
// evenly (deterministic). Band length / per-half splits / totals are real;
// within-half ordering and win types are synthesized (no winType, no plant).
export function reconstructFromHalves(halfResults, overtime) {
  const rounds = [];
  let n = 0;
  (halfResults || []).forEach((h, idx) => {
    const half = idx + 1;
    let ai = 0;
    let bi = 0;
    const aw = h.team1Rounds || 0;
    const bw = h.team2Rounds || 0;
    for (let k = 0; k < aw + bw; k++) {
      // give the next round to whichever team is most "owed" vs its quota
      const pickA = bw === 0 || (aw > 0 && ai / aw <= bi / bw);
      if (pickA) ai++;
      else bi++;
      n++;
      rounds.push({ n, half: overtime ? half : Math.min(half, 2), winner: pickA ? "a" : "b" });
    }
  });
  return rounds;
}

function num(v) {
  return Number.isFinite(v) ? v : undefined;
}

function toPlayer(team, ps) {
  const out = { team, name: ps?.player?.name || "?" };
  if (Number.isFinite(ps?.kills)) out.kills = ps.kills;
  if (Number.isFinite(ps?.deaths)) out.deaths = ps.deaths;
  const adr = num(ps?.ADR);
  if (adr !== undefined) out.adr = Math.round(adr * 10) / 10;
  const rating = num(ps?.rating2) ?? num(ps?.rating1);
  if (rating !== undefined) out.rating = rating;
  return out;
}

function mapRounds(roundHistory, team1Id, overtime) {
  const rounds = [];
  let n = 0;
  for (const ro of roundHistory || []) {
    const info = outcomeInfo(ro.outcome);
    if (!info) continue; // skip empty/padding cells
    n += 1;
    const aIsCt = ro.ctTeam === team1Id;
    const winnerTeamId = info.ctSideWon ? ro.ctTeam : ro.tTeam;
    rounds.push({
      n,
      half: halfOf(n, overtime),
      winner: winnerTeamId === team1Id ? "a" : "b",
      side: { a: aIsCt ? "CT" : "T", b: aIsCt ? "T" : "CT" },
      winType: info.winType,
      bombPlant: info.winType === "bomb_detonate" || info.winType === "bomb_defuse"
    });
  }
  return rounds;
}

export function toSeries({ match, mapStatsById = {}, colors = {} }) {
  const t1 = match.team1 || {};
  const t2 = match.team2 || {};

  const series = {
    event: match.event?.name || match.title || "Unknown event",
    stage: match.significance || undefined,
    date: match.date ? new Date(match.date).toISOString().slice(0, 10) : undefined,
    sourceUrl: `https://www.hltv.org/matches/${match.id}/-`,
    teams: {
      a: { name: t1.name || "Team 1", color: colors.a || "#e4b343" },
      b: { name: t2.name || "Team 2", color: colors.b || "#3a6ea5" }
    },
    seriesScore: { a: 0, b: 0 },
    maps: []
  };

  const played = (match.maps || []).filter(
    (m) => m.result && Number.isInteger(m.result.team1TotalRounds)
  );

  played.forEach((m, idx) => {
    const a = m.result.team1TotalRounds;
    const b = m.result.team2TotalRounds;
    const winner = a > b ? "a" : "b";
    const overtime = a > 13 || b > 13;
    const stats = mapStatsById[m.statsId];

    // prefer true round-by-round from stats; fall back to half-count reconstruction
    let rounds = mapRounds(stats?.roundHistory, t1.id, overtime);
    if (!rounds.length) rounds = reconstructFromHalves(m.result.halfResults, overtime);
    const players = [
      ...(stats?.playerStats?.team1 || []).map((p) => toPlayer("a", p)),
      ...(stats?.playerStats?.team2 || []).map((p) => toPlayer("b", p))
    ];

    series.maps.push({
      name: cleanMapName(m.name),
      score: { a, b },
      winner,
      overtime,
      decider: idx === played.length - 1 && played.length > 1,
      rounds: rounds.length ? rounds : [{ n: 1, winner }],
      ...(players.length ? { players } : {})
    });

    if (winner === "a") series.seriesScore.a += 1;
    else series.seriesScore.b += 1;
  });

  series.format =
    match.format?.type?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
    (played.length >= 4 ? "bo5" : played.length >= 2 ? "bo3" : "bo1");
  if (!["bo1", "bo3", "bo5"].includes(series.format)) {
    series.format = played.length >= 4 ? "bo5" : played.length >= 2 ? "bo3" : "bo1";
  }

  return series;
}
