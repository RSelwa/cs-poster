// fixtures/generate.mjs — génère des matchs fictifs au format de parseMapStats() (core.js).
// Équipes et joueurs tier 1 réels, scores et stats inventés. Déterministe : même graine → mêmes fichiers.
//
//   node fixtures/generate.mjs
//
// Chaque fichier = { version: 2, maps: [...] }, à déposer dans l'interface.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = path.dirname(fileURLToPath(import.meta.url));
const HOUR = 3600e3;

const TEAMS = {
  vitality: { name: 'Vitality', players: [['apEX', 0.8], ['ZywOo', 1.35], ['ropz', 1.1], ['flameZ', 1.0], ['mezii', 0.85]] },
  spirit: { name: 'Team Spirit', players: [['chopper', 0.75], ['donk', 1.4], ['zont1x', 0.95], ['sh1ro', 1.1], ['zweih', 0.9]] },
  mouz: { name: 'MOUZ', players: [['Brollan', 1.0], ['torzsi', 1.15], ['Jimpphat', 1.05], ['xertioN', 1.0], ['Spinx', 0.9]] },
  faze: { name: 'FaZe', players: [['karrigan', 0.7], ['frozen', 1.05], ['broky', 1.1], ['rain', 0.95], ['EliGE', 1.05]] },
  navi: { name: 'Natus Vincere', players: [['Aleksib', 0.75], ['iM', 1.05], ['b1t', 1.0], ['w0nderful', 1.15], ['jL', 1.05]] },
  falcons: { name: 'Falcons', players: [['NiKo', 1.2], ['m0NESY', 1.3], ['kyousuke', 1.0], ['TeSeS', 0.9], ['Magisk', 0.85]] },
  mongolz: { name: 'The MongolZ', players: [['bLitz', 0.85], ['Techno', 1.0], ['mzinho', 1.15], ['910', 1.1], ['Senzu', 1.0]] },
  furia: { name: 'FURIA', players: [['FalleN', 0.8], ['yuurih', 1.0], ['KSCERATO', 1.1], ['YEKINDAR', 1.05], ['molodoy', 1.1]] },
  g2: { name: 'G2', players: [['huNter-', 1.0], ['malbsMd', 1.05], ['HeavyGod', 1.1], ['SunPayus', 1.0], ['MATYS', 0.85]] },
  aurora: { name: 'Aurora', players: [['XANTARES', 1.15], ['woxic', 1.05], ['MAJ3R', 0.75], ['wicadia', 1.05], ['jottAAA', 1.0]] },
};

// score : [équipe gauche, équipe droite]. phases (facultatif) : tranches de rounds [gagnés gauche, gagnés droite]
// jouées dans l'ordre, pour imposer un scénario (remontée…). swap : HLTV affiche les équipes dans l'autre ordre.
const MATCHES = [
  {
    file: 'vitality-spirit-bo5-final.json', seed: 101, matchId: 990001, event: 'IEM Cologne 2026 — Grande finale (fictif)',
    date: Date.UTC(2026, 6, 26, 15), teams: ['vitality', 'spirit'],
    maps: [
      { map: 'Mirage', score: [13, 9], startCT0: true },
      { map: 'Ancient', score: [10, 13], startCT0: false },
      { map: 'Inferno', score: [16, 14], startCT0: true, swap: true },
      { map: 'Nuke', score: [7, 13], startCT0: false },
      { map: 'Dust2', score: [13, 11], startCT0: true },
    ],
  },
  {
    file: 'mouz-faze-bo3-semi.json', seed: 202, matchId: 990002, event: 'BLAST Open Lisbon 2026 — Demi-finale (fictif)',
    date: Date.UTC(2026, 3, 11, 13), teams: ['mouz', 'faze'],
    maps: [
      { map: 'Anubis', score: [13, 6], startCT0: false },
      { map: 'Train', score: [11, 13], startCT0: true },
      { map: 'Mirage', score: [19, 17], startCT0: false },
    ],
  },
  {
    file: 'navi-falcons-bo3-stomp.json', seed: 303, matchId: 990003, event: 'ESL Pro League Season 23 — Quart de finale (fictif)',
    date: Date.UTC(2026, 2, 19, 17), teams: ['navi', 'falcons'],
    maps: [
      { map: 'Nuke', score: [3, 13], startCT0: true, momentum: 2.4 },
      { map: 'Inferno', score: [5, 13], startCT0: false, momentum: 2.4, swap: true },
    ],
  },
  {
    file: 'mongolz-furia-bo1-double-ot.json', seed: 404, matchId: 990004, event: 'BLAST Major 2026 — Stage 2 (fictif)',
    date: Date.UTC(2026, 5, 7, 10), teams: ['mongolz', 'furia'],
    maps: [{ map: 'Ancient', score: [19, 16], startCT0: false }],
  },
  {
    file: 'g2-aurora-bo3-comeback.json', seed: 505, matchId: 990005, event: 'IEM Dallas 2026 — Phase de groupes (fictif)',
    date: Date.UTC(2026, 4, 22, 19), teams: ['g2', 'aurora'],
    maps: [
      { map: 'Dust2', score: [8, 13], startCT0: true },
      { map: 'Anubis', score: [13, 11], startCT0: false, phases: [[3, 11], [9, 0], [1, 0]] },
      { map: 'Train', score: [13, 10], startCT0: true },
    ],
  },
];

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Découpage par défaut d'un score en tranches valides (MR12, prolongations MR3).
function defaultPhases([a, b]) {
  const win = a > b ? 0 : 1, W = Math.max(a, b), L = Math.min(a, b);
  const side = (w, l) => (win === 0 ? [w, l] : [l, w]);
  if (W === 13) return [side(12, L), side(1, 0)];
  const ots = (W - 13) / 3;
  if (!Number.isInteger(ots) || ots < 1 || L - 12 - 3 * (ots - 1) > 2) throw new Error(`score impossible : ${a}-${b}`);
  return [[12, 12], ...Array.from({ length: ots - 1 }, () => [3, 3]), side(3, L - 12 - 3 * (ots - 1)), side(1, 0)];
}

