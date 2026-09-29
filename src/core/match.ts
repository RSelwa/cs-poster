// Match = plusieurs maps mises bout à bout, et les statistiques qu'on en tire (drame, rounds clés).
import type { KeyRound, MapData, Match, MatchRound, MapInfo, Pair } from './types.ts';

const sameTeam = (a: string, b: string) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

// Aligne chaque map sur l'ordre d'équipes de la première, puis met les rounds bout à bout.
export function buildMatch(rawMaps: MapData[]): Match {
  const maps = rawMaps.slice().sort((a, b) => (a.date || 0) - (b.date || 0) || (a.mapStatsId || 0) - (b.mapStatsId || 0));
  const names: Pair<string> = [maps[0].teams[0].name, maps[0].teams[1].name];
  const aligned = maps.map((m): MapData => {
    const swap = !sameTeam(m.teams[0].name, names[0]) && sameTeam(m.teams[1].name, names[0]);
    if (!swap) return m;
    return {
      ...m,
      teams: [m.teams[1], m.teams[0]],
      rounds: m.rounds.map((r) => ({ ...r, winner: 1 - r.winner, score: [r.score[1], r.score[0]], kills: r.kills ? r.kills.map((k) => ({ team: 1 - k.team, t: k.t })) : r.kills })),
      players: [m.players[1] || [], m.players[0] || []],
      halves: (m.halves || []).map((h) => [h[1], h[0]]),
    };
  });
  const rounds: MatchRound[] = [], mapInfo: MapInfo[] = [];
  aligned.forEach((m, mi) => {
    mapInfo.push({ map: m.map, score: [m.teams[0].score, m.teams[1].score], mapStatsId: m.mapStatsId, start: rounds.length, len: m.rounds.length });
    m.rounds.forEach((r, ri) => rounds.push({ ...r, map: mi, mapRound: ri + 1, n: rounds.length + 1 }));
  });
  const roundsWon = [0, 1].map((t) => aligned.reduce((a, m) => a + m.teams[t].score, 0));
  const mapsWon = [0, 1].map((t) => aligned.filter((m) => m.teams[t].score > m.teams[1 - t].score).length);
  const series = aligned.length > 1;
  return {
    version: 2, source: aligned[0].source, event: aligned[0].event, date: aligned[0].date, matchId: aligned[0].matchId || null,
    series, teams: [0, 1].map((t) => ({ name: names[t], score: series ? mapsWon[t] : roundsWon[t], rounds: roundsWon[t] })) as Match['teams'],
    rounds, maps: aligned, mapInfo,
  };
}

export function teamTotals(match: Match) {
  return [0, 1].map((t) => {
    let kills = 0; const adrs: number[] = [];
    match.maps.forEach((m) => {
      const ps = m.players?.[t] || [];
      kills += ps.reduce((a, p) => a + (p.kills || 0), 0);
      const v = ps.map((p) => p.adr).filter((x): x is number => x != null);
      if (v.length) adrs.push(v.reduce((a, b) => a + b, 0) / v.length);
    });
    return { kills, adr: adrs.length ? adrs.reduce((a, b) => a + b, 0) / adrs.length : null };
  });
}

function mapDrama(m: MapData) {
  const R = m.rounds, n = R.length;
  if (!n) return 0;
  const fin = R[n - 1].score, diff = Math.abs(fin[0] - fin[1]);
  const closeness = 1 - Math.min(1, Math.max(0, (diff - 1) / 12));
  const ot = n > 24 ? 0.6 + 0.4 * Math.min(1, (n - 24) / 12) : 0;
  let lead = 0, changes = 0, lateChanges = 0;
  const maxDef = [0, 0];
  R.forEach((r, i) => {
    const l = Math.sign(r.score[0] - r.score[1]);
    if (l !== 0 && lead !== 0 && l !== lead) { changes++; if (i > n * 0.75) lateChanges++; }
    if (l !== 0) lead = l;
    maxDef[0] = Math.max(maxDef[0], r.score[1] - r.score[0]);
    maxDef[1] = Math.max(maxDef[1], r.score[0] - r.score[1]);
  });
  const win = fin[0] > fin[1] ? 0 : 1;
  const comeback = Math.min(1, maxDef[win] / 8);
  const score = 0.30 * closeness + 0.25 * ot + 0.20 * Math.min(1, changes / 8) + 0.15 * comeback + 0.10 * Math.min(1, lateChanges / 3);
  return Math.max(0, Math.min(1, score));
}

// Drame du match : moyenne des maps, poids du meilleur moment, et suspense de la série (2–1 > 2–0)
export function computeDrama(match: Match) {
  const ds = match.maps.map(mapDrama);
  if (!ds.length) return 0;
  if (ds.length === 1) return ds[0];
  const mean = ds.reduce((a, b) => a + b, 0) / ds.length;
  const wins = [0, 1].map((t) => match.teams[t].score);
  const seriesClose = 1 - Math.min(1, (Math.abs(wins[0] - wins[1]) - 1) / Math.max(1, Math.max(wins[0], wins[1])));
  return Math.max(0, Math.min(1, 0.55 * mean + 0.2 * Math.max(...ds) + 0.25 * seriesClose));
}

// Rounds « clés » (points de gravité invisibles) : pistols, prolongations, série cassée, dernier round de chaque map
export function keyRounds(match: Match, streakMin: number) {
  const out = new Map<number, KeyRound>();
  const add = (i: number, kind: string, mass: number) => { const cur = out.get(i); if (!cur || cur.mass < mass) out.set(i, { i, kind, mass }); };
  match.maps.forEach((m, mi) => {
    const info = match.mapInfo[mi], off = info.start, n = m.rounds.length;
    if (n > 0) add(off, 'pistol', 0.8);
    if (n > 12) add(off + 12, 'pistol', 0.8);
    for (let i = 24; i < n; i += 6) add(off + i, 'ot', 0.9);
    let run = 0, runTeam = -1;
    m.rounds.forEach((r, i) => {
      if (r.winner === runTeam) run++; else { if (run >= streakMin) add(off + i, 'streak', 0.55 + 0.08 * run); run = 1; runTeam = r.winner; }
    });
    const last = mi === match.maps.length - 1;
    if (n > 0) add(off + n - 1, last ? 'final' : 'mapend', last ? 1.7 : 1.1);
  });
  return [...out.values()].sort((a, b) => a.i - b.i);
}
