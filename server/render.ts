// render.ts — rendu d'un poster sans interface : Chromium headless exécute le moteur (src/core) sur un canvas.
//
// Le moteur est empaqueté une fois au démarrage (Vite, format IIFE → window.PosterCore) : même code, mêmes polices,
// mêmes couleurs par équipe que l'éditeur. Un poster rendu ici est identique à l'export PNG de l'éditeur
// avec les réglages par défaut.

import path from 'node:path';
import { chromium, type Browser } from 'playwright';
import { build, type Rolldown } from 'vite';
import { FONTS, FONTS_CSS, FONT_FACES } from '../src/core/fonts.ts';
import type { MapData } from '../src/core/types.ts';

const CORE_ENTRY = path.resolve(import.meta.dirname, '../src/core/index.ts');

let bundlePromise: Promise<string> | null = null;
function getBundle() {
  bundlePromise ??= (async () => {
    const out = await build({
      configFile: false, logLevel: 'silent',
      build: { write: false, minify: false, lib: { entry: CORE_ENTRY, formats: ['iife'], name: 'PosterCore', fileName: 'core' } },
    });
    const outputs = (Array.isArray(out) ? out : [out]) as Rolldown.RolldownOutput[];
    const chunk = outputs.flatMap((o) => o.output).find((o) => o.type === 'chunk');
    if (!chunk || chunk.type !== 'chunk') throw new Error('empaquetage du moteur : aucun fichier produit');
    return chunk.code;
  })();
  return bundlePromise;
}

let browserPromise: Promise<Browser> | null = null;
function getBrowser() {
  browserPromise ??= chromium.launch({ headless: true, channel: 'chrome' }).catch(() => chromium.launch({ headless: true })); // repli : Chromium de Playwright
  return browserPromise;
}

// maps : les maps d'un même match. Retourne le PNG et le drame calculé.
export async function renderPng(maps: MapData[], size = 2400) {
  const [code, browser] = await Promise.all([getBundle(), getBrowser()]);
  const page = await browser.newPage();
  try {
    await page.setContent(`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="${FONTS_CSS}"><canvas id="c"></canvas>`, { waitUntil: 'load' });
    await page.addScriptTag({ content: code });
    const out = await page.evaluate(async ({ maps, W, fonts, faces }) => {
      await Promise.all(faces.map((f) => document.fonts.load(f).catch(() => {})));
      const { buildMatch, renderPoster, DEFAULTS, defaultColors } = (window as unknown as { PosterCore: typeof import('../src/core/index.ts') }).PosterCore;
      const match = buildMatch(maps);
      const c = document.getElementById('c') as HTMLCanvasElement;
      c.width = W; c.height = Math.round((W * 4) / 3);
      const info = renderPoster(c.getContext('2d')!, c.width, c.height, match, { ...DEFAULTS, colors: defaultColors(match.teams.map((t) => t.name)) }, fonts);
      return { png: c.toDataURL('image/png'), drama: info.drama };
    }, { maps, W: size, fonts: FONTS, faces: FONT_FACES });
    return { png: Buffer.from(out.png.split(',')[1], 'base64'), drama: out.drama };
  } finally {
    await page.close().catch(() => {});
  }
}

export async function closeRenderer() {
  if (browserPromise) await (await browserPromise).close().catch(() => {});
  browserPromise = null;
}
