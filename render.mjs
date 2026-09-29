// render.mjs — rendu d'un poster sans interface : Chromium headless charge core.js et dessine sur un canvas.
//
// Même moteur que index.html (renderPoster, Canvas 2D), mêmes polices, mêmes couleurs par équipe :
// un poster rendu ici est identique à l'export PNG de l'interface avec les réglages par défaut.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CORE = path.join(ROOT, 'core.js');
const FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Familjen+Grotesk:wght@400;500;600&family=DM+Mono&display=swap';
const FONTS = { serif: "'Instrument Serif', Georgia, serif", sans: "'Familjen Grotesk', system-ui, sans-serif", mono: "'DM Mono', ui-monospace, monospace" };
const FACES = ['1em "Instrument Serif"', '500 1em "Familjen Grotesk"', '600 1em "Familjen Grotesk"', '1em "DM Mono"'];

let browserPromise = null;
function getBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      try { return await chromium.launch({ headless: true, channel: 'chrome' }); }
      catch { return await chromium.launch({ headless: true }); } // Chromium fourni par Playwright
    })();
  }
  return browserPromise;
}

// maps : maps au format du projet (celles d'un même match). Retourne le PNG et le drame calculé.
export async function renderPng(maps, { size = 2400, params = {} } = {}) {
  const page = await (await getBrowser()).newPage();
  try {
    await page.setContent(`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="${FONTS_CSS}"><canvas id="c"></canvas>`, { waitUntil: 'load' });
    await page.addScriptTag({ path: CORE });
    const out = await page.evaluate(async ({ maps, W, params, fonts, faces }) => {
      await Promise.all(faces.map((f) => document.fonts.load(f).catch(() => {})));
      const { buildMatch, renderPoster, DEFAULTS, defaultColors } = window.HLTVPoster;
      const match = buildMatch(maps);
      const P = Object.assign({}, DEFAULTS, { colors: defaultColors(match.teams.map((t) => t.name)) }, params);
      const c = document.getElementById('c'); c.width = W; c.height = Math.round((W * 4) / 3);
      const info = renderPoster(c.getContext('2d'), c.width, c.height, match, P, fonts);
      return { png: c.toDataURL('image/png'), drama: info.drama };
    }, { maps, W: size, params, fonts: FONTS, faces: FACES });
    return { png: Buffer.from(out.png.split(',')[1], 'base64'), drama: out.drama };
  } finally {
    await page.close().catch(() => {});
  }
}

export async function closeRenderer() {
  if (browserPromise) await (await browserPromise).close().catch(() => {});
  browserPromise = null;
}
