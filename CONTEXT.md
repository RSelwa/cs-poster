# cs-poster — working context

Project notes that travel with the repo (multi-device). Read this first when resuming.

## What this is

Generative posters from CS2 match data, **one poster per series** (Bo3/Bo5). Inspired by Zeh Fernandes' World Cup posters: <https://zehfernandes.com/posts/how-i-turned-world-cup-data-into-posters>. Standard: actually beautiful, not "works". Reference images live in `refs/` (05-grid, 07-events, 07-lines, 08-gravity.mp4, 09-drama.mp4, 10-ned.jpg — the final is the dense orange/blue gradient on cream).

### The model (decided with the user — matches his look)

- **One continuous grid for the whole series. 1 cell = 1 round.** All rounds of all maps fill cells in reading order (left→right, top→bottom), chronological, **no break between maps**.
- **Grid footprint is fixed** (`gridH`), cells subdivide to hold however many rounds: fixed `cols` (8), `rows = ceil(total/cols)`, cell height shrinks as rounds grow.
- Each cell emits brush strokes in the **round-winner's color**, flowing **left (team A) / right (team B)**, long sweeps integrated through the gravity field so they curve. Many thin low-opacity strokes on a **cream ground** (#f4f0e7) → they blend into an airbrushed gradient; orange+blue overlap darkens (multiply).
- **Gravity wells = "important" rounds** (his = shots). Ours: map-clinch round (always), aces/clutches if present, **mocked clutches** (seeded ~60% round of a map when it has no real clutch — flagged `clutch*`), pistols minor. Wells drawn faint (circle+crosshair+label) or hidden; lines orbit them.
- **Very little text**: tiny map tags, faint well labels, a small boxed score block bottom-right (teams + series score + format/event/date). No big header.

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

Implementation: `buildField()` returns `angleAt(x,y,baseDir)` = base dir + Σ attractors `pull*radial + swirl*(0.4+drama)*tangential`, falloff `(1-d/r)²`, + ambient curl. `trace()` walks the field into a ~25-pt polyline **with per-point pressure** (`[x,y,pressure]`, tapered `sin(πt)`: thin ends, full middle — uniform width is what made it look like dead tubes). `sketch.js`: `brush.set(brushName, colorWithAlpha, weight); brush.spline(points, curvature)` with native `curveVertex` fallback.

### Why brush.spline, NOT brush.flowLine (decided after reading p5.brush source)

p5.brush's field integration is `heading = field_angle − plotAngle` (`src/core/flowfield.js`) — the field **replaces** direction. One global field therefore can't give team A leftward AND team B rightward flow simultaneously. So `layout.js` owns the field (deterministic, testable, bidirectional) and emits polylines; `sketch.js` just paints them. Do not "fix" this by switching to native flowLine.

### p5.brush real API (from source, for reference)
`brush.instance(p)`, `brush.load()`, `brush.scaleBrushes(s)`, `brush.set(name,color,weight)`, `brush.pick(name)`, `brush.spline(points,curvature)` (points may be `[x,y,pressure]`), `brush.flowLine(x,y,len,dir)`, `brush.field(name)`/`brush.addField(name,(t,field)=>field,{angleMode})`, `brush.fill/bleed/hatch/...`. Built-in brushes: `spray, marker, marker2, 2B, HB, 2H, cpencil, pen, rotring, charcoal, hatch_brush`. Custom `brush.add(name,{type,scatter,grain,opacity,spacing,pressure,...})` — image type needs an asset (avoid, CSP).

### Live parameter panel (Zeh's "interface to iterate")
`index.html` has a left `#panel`; `sketch.js` `buildPanel()` makes sliders bound to `layout.js DEFAULTS` (`swirl, pull, ambient, baseLen, strokesPerRound, taper, slotW, bandH, step`) + render-only controls (`brush` select, `opacity`, `curvature`, `brushScale`, bg-texture toggle). Any change re-runs `computePoster` + repaints. This is how we converge on the look — tune live, then bake good values into DEFAULTS.

Tunable knobs: `layout.js` `DEFAULTS` (exported) → `cols`, `strokesPerCell`, `baseLenFrac`, `lenVar`, `swirl`, `pull`, `ambient`, `taper`, `wellRadiusFrac`, `step`, `gridH`, `mockClutches`. All exposed as live panel sliders.

### Headless preview (my eyes — no browser in the agent session)

`node services/renderer/preview.mjs <data.json> <out.svg> '<optsJSON>'` writes a zero-dep SVG of the layout polylines (no spray grain, just composition), then `magick -background "#f4f0e7" out.svg out.png` rasterizes it to a PNG I can read. Use this to verify sweep/density/gravity before claiming the look. node-canvas was tried and abandoned (native build needs system libs / pnpm blocks build scripts). Examples saved: `out/preview-sample.png` (orange/blue, looks like his), `out/preview-real.png` (FURIA black / Falcons green).

Background data texture: faint repeated map scores + round W/L glyphs behind the canvas (`.bg-data`, z-index 0; canvas z-1; text overlay z-2 — explicit stacking fixes the old bug where the opaque canvas hid the header).

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
- Renderer rewritten to the grid-of-rounds model on cream ground (see model above). Composition validated via headless SVG preview — matches his look (orange/blue sweeps, gravity swirl, blend). 21 tests pass.
- View: `pnpm render` → <http://localhost:5173/?data=/data/m2395002.json> (hard-refresh after JS edits). Sample (orange/blue, prettiest): <http://localhost:5173/>. Tune with the left panel; bake good slider values into `layout.js DEFAULTS`.
- Open tuning Qs for the user: line fineness/count, swirl strength (the tight whorls at wells), whether to crank density further toward the fully-blended gradient of his final.

### Open / next

- Tune the look (swirl/density/length/spacing) per user feedback.
- Real match has no plant/clutch/ace → attractors only from match dynamics (decisive round + biggest streak); fewer/softer than sample.
- No per-round kills (layout defaults to 5).
- Background data-texture layer not built.
- p5.brush browser render not eye-verified in-session (no browser); native fallback exists.
- **Not committed** — user rule: never commit by yourself.
