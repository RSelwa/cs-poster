// watcher.ts — génère un poster peu après la fin de chaque match tier 1.
//
// À chaque passage : matchs terminés des tiers demandés, finis depuis moins de lookbackMs et sans poster.
// Un match est rendu dès que bo3.gg a parsé toutes ses démos (≈ 10–20 min après la fin), sinon il est retenté
// au passage suivant.

import { listRecentBo3, loadMatch } from './matches.ts';
import { renderPng } from './render.ts';
import { listPosters, savePoster } from './store.ts';

export type WatchOptions = { tiers: string[]; intervalMs: number; lookbackMs: number; size: number };

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), '[watch]', ...a);

async function pass({ tiers, lookbackMs, size }: WatchOptions) {
  const since = Date.now() - lookbackMs;
  const [matches, posters] = await Promise.all([listRecentBo3(tiers), listPosters()]);
  const todo = matches.filter((m) => m.end_date && Date.parse(m.end_date) > since && !posters[m.id]);
  for (const m of todo) {
    try {
      const r = await loadMatch(m.slug);
      if (!r.ready) { log(`attente  ${m.slug} : ${r.reason}`); continue; }
      const { png, drama } = await renderPng(r.maps, size);
      const saved = await savePoster({ matchId: m.id, slug: m.slug, drama, size }, png);
      log(`poster   data/posters/${saved.file} (drame ${drama.toFixed(2)})`);
    } catch (err) {
      log(`erreur   ${m.slug} : ${(err as Error).message}`);
    }
  }
}

export function startWatcher(opts: WatchOptions) {
  log(`tiers ${opts.tiers.join(',')}, toutes les ${opts.intervalMs / 1000} s, ${opts.size} px`);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await pass(opts); } catch (err) { log(`erreur   liste des matchs : ${(err as Error).message}`); }
    running = false;
  };
  tick();
  const timer = setInterval(tick, opts.intervalMs);
  return () => clearInterval(timer);
}
