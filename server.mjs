// server.mjs — sert l'interface et récupère les pages HLTV pour elle.
//
// HLTV est derrière Cloudflare : un simple fetch() reçoit un 403. On ouvre donc un vrai Chrome
// (fenêtre visible, profil persistant) : si un captcha apparaît, on le résout une fois à la main
// et le cookie est gardé pour les fois suivantes.
//
// Politesse : cache disque (une page n'est demandée qu'une fois) + 2 s minimum entre deux requêtes.

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const CACHE_DIR = path.join(ROOT, '.cache');
const PROFILE_DIR = path.join(ROOT, '.browser-profile');
const MIN_DELAY_MS = 2000;
const CF_TIMEOUT_MS = 120_000;

const ALLOWED = /^https:\/\/www\.hltv\.org\/(matches|stats\/matches)\/[^\s]*$/;
const STATIC = { '/': 'index.html', '/index.html': 'index.html', '/core.js': 'core.js', '/fixtures/fixtures.js': 'fixtures/fixtures.js' };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

await fs.mkdir(CACHE_DIR, { recursive: true });

let contextPromise = null;
function getContext() {
  if (!contextPromise) {
    contextPromise = (async () => {
      const opts = { headless: false, viewport: { width: 1200, height: 800 } };
      try { return await chromium.launchPersistentContext(PROFILE_DIR, { ...opts, channel: 'chrome' }); }
      catch { return await chromium.launchPersistentContext(PROFILE_DIR, opts); } // Chromium fourni par Playwright
    })();
  }
  return contextPromise;
}

// File d'attente : une requête réseau à la fois, espacées de MIN_DELAY_MS
let queue = Promise.resolve();
let lastRequestAt = 0;
function enqueue(task) {
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_DELAY_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try { return await task(); } finally { lastRequestAt = Date.now(); }
  });
  queue = run.catch(() => {});
  return run;
}

async function fetchWithBrowser(url) {
  const ctx = await getContext();
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const t0 = Date.now();
    // Cloudflare affiche « Just a moment… » / « Un instant… » tant que le défi n'est pas passé
    while (Date.now() - t0 < CF_TIMEOUT_MS) {
      const title = (await page.title()).toLowerCase();
      const challenged = /just a moment|un instant|attention required|verify/.test(title);
      if (!challenged) break;
      await page.waitForTimeout(1000);
    }
    if (/just a moment|un instant|attention required|verify/.test((await page.title()).toLowerCase())) {
      throw new Error('Cloudflare bloque la page. Résous le captcha dans la fenêtre Chrome qui vient de s’ouvrir, puis relance.');
    }
    await page.waitForLoadState('load', { timeout: 30_000 }).catch(() => {});
    return await page.content();
  } finally {
    await page.close().catch(() => {});
  }
}

async function getHtml(url) {
  const key = crypto.createHash('sha1').update(url).digest('hex');
  const file = path.join(CACHE_DIR, `${key}.html`);
  try { return { html: await fs.readFile(file, 'utf8'), cached: true }; } catch { /* pas en cache */ }
  const html = await enqueue(() => fetchWithBrowser(url));
  if (html.length > 5000) await fs.writeFile(file, html);
  return { html, cached: false };
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://localhost:${PORT}`);

    if (u.pathname === '/api/ping') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true}'); }

    if (u.pathname === '/api/html') {
      const target = u.searchParams.get('url') || '';
      if (!ALLOWED.test(target)) { res.writeHead(400); return res.end('URL refusée : seules les pages hltv.org/matches/… et hltv.org/stats/matches/… sont acceptées.'); }
      const { html, cached } = await getHtml(target);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'x-cache': cached ? 'hit' : 'miss' });
      return res.end(html);
    }

    const file = STATIC[u.pathname];
    if (file) {
      const body = await fs.readFile(path.join(ROOT, file));
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] });
      return res.end(body);
    }
    res.writeHead(404); res.end('Not found');
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(String(err?.message || err));
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`Interface : http://localhost:${PORT}`));
process.on('SIGINT', async () => { try { (await contextPromise)?.close(); } catch {} process.exit(0); });