// Tirage des vainqueurs avec effet de série : l'équipe qui vient de gagner est favorisée.
function winnersFor(phases, momentum, rnd) {
  const out = [];
  for (const [c0, c1] of phases) {
    const left = [c0, c1];
    while (left[0] + left[1] > 0) {
      const last = out[out.length - 1];
      const w0 = left[0] * (last === 0 ? momentum : 1), w1 = left[1] * (last === 1 ? momentum : 1);
      const w = rnd() * (w0 + w1) < w0 ? 0 : 1;
      left[w]--; out.push(w);
    }
  }
  return out;
}

const team0IsCT = (i, startCT0) => (i < 12 ? startCT0 : i < 24 ? !startCT0 : (Math.floor((i - 24) / 3) % 2 === 0) === startCT0);
const pick = (rnd, table) => { let r = rnd(); for (const [v, p] of table) { if ((r -= p) < 0) return v; } return table[table.length - 1][0]; };
const CT_WINS = [['ct_win', 0.55], ['bomb_defused', 0.27], ['stopwatch', 0.18]];
const T_WINS = [['t_win', 0.6], ['bomb_exploded', 0.4]];

// Morts par round : le perdant est presque toujours décimé, sauf s'il sauve après la bombe ou le temps.
function roundDeaths(type, winner, rnd) {
  const saved = type === 'bomb_exploded' || type === 'stopwatch';
  const loser = saved ? 2 + Math.floor(rnd() * 4) : type === 'bomb_defused' ? 3 + Math.floor(rnd() * 3) : 5;
  const won = pick(rnd, [[0, 0.12], [1, 0.3], [2, 0.3], [3, 0.2], [4, 0.08]]);
  return winner === 0 ? [won, loser] : [loser, won];
}

function distribute(total, weights, rnd) {
  const sum = weights.reduce((a, b) => a + b, 0), out = weights.map(() => 0);
  for (let k = 0; k < total; k++) { let r = rnd() * sum, i = 0; while ((r -= weights[i]) > 0 && i < weights.length - 1) i++; out[i]++; }
  return out;
}

function playerStats(roster, kills, deaths, n, rnd) {
  const pk = distribute(kills, roster.map(([, s]) => s * (0.88 + rnd() * 0.24)), rnd);
  const pd = distribute(deaths, roster.map(([, s]) => (1.5 - 0.5 * s) * (0.9 + rnd() * 0.2)), rnd);
  return roster.map(([name], i) => {
    const kpr = pk[i] / n, dpr = pd[i] / n;
    const adr = +(kpr * 112 + 6 + (rnd() - 0.5) * 8).toFixed(1);
    const kast = +Math.max(52, Math.min(90, 72 + (kpr - dpr) * 30 + (rnd() - 0.5) * 10)).toFixed(1);
    const rating = +Math.max(0.35, 1 + (kpr - 0.68) * 1.4 - (dpr - 0.68) * 0.95 + (adr - 76) * 0.004).toFixed(2);
    return { name, kills: pk[i], hs: Math.round(pk[i] * (0.35 + rnd() * 0.25)), assists: Math.round(kills * 0.05 + rnd() * 5), deaths: pd[i], kast, adr, rating };
  });
}

