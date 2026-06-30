import { readFileSync, writeFileSync } from "node:fs";
import { parseSeries } from "./parse.js";
import { assertValid } from "./validate.js";

// Usage:
//   node services/scraper/scrape.js --url  "https://www.hltv.org/matches/.../..." --out data/x.json
//   node services/scraper/scrape.js --html ./saved-match-page.html               --out data/x.json
//   optional: --colorA "#hex" --colorB "#hex" --event "IEM Cologne 2025"
//
// HLTV sits behind Cloudflare; --url may return a 403 challenge page. When it
// does, open the match page in a browser, "Save Page As" HTML, and use --html.
function args() {
  const a = process.argv.slice(2);
  const get = (flag) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return {
    url: get("--url"),
    html: get("--html"),
    out: get("--out") || "data/match.json",
    colorA: get("--colorA"),
    colorB: get("--colorB"),
    event: get("--event")
  };
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9"
    }
  });
  const body = await res.text();
  if (!res.ok || /Just a moment|cf-chl|Cloudflare/i.test(body)) {
    throw new Error(
      `fetch blocked (status ${res.status}). HLTV likely served a Cloudflare challenge. ` +
        `Save the page as HTML in a browser and rerun with --html <file>.`
    );
  }
  return body;
}

async function main() {
  const { url, html, out, colorA, colorB, event } = args();
  if (!url && !html) {
    console.error("need --url <hltv match url> or --html <saved page>");
    process.exit(1);
  }

  const source = html ? readFileSync(html, "utf8") : await fetchHtml(url);
  const series = parseSeries(source, {
    sourceUrl: url || html,
    event,
    color: { a: colorA, b: colorB }
  });

  assertValid(series);
  writeFileSync(out, JSON.stringify(series, null, 2));
  const maps = series.maps.map((m) => `${m.name} ${m.score.a}-${m.score.b}`).join(", ");
  console.log(
    `wrote ${out}: ${series.teams.a.name} ${series.seriesScore.a}-${series.seriesScore.b} ${series.teams.b.name} [${maps}]`
  );
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
