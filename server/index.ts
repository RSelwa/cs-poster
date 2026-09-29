// index.ts — serveur : API pour l'éditeur, posters rendus, et watcher des matchs tier 1.
// En production (NODE_ENV=production) il sert aussi l'éditeur compilé (dist/). En dev, Vite sert l'éditeur
// et redirige /api et /posters ici.
//
// Variables : PORT (4173), TIERS (s), WATCH (1 ; 0 pour couper), WATCH_INTERVAL_S (120), WATCH_LOOKBACK_H (12),
// POSTER_SIZE (2400).

import fs from 'node:fs/promises';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import type { MatchList } from '../src/lib/api-types.ts';
import { listRecent, loadMatch } from './matches.ts';
import { closeRenderer } from './render.ts';
import { POSTERS_DIR, SLUG } from './store.ts';
import { startWatcher } from './watcher.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const env = process.env;
const PORT = Number(env.PORT || 4173);
const TIERS = (env.TIERS || 's').split(',');
const PROD = env.NODE_ENV === 'production';

const app = new Hono();

app.get('/api/matches', async (c) => c.json({ matches: await listRecent(TIERS) } satisfies MatchList));

app.get('/api/matches/:slug', async (c) => {
  const slug = c.req.param('slug');
  if (!SLUG.test(slug)) return c.json({ error: 'slug invalide' }, 400);
  return c.json(await loadMatch(slug));
});

await fs.mkdir(POSTERS_DIR, { recursive: true });
app.use('/posters/*', serveStatic({ root: path.relative(process.cwd(), POSTERS_DIR), rewriteRequestPath: (p) => p.replace(/^\/posters/, '') }));
app.all('/posters/*', (c) => c.notFound());
app.all('/api/*', (c) => c.notFound());

if (PROD) {
  const dist = path.relative(process.cwd(), path.join(ROOT, 'dist'));
  app.use('/*', serveStatic({ root: dist }));
  app.get('*', serveStatic({ path: path.join(dist, 'index.html') }));
}

app.onError((err, c) => c.json({ error: err.message }, 500));

serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' }, (info) => console.log(`serveur : http://localhost:${info.port}${PROD ? '' : ' (API ; éditeur servi par Vite)'}`));

if (env.WATCH !== '0') {
  startWatcher({
    tiers: TIERS,
    intervalMs: Number(env.WATCH_INTERVAL_S || 120) * 1000,
    lookbackMs: Number(env.WATCH_LOOKBACK_H || 12) * 3600e3,
    size: Number.parseInt(env.POSTER_SIZE || '2400', 10),
  });
}

const shutdown = async () => { await closeRenderer(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
