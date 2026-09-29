// Match de démonstration, chargé au démarrage de l'éditeur.
import type { MapData, Pair, Player } from './types.ts';

function makeDemoMap(name: string, seq: string, startCT0: boolean, seed: number, id: number, names: Pair<string>): MapData {
  let sd = seed; const rnd = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
  const rounds: MapData['rounds'] = []; const score = [0, 0];
  for (let i = 0; i < seq.length; i++) {
    const w = +seq[i];
    const ob = Math.floor((i - 24) / 3);
    const team0CT = i < 12 ? startCT0 : i < 24 ? !startCT0 : ((ob % 2 === 0) ? startCT0 : !startCT0);
    const winnerCT = (w === 0) === team0CT;
    const r = rnd();
    const type = winnerCT ? (r < 0.55 ? 'ct_win' : r < 0.85 ? 'bomb_defused' : 'stopwatch') : (r < 0.55 ? 't_win' : 'bomb_exploded');
    score[w]++;
    rounds.push({ n: i + 1, winner: w, side: winnerCT ? 'CT' : 'T', type, score: [score[0], score[1]] });
  }
  const mk = (pre: string, base: number, k: number): Player[] => ['A', 'B', 'C', 'D', 'E'].map((c, i) => ({ name: pre + c, kills: base + ((i * 7 + k) % 9) - 3, hs: 8 + i * 2, assists: 4 + i, deaths: 18 + ((i * 5 + k) % 8), kast: 68 + i * 2, adr: 62 + i * 6 + k, rating: +(0.85 + i * 0.09).toFixed(2) }));
  const scale = seq.length / 24;
  return {
    version: 1, source: 'demo', mapStatsId: id, matchId: 0, event: 'Démo : événement fictif', date: Date.UTC(2026, 5, 20) + (id - 9000) * 3600e3, map: name,
    teams: [{ name: names[0], score: score[0], startSide: startCT0 ? 'CT' : 'T' }, { name: names[1], score: score[1], startSide: startCT0 ? 'T' : 'CT' }],
    halves: [], rounds,
    players: [mk('aur', Math.round(20 * scale), seed % 3), mk('bas', Math.round(18 * scale), (seed + 1) % 3)],
  };
}

// BO3 fictif : 16–14 (prolongation), 8–13, 13–11 → 2–1
export function demoMatch() {
  const n: Pair<string> = ['Team Aurora', 'Team Basalt'];
  return [
    makeDemoMap('Mirage', '001001011001' + '110100110110' + '000110', true, 12345, 9001, n),
    makeDemoMap('Inferno', '110110010110' + '010111011', false, 777, 9002, n),
    makeDemoMap('Nuke', '010011010110' + '101000110100', true, 4242, 9003, n),
  ];
}
