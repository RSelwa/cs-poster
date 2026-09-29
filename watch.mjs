// watch.mjs — génère un poster peu après la fin de chaque match tier 1.
//
// Toutes les --interval secondes : liste les matchs terminés (bo3.gg) des --tiers demandés, fini depuis moins de
// --lookback heures. Un match est rendu dès que bo3.gg a parsé toutes ses démos (≈ 10–20 min après la fin),
// sinon il est retenté au passage suivant. Les matchs déjà rendus sont notés dans .watch-state.json.
//
//   node watch.mjs                      boucle
//   node watch.mjs --once               un seul passage
//   node watch.mjs --match <slug bo3>   rend ce match tout de suite (ex. vitality-vs-furia-20-09-2026)
//
// Sortie : posters/<date>_<slug>.png + .json (export v2, se dépose dans index.html pour retoucher les réglages).

import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { listFinished, fetchMatch } from './bo3.mjs';
import { renderPng, closeRenderer } from './render.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(ROOT, 'posters');
const STATE_FILE = path.join(ROOT, '.watch-state.json');
const HOUR_MS = 3600e3;

const { values: opt } = parseArgs({
  options: {
    once: { type: 'boolean', default: false },
    match: { type: 'string' },
    tiers: { type: 'string', default: 's' },
    size: { type: 'string', default: '2400' },
    interval: { type: 'string', default: '120' },
    lookback: { type: 'string', default: '12' },
  },
});
const size = Number.parseInt(opt.size, 10);

process.on('SIGINT', async () => { await closeRenderer(); process.exit(0); });

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function loadState() {
  try { return JSON.parse(await fs.readFile(STATE_FILE, 'utf8')); } catch { return { done: {} }; }
}
const saveState = (state) => fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));

async function renderMatch(slug) {
  const r = await fetchMatch(slug);
  if (!r.ready) return { ready: false, reason: r.reason };
  const { png, drama } = await renderPng(r.maps, { size });
  const base = `${(r.match.end_date || r.match.start_date || '').slice(0, 10)}_${slug}`;
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(path.join(OUT_DIR, `${base}.png`), png);
  await fs.writeFile(path.join(OUT_DIR, `${base}.json`), JSON.stringify({ version: 2, maps: r.maps }, null, 2));
  return { ready: true, file: `posters/${base}.png`, drama };
}

async function pass(state) {
  const since = Date.now() - Number(opt.lookback) * HOUR_MS;
  const recent = (await listFinished({ tiers: opt.tiers.split(',') })).filter((m) => Date.parse(m.end_date) > since && !state.done[m.id]);
  if (!recent.length) { log('rien de nouveau'); return; }
  for (const m of recent) {
    try {
      const res = await renderMatch(m.slug);
      if (!res.ready) { log(`attente  ${m.slug} : ${res.reason}`); continue; }
      state.done[m.id] = { slug: m.slug, file: res.file, at: new Date().toISOString() };
      await saveState(state);
      log(`poster   ${res.file} (drame ${res.drama.toFixed(2)})`);
    } catch (err) {
      log(`erreur   ${m.slug} : ${err.message}`);
    }
  }
}

try {
  if (opt.match) {
    const res = await renderMatch(opt.match);
    log(res.ready ? `poster   ${res.file} (drame ${res.drama.toFixed(2)})` : `pas prêt : ${res.reason}`);
  } else {
    const state = await loadState();
    log(`surveillance bo3.gg : tiers ${opt.tiers}, toutes les ${opt.interval} s, ${size} px`);
    do {
      try { await pass(state); } catch (err) { log(`erreur   liste des matchs : ${err.message}`); }
      if (!opt.once) await new Promise((r) => setTimeout(r, Number(opt.interval) * 1000));
    } while (!opt.once);
  }
} finally {
  await closeRenderer();
}

