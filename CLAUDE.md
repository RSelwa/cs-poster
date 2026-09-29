# CLAUDE.md — hltv-posters

Generative CS2 match posters from HLTV data. One poster per match: every map's rounds laid
end to end on one 3:4 canvas, painted as brush strokes (no markers, no icons).

Personal side project. **Not `flim-monorepo`**: the flim rules in `~/.claude/rules/` (Firebase,
Next, oxlint, vitest, `develop` branch, gitmoji) do not apply here. Not a git repo.

## Run

```sh
pnpm install     # README says npm; a pnpm-lock.yaml is what's actually present
pnpm start       # node server.mjs → http://localhost:4173 (PORT env overrides)
```

- The server launches a **headed** Chrome (`channel: 'chrome'`, falls back to Playwright's
  Chromium) on a persistent profile in `.browser-profile/`, because HLTV sits behind Cloudflare
  and a plain `fetch` gets 403. A captcha is solved by hand once; the cookie persists.
- `index.html` also works opened from disk (`file://`): no server, the user drops saved HLTV
  pages (`.html`, several at once) or a `.json` export.

No build step, no bundler, no tests, no linter, no TypeScript. Plain ES2020+ in the browser,
ESM in Node (`"type": "module"`). Only dependency: `playwright`.

## Files

| file | role |
| ---- | ---- |
| `core.js` | everything that isn't UI or network: HLTV parser, match assembly, drama score, key rounds, noise/RNG, Canvas 2D renderer. IIFE exporting `HLTVPoster` on `window`, or `module.exports` in Node |
| `index.html` | the whole UI: inline CSS + inline script. Left panel = data, center = poster, right panel = sliders |
| `server.mjs` | static server for `index.html` / `core.js` + `/api/html?url=…` proxy through Playwright |
| `fixtures/` | fake tier-1 matches as import JSON (`source: "fake"`, events suffixed "(fictif)"). Real team/player names, invented scores and stats. `node fixtures/generate.mjs` regenerates them deterministically; scenarios are declared in its `MATCHES`. It also writes `fixtures/fixtures.js` (`window.HLTV_FIXTURES`), loaded by a `<script>` tag so the "Matchs de test" select works from `file://` too — regenerate after editing `MATCHES` |
| `.cache/` | fetched HTML, keyed by `sha1(url)`. Only pages > 5000 chars are cached (skips Cloudflare stubs) |
| `.browser-profile/` | Chrome profile with HLTV / Cloudflare cookies. **Sensitive — never share, commit, or read into context** |

## Data flow

1. **Fetch** — UI posts a URL to `/api/html`. Allowed: `hltv.org/matches/…` and
   `hltv.org/stats/matches/…` only (`ALLOWED` regex). Requests are serialized, ≥ 2 s apart
   (`MIN_DELAY_MS`), Cloudflare challenge polled up to 120 s.
2. **Parse** — a match page → `parseMatchPageLinks()` → each `mapstatsid` page →
   `parseMapStats()`. All HLTV selectors live in `parseMapStats()` (from the open-source
   `gigobyte/HLTV` lib). When HLTV changes its HTML, this is the only place to fix.
3. **Group** — UI groups maps into matches by `matchId`, else by sorted team names + event
   (`groupKey`). Re-adding a `mapStatsId` replaces it.
4. **Build** — `buildMatch()` sorts maps by date, re-aligns team order to map 1 (swaps rounds,
   scores, kills, players, halves), concatenates rounds, computes `mapInfo`, series score.
5. **Render** — `renderPoster(ctx, W, H, match, params, fonts)`.

## Renderer model (`renderPoster`)

- A `cols × rows` grid maps chronological time: slot 0 = first round of map 1, last slot = last
  round of last map.
- Each **kill** is an event → spawns strokes. HLTV has no kill timestamps, so
  `estimateMapKills()` spreads each team's total kills over rounds (winners get more). If a round
  carries `kills: [{team, t}]` in JSON, that's used as-is.
- Each stroke is a **straight horizontal line** starting at its kill: team 0 runs left, team 1
  right (as in the GenCup method, zehfernandes.com/posts/how-i-turned-world-cup-data-into-posters).
  **Stroke length** ∝ team ADR share, **density** ∝ share of rounds won.
- Then **one global warp** (`warp()`) moves every point of every stroke: a gentle low-frequency
  wave (`noise`), then per gravity well a bounded radial pull (`PULL_MAX` < 1, so lines converge
  but never fold) and a twist ∝ drama (`swirl`). Because the same smooth map bends all lines,
  neighbours bend together and never cross or loop. That's the "harmony". Don't go back to
  steering each stroke through a vector field: tried, it gives tangles and tight circles, and
  constraining the steering gives flat parallel waves.
