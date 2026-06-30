# cs-poster

Generative posters from CS2 match data. One poster per **series** (Bo3/Bo5): each map gets a band sized by its round count, so a stomp reads small and an overtime war sprawls. Inspired by [Zeh Fernandes' World Cup posters](https://zehfernandes.com/posts/how-i-turned-world-cup-data-into-posters), translated from football to Counter-Strike.

## Pipeline

```
HLTV match page ──▶ services/scraper ──▶ data/<match>.json ──▶ services/renderer ──▶ out/<match>.png
                     (node + cheerio)      (contracts/match.schema.json)   (p5.js + p5.brush, browser)
```

The boundary between the two services is **`contracts/match.schema.json`**. The scraper's only job is to emit JSON valid against that schema. The renderer's only job is to draw anything valid against it. Neither reaches into the other.

## Football → CS2 mapping

| Zeh's football poster | cs-poster |
|---|---|
| 90 min continuous timeline | discrete rounds (MR12, up to 24 + OT) |
| minute grid cell | round cell |
| home left / away right strokes | TeamA left / TeamB right |
| attempts on goal → strokes | kills per round → strokes |
| pass share → stroke length | ADR / round impact → length |
| possession % → density | round-win share → density |
| goals = gravity attractors | clutches + aces + bomb plants = attractors |
| drama (late goal, penalty) | drama (overtime, eco-win, 1vX clutch, comeback) |
| score big numbers | map score + series score |
| half-time | side switch at round 12 = visual break |

**Map length is proportional, on purpose.** A 13-2 map is a short thin band; a 19-16 OT sprawls. The unevenness is the data.

## Layout (series poster)

- Header: TeamA vs TeamB, series score, event, date
- N vertical-stacked bands, one per map, length ∝ round count
- Per band: round cells, CT/T strokes left/right, kills→density, ADR→length, attractors for clutch/ace/plant/OT
- Decider map gets extra intensity (it won the series)
- Background texture = raw round results printed

## Usage

```bash
npm install

# preferred: gigobyte/HLTV lib by match id (true round-by-round + player ADR)
node services/scraper/scrape.js --match 2306295 --colorA "#e4b343" --colorB "#3a6ea5" --out data/final.json

# fallbacks (cheerio): live URL (may hit Cloudflare) or a saved page
node services/scraper/scrape.js --url  "https://www.hltv.org/matches/.../..." --out data/final.json
node services/scraper/scrape.js --html ./saved-match-page.html               --out data/final.json

# render: serve the repo, open the page, it loads the JSON, click Save PNG
npm run render        # http://localhost:5173  (append ?data=/data/final.json)
```

### Data sources

- **`--match <id>`** (preferred): [gigobyte/HLTV](https://github.com/gigobyte/HLTV) — `getMatch` for the skeleton + `getMatchMapStats` per map for round-by-round outcomes and player ADR/rating. Throttled to minimize Cloudflare risk.
- **`--url` / `--html`** (fallback): cheerio parse of the match page. `--html` works offline from a saved page.

**Known data gaps:** the HLTV lib exposes no per-round kill counts (layout defaults to 5/round) and no clutch/ace counts. So clutch/ace attractors only appear from the cheerio path or hand-edited JSON; otherwise attractors fall back to bomb-plant rounds.

## Tests

```bash
npm test     # gate tests: schema validation + parser fixtures, deterministic, <2s
```