// Inverse l'ordre des équipes, comme HLTV le fait parfois d'une map à l'autre.
const swapTeams = (m) => ({
  ...m,
  teams: [m.teams[1], m.teams[0]],
  rounds: m.rounds.map((r) => ({ ...r, winner: 1 - r.winner, score: [r.score[1], r.score[0]] })),
  players: [m.players[1], m.players[0]],
  halves: m.halves.map(([a, b]) => [b, a]),
});

function buildMap(match, spec, idx, rnd) {
  const winners = winnersFor(spec.phases || defaultPhases(spec.score), spec.momentum ?? 1.7, rnd);
  const score = [0, 0], deaths = [0, 0], halves = [[0, 0], [0, 0]], ot = [0, 0];
  const rounds = winners.map((w, i) => {
    const winCT = (w === 0) === team0IsCT(i, spec.startCT0);
    const type = pick(rnd, winCT ? CT_WINS : T_WINS);
    const d = roundDeaths(type, w, rnd);
    deaths[0] += d[0]; deaths[1] += d[1];
    score[w]++;
    (i < 12 ? halves[0] : i < 24 ? halves[1] : ot)[w]++;
    return { n: i + 1, winner: w, side: winCT ? 'CT' : 'T', type, score: [score[0], score[1]] };
  });
  if (score[0] !== spec.score[0] || score[1] !== spec.score[1]) throw new Error(`${spec.map} : ${score} ≠ ${spec.score}`);
  const [t0, t1] = match.teams.map((k) => TEAMS[k]);
  const n = rounds.length;
  const map = {
    version: 1, source: 'fake', mapStatsId: match.matchId * 100 + idx + 1, matchId: match.matchId,
    event: match.event, date: match.date + idx * 1.1 * HOUR, map: spec.map,
    teams: [
      { name: t0.name, score: score[0], startSide: spec.startCT0 ? 'CT' : 'T' },
      { name: t1.name, score: score[1], startSide: spec.startCT0 ? 'T' : 'CT' },
    ],
    halves: n > 24 ? [...halves, ot] : halves,
    rounds,
    players: [playerStats(t0.players, deaths[1], deaths[0], n, rnd), playerStats(t1.players, deaths[0], deaths[1], n, rnd)],
  };
  return spec.swap ? swapTeams(map) : map;
}

// Libellé du sélecteur : score de la série (ou de la map en BO1) dans l'ordre des équipes de la fiche.
function labelFor(match, maps) {
  const [a, b] = match.teams.map((k) => TEAMS[k].name);
  const won = (name, m) => m.teams.find((t) => t.name === name).score > m.teams.find((t) => t.name !== name).score;
  const score = maps.length > 1 ? [a, b].map((n) => maps.filter((m) => won(n, m)).length) : [a, b].map((n) => maps[0].teams.find((t) => t.name === n).score);
  return `${a} ${score[0]}–${score[1]} ${b} · ${match.event.replace(' (fictif)', '')}`;
}

// fixtures.js : tous les matchs dans une balise <script>, lisible aussi quand index.html est ouvert en file://
const bundle = [];
for (const match of MATCHES) {
  const rnd = mulberry32(match.seed);
  const maps = match.maps.map((spec, i) => buildMap(match, spec, i, rnd));
  await fs.writeFile(path.join(OUT_DIR, match.file), JSON.stringify({ version: 2, maps }, null, 2) + '\n');
  bundle.push({ file: match.file, label: labelFor(match, maps), maps });
  console.log(`${match.file} : ${maps.map((m) => `${m.map} ${m.teams[0].name} ${m.teams[0].score}-${m.teams[1].score} ${m.teams[1].name}`).join(' · ')}`);
}
await fs.writeFile(path.join(OUT_DIR, 'fixtures.js'), `// Généré par fixtures/generate.mjs — ne pas modifier à la main.\nwindow.HLTV_FIXTURES = ${JSON.stringify(bundle)};\n`);