- **Gravity wells** = key rounds (`keyRounds`: pistols, OT starts, broken streaks ≥ `streakMin`,
  map ends, final round) with mass ≥ `GRAVITY_MIN_MASS` (1): map ends, the final round, streaks
  of 6+. Radius `gR` = 35% W. Many small wells (tried: all key rounds at 15% W) make local bumps
  and "drops" of color; a few wide wells make long sweeps. **Drama** (`computeDrama`: closeness,
  OT, lead changes, comeback, series closeness) scales the twist.
- A stroke budget (`200 / events`) keeps a BO3 as dense as a single map.
- **Painting is airbrush, not lines** (visual target: gencup.art, zones of color, no visible
  stroke). Strokes are never drawn on the canvas:
  1. `paintStroke` stamps each step as a band perpendicular to the heading (Gaussian profile,
     half-width from `brush`, tapered by pressure) into a per-team **density grid** (`ink`,
     360 cells wide whatever W is, padded 12% past the edges so paint bleeds off the frame).
  2. `blur` (3 box passes ≈ Gaussian, `0.3 × brush + 3.5% W`) merges the thin strokes into
     smooth gradient zones. Thin brush + wide blur is the target (the reference's debug view is
     many thin lines); a wide brush with a small blur reads as fat "tubes".
  3. Coverage `MAX_INK × (1 − exp(−COVER_GAIN · d / ref))`, `ref` = 98th percentile. Never
     fully solid: inks stay translucent.
  4. **Spray grain**: each grain cell (size from `grain`) perturbs coverage by noise scaled by
     `√(c(1−c))`: strongest at mid-coverage, zero on bare paper. The noise is mostly shared by
     both teams (`SHARED_GRAIN`). Independent noise puts full-strength grains of both inks on
     the same pixel, and they multiply into black specks. Paper gets a light luminance mottle.
  5. **Blend (paper)**: the two inks multiply over the paper, subtractive like real pigment
     (orange × blue → green, red × blue → plum; that third color is wanted). The raw product is
     too dark, so its lightness is lifted toward a plain paint mix (`OVERLAP_LIFT`) and its
     saturation boosted where both inks cover (`OVERLAP_SAT`). `P.blend` (slider "Mélange des
     encres", 0–1.5, default 1) interpolates from a plain paint mix (0, no third color) to this
     result (1) and extrapolates past it. Ink theme: plain screen, `blend` has no effect.
  6. **Flecks**: after the composite, short dark dashes on ~70 kill events and ~320 dust
     specks, from the `rp` stream.
  The composite goes through `getImageData` / `putImageData`, so it overwrites nothing drawn
  after it: background text and grid are painted before, flecks and typography after.
- Visual reference: gencup.art posters (e.g. `~/Downloads/10-ned.jpg`: final + debug view).
- Cost: ~200 ms at 480 px, ~340 ms at 1000 px, ~1.9 s at 3540 px export. The per-pixel
  composite dominates at export size.
- Determinism: same `seed` + same data → same poster. Two RNG streams: `rnd` drives geometry,
  `rp` drives the grain only. Don't cross them, or tweaking the grain will move strokes.
- Themes: `paper` (multiply) / `ink` (screen, team colors lifted).
- Parameters: `DEFAULTS` in `core.js`. UI sliders are declared in `SLIDERS` / `TOGGLES` in
  `index.html` — a new param needs both.

## JSON format

Export: `{ "version": 2, "maps": [ …one per map… ] }`. Import also accepts a bare map or an
array. Minimal map shape is in `README.md`; `rounds` and `teams` are required.

## Conventions (as found)

- UI copy, comments, error messages and README are **French**. Keep new UI strings in French.
- Dense one-liner style, 2-space indent, semicolons, single quotes in JS. `function`
  declarations and arrow consts both used. Match the surrounding file.
- `core.js` stays dependency-free and DOM-optional (`docFactory` param lets Node pass a jsdom
  parser).
- Preview render at 480 px then 1000 px (debounced 260 ms); export sizes up to 3540 × 4720
  (30 × 40 cm @ 300 dpi).

## Checking a change

No automated checks. `node --check core.js server.mjs` for syntax. Rendering is verified by
opening the page (demo match loads automatically) — ask before launching the server, it opens
a real Chrome window and hits HLTV.

## Open questions / to improve

<!-- fill in together -->
- Goal of the project (print? social posts? gallery?)
- Should HLTV parsing get fixture-based tests (saved HTML in `.cache/`)?
- Real kill timings from demo files instead of estimates?
- `npm` vs `pnpm` — pick one and update README
