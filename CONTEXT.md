# cs-poster — working context

Project notes that travel with the repo (multi-device). Read this first when resuming.

## What this is

Generative posters from CS2 match data, **one poster per series** (Bo3/Bo5). Each map = a band; band width ∝ round count (a stomp reads thin, an OT war sprawls — the unevenness is the data). Inspired by Zeh Fernandes' World Cup posters: <https://zehfernandes.com/posts/how-i-turned-world-cup-data-into-posters>. Standard: actually beautiful, not "works".

## Tooling

- **pnpm, not npm.** npm errors with `Cannot read properties of null (reading 'isDescendantOf')` on this setup. Use `pnpm install`, `pnpm test`, `pnpm scrape …`, `pnpm render`.
- Node 24, ESM (`"type": "module"`).

## Architecture (services-first, contract at the boundary)

- `contracts/match.schema.json` — the ONLY contract between scraper and renderer. Scraper emits JSON valid against it; renderer draws anything valid against it. Neither reaches into the other.
- `services/scraper/` — HLTV → match JSON.
  - `--match <id>` → gigobyte/HLTV npm `hltv` lib (PREFERRED).
  - `--url` / `--html` → cheerio fallback (`--html` works offline from a saved page).
  - `validate.js` = ajv against the contract; `parse.js` = cheerio; `hltv-adapter.js` = PURE lib→contract (unit-tested); `hltv-fetch.js` = thin network layer.
- `services/renderer/` — match JSON → poster PNG.
  - `layout.js` — **PURE, deterministic, unit-tested.** All field/gravity math. Same input → same output.
  - `sketch.js` — thin p5.brush painter; computes nothing, just strokes the polylines layout produced.
  - `index.html` — pulls p5 / p5.brush / html2canvas from esm.sh CDN (needs internet). Text is DOM overlay; html2canvas snapshots canvas+text into the PNG.
  - `serve.mjs` — static server. `pnpm render` → <http://localhost:5173>.
- `data/make-sample.mjs` → `data/sample-match.json` (synthetic; has real attractors → shows the dense look).

## The visual technique (got it wrong once — don't repeat)

- **Lines = traced flowlines**, not scattered marks. Each stroke starts at its round cell, heads in its team's direction (team A left, team B right), and is integrated step-by-step **through a vector field**, so it curves.
- **Gravity = a SWIRL, not a pull.** Events are gravity points; near one the field gains a **tangential** (orbit) component → lines swirl around it. The radial-only midpoint-yank in v1 was wrong and ugly. More drama → stronger tangential → more swirl.
- **Attractors are INVISIBLE.** The bending is the visualization. Drawing circles at gravity points = debug junk. Deleted.
- Length = pass-share analog → CS2 ADR / round impact. Density = possession analog → round-win share. Background = data written repeatedly as faint texture (not yet built).
- Brush: **p5.brush** (Alejandro Campos Uribe), custom **spray** on **WebGL**.

Implementation: `buildField()` returns `angleAt(x,y,baseDir)` = base dir + Σ attractors `pull*radial + swirl*(0.4+drama)*tangential`, falloff `(1-d/r)²`, + ambient curl. `trace()` walks the field into a ~25-pt polyline. `sketch.js`: `brush.set("spray",color,weight); brush.spline(points,0.5)` with native `curveVertex` fallback.

Tunable knobs: `layout.js` `DEFAULTS` → `swirl`, `pull`, `baseLen`, `strokesPerRound`, `slotW`, `ambient`, `step`, `bandH`, `bandGap`.

## Data-source reality (the recurring blocker)

- `getMatch` **works through Cloudflare** → teams, scores, `halfResults` (per-half round counts).
- `getMatchMapStats` (true round-by-round + win types + plants + player ADR) is **Cloudflare-blocked** from this machine ("Access denied | Cloudflare").
- So the adapter **reconstructs rounds from `halfResults`**: real totals / per-half counts / sides, but within-half order is synthesized and there are no win types / plants. `cleanMapName` turns `de_mirage` → `Mirage`.
- The **M3MONs/hltv-scraper-api** Python repo is a **DEAD END** — its match endpoint returns metadata + final map scores only (less than the npm lib). Do not use it.

### The unlock for full fidelity (not built yet)

Feed the `hltv` lib a Cloudflare clearance cookie via `HLTV.createInstance({ loadPage })` — the `cf_clearance` cookie grabbed once from a browser. ~30 lines, no Python, no new repo. Restores real round order + win types + plants + ADR → more and stronger attractors → more swirl. User has been offered this.

## Status (2026-06-30)

- 20 gate tests pass (`pnpm test`).
- Real match scraped: `data/m2395002.json` = **FURIA 0–3 Falcons** (bo5, Mirage/Anubis/Inferno, all 8–13, 21 rounds each).
- Renderer rewritten to the flow-field technique above. User: "better but still improvements to do" — iterating on the look.
- View: `pnpm render` → <http://localhost:5173/?data=/data/m2395002.json> (hard-refresh after JS edits). Sample (denser, has real attractors): <http://localhost:5173/>.

### Open / next

- Tune the look (swirl/density/length/spacing) per user feedback.
- Real match has no plant/clutch/ace → attractors only from match dynamics (decisive round + biggest streak); fewer/softer than sample.
- No per-round kills (layout defaults to 5).
- Background data-texture layer not built.
- p5.brush browser render not eye-verified in-session (no browser); native fallback exists.
- **Not committed** — user rule: never commit by yourself.
