# CLAUDE.md — cs2-posters

Generative CS2 match posters from bo3.gg data. One poster per match: every map's rounds laid
end to end on one 3:4 canvas, painted as brush strokes (no markers, no icons). A server watches
tier 1 matches and renders each poster a few minutes after the match ends; a React editor tunes
them by hand.

Personal side project. **Not `flim-monorepo`**: the flim rules in `~/.claude/rules/` (Firebase,
Next, vitest, `develop` branch, gitmoji) do not apply here. Git repo, branch `main`, no remote.
A database is planned: everything persistent goes through `server/store.ts`.

## Run

```sh
pnpm install
pnpm dev         # server (API + watcher, node --watch) on :4173 + Vite editor on :5173 (proxies /api, /posters)
pnpm build       # tsc -b + vite build → dist/
pnpm start       # production: one server on :4173 serves dist/, the API, posters, and runs the watcher
```

Server env: `PORT` (4173, also read by `vite.config.ts` for the proxy), `TIERS` (`s`), `WATCH`
(`0` disables the watcher), `WATCH_INTERVAL_S` (120), `WATCH_LOOKBACK_H` (12), `POSTER_SIZE` (2400).

Stack: Vite 8 + React 19 + TypeScript 6 (strict) + Tailwind 4 + shadcn (`radix-nova`, Radix,
lucide). Server: Hono on `@hono/node-server`, run by **Node's native type stripping** (Node ≥ 23,
no tsx, no build): server code must stay erasable TS (`erasableSyntaxOnly`: no enums, no
parameter properties) and relative imports carry the `.ts` extension. Headless rendering needs
Chrome or `npx playwright install chromium`.

## Files

| path | role |
| ---- | ---- |
| `src/core/` | the poster engine, pure TS, no DOM beyond the canvas it is handed, **shared by the editor and the server**. `types.ts` (JSON map format + assembled `Match`), `match.ts` (`buildMatch`, `teamTotals`, `computeDrama`, `keyRounds`), `render.ts` (`renderPoster`, `DEFAULTS`, `THEMES`, `defaultColors`), `noise.ts` (RNG), `demo.ts`, `fonts.ts`, `index.ts` (entry bundled for the headless page). Imports inside use relative `.ts` paths, never `@/`, so Node can load `fonts.ts` / types from here |
| `src/app.tsx` | editor state (loaded matches, current match, params, status) and the 3-column layout |
| `src/components/` | editor panels: `bo3-matches` (tier 1 list from the API), `import-zone`, `fixture-picker`, `loaded-matches` (+ `round-strip`), `poster-canvas` (480 px then 1000 px preview), `controls-panel` (`SLIDERS` / `TOGGLES` / export), `param-slider`, `how-to-read` |
| `src/components/ui/` | shadcn-generated (`pnpm dlx shadcn@latest add …`). Leave as generated |
| `src/lib/` | `api.ts` + `api-types.ts` (API contract, types also imported by the server), `loaded-matches.ts` (grouping maps into matches, JSON import), `fixtures.ts` (`import.meta.glob` of `fixtures/*.json`), `download.ts`, `utils.ts` (shadcn `cn`) |
| `server/index.ts` | Hono app: `GET /api/matches` (recent finished matches + poster url), `GET /api/matches/:slug` (maps, or `{ ready: false, reason }`), `/posters/*`, `dist/` in production; starts the watcher |
| `server/bo3.ts` | bo3.gg JSON API (`api.bo3.gg/api/v1`, undocumented, no Cloudflare, plain `fetch`, ≥ 1 s apart) → maps in the project format. **All bo3.gg field names live here.** Per-round per-team kills (`game_round_team_clans[].kills`) go into `round.kills` as `{team}` without `t`. A game is ready when `state === 'done'`, all `rounds_count` rounds are there and 10 player stats |
| `server/matches.ts` | recent list (60 s memory cache, merged with the poster index) and `loadMatch` (disk cache first) |
| `server/watcher.ts` | every interval: finished matches of `TIERS` ended within the lookback and without a poster → render once ready (~10–20 min after the end, demos parsed), else retry next pass |
| `server/render.ts` | bundles `src/core/index.ts` once with Vite's `build()` (IIFE, `window.PosterCore`, `write: false`), headless Chromium draws it with Google Fonts + `LOCAL_FONTS` (embedded as `data:`), `DEFAULTS` + `defaultColors` → PNG buffer |
| `server/team-colors.ts` + `team-colors.json` | team colors hand-picked per bo3 team id: `{ id, name, primary, secondary }`, top 50 of the bo3 ranking. `loadMatch` writes `primary` into `MapTeam.color` before caching the match; a team absent from the file gets `null` → palette. `secondary` is not read yet (planned: clash fallback) |
| `server/store.ts` | **the persistence boundary**, today files in `data/` (gitignored): `data/matches/<slug>.json` (maps of a fully parsed match, immutable), `data/posters/<slug>.png` and `data/posters.json` (index by bo3 match id). Swap this module for the DB |
| `fixtures/` | fake tier-1 matches as import JSON (`{ version: 2, label, maps }`, `source: "fake"`, events suffixed "(fictif)"). `pnpm fixtures` regenerates them deterministically; scenarios are in `generate.mjs` → `MATCHES` |

## Data flow

1. **List** — `listFinished` (tier filter `filter[matches.tier][in]=s`) → `/api/matches` → editor list.
2. **Fetch** — `fetchMatch(slug)`: match → each finished game → `/games/{id}` (rounds) +
   `/games/{id}/players_stats`. Not ready → reason string, retried later. Ready → cached forever.
3. **Group** — the editor groups maps into matches by `matchId`, else by sorted team names +
   event (`groupKey`). Re-adding a `mapStatsId` replaces it.
4. **Build** — `buildMatch()` sorts maps by date, re-aligns team order to map 1 (swaps rounds,
   scores, kills, players, halves), concatenates rounds, computes `mapInfo`, series score.
5. **Render** — `renderPoster(ctx, W, H, match, params, fonts)`, in the editor or headless.

## Renderer model (`renderPoster`)

- A `cols × rows` grid maps chronological time: slot 0 = first round of map 1, last slot = last
  round of last map.
- Each **kill** is an event → spawns strokes. If rounds carry `kills: [{team, t?}]` (bo3.gg data
  does, without `t`), they are used as-is and a missing `t` is drawn from `rnd`. Otherwise
  `estimateMapKills()` spreads each team's total kills over rounds (winners get more).
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
- **Debug lines** (`showLines`, switch "Traits sans peinture (debug)"): the warped strokes drawn as thin
  team-colored lines on bare paper, no blur / composite / flecks. Strokes still go through `paintStroke`, so
  `rnd` is consumed the same way: the lines are exactly the geometry of the painted poster for that seed.
- Visual reference: gencup.art posters (e.g. `~/Downloads/10-ned.jpg`: final + debug view).
- Cost: ~200 ms at 480 px, ~340 ms at 1000 px, ~1.9 s at 3540 px export. The per-pixel
  composite dominates at export size.
- Determinism: same `seed` + same data → same poster. Two RNG streams: `rnd` drives geometry,
  `rp` drives the grain only. Don't cross them, or tweaking the grain will move strokes.
- Themes: `paper` (multiply) / `ink` (screen, team colors lifted).
- Team colors: `defaultColors(match.teams)` takes each team's `color` when present, else the `PAIRS` palette (hashed on names). Two colors closer than `CLASH_DISTANCE` (RGB): team 1 gets the palette color farthest from team 0's.
- Background text (`showBgData`): `bgText: 'data'` (match JSON, mono, default) or `'players'` (nicknames of both teams, uppercase sans, repeated).
- Parameters: `PosterParams` + `DEFAULTS` in `src/core/render.ts`. Editor sliders are declared in
  `SLIDERS` / `TOGGLES` in `src/components/controls-panel.tsx` — a new param needs both.
- The TS port of the old `core.js` was checked pixel-identical on all fixtures, both themes. Any
  change to `render.ts` / `match.ts` / `noise.ts` changes every poster: say so.

## JSON format

Export: `{ "version": 2, "maps": [ …one per map… ] }` (`MatchExport` in `src/core/types.ts`).
Import also accepts a bare map or an array; `rounds` and `teams` are required.

## Conventions (as found)

- UI copy, comments, error messages and README are **French**. Keep new UI strings in French.
- Own code: dense one-liner style, 2-space indent, semicolons, single quotes, `.ts` extensions on
  relative imports. Components are arrow consts, kebab-case filenames. shadcn files keep their
  generated style (double quotes, no semicolons).
- Local fonts: file in `public/fonts/`, entry in `LOCAL_FONTS` (`src/core/fonts.ts`, `weight` may be a range for a variable font), family put first in the wanted role of `FONTS` (`serif`: title and score, `sans`: texts and player background, `mono`: footer and data background). The editor loads it from `/fonts/`, the headless renderer reads it from disk.
- Styling: Tailwind utilities on shadcn tokens (`src/index.css`: grey-green ground, light panels,
  ink `#1c2420`, `--paper` for the sheet). Fonts: Familjen Grotesk (sans), Instrument Serif,
  DM Mono — the same three the poster uses.
- Preview render at 480 px then 1000 px (debounced 260 ms); editor export up to 3540 × 4720
  (30 × 40 cm @ 300 dpi); watcher posters at `POSTER_SIZE`.

## Checking a change

```sh
pnpm typecheck   # tsc -b: app, vite config, server
pnpm lint        # oxlint (3 warnings in shadcn-generated ui/ files are expected)
```

No test suite yet. `pnpm dev` is safe to run: headless only, it calls bo3.gg (≥ 1 s between
requests), no HLTV, no visible window. `WATCH=0` when you don't want posters rendered.

## Open questions / to improve

<!-- fill in together -->
- Goal of the project (print? social posts? gallery?)
- Which database, and what moves into it first (posters index, match cache, per-match params)?
- Real kill timings within a round (bo3.gg gives per-round counts, not timestamps)?
- bo3.gg is unofficial: fall back to GRID Open Access if it breaks?
