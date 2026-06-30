import * as cheerio from "cheerio";

// Parse an HLTV match page (HTML string) into a contract-shaped series object.
//
// HLTV selectors below are best-effort against the public match-page structure
// and MUST be verified against a real saved page (see scrape.js --html). They
// are isolated here so tuning them never touches scrape.js or the contract.
//
// The round-history icons encode both the WINNER and the win TYPE:
//   ct_win / t_win        -> elimination (won by that side)
//   bomb_exploded         -> bomb_detonate (T win)
//   bomb_defused          -> bomb_defuse  (CT win)
//   stopwatch             -> time         (CT win, time ran out)

const ICON_WINTYPE = {
  ct_win: "elimination",
  t_win: "elimination",
  bomb_exploded: "bomb_detonate",
  bomb_defused: "bomb_defuse",
  stopwatch: "time"
};

function iconKey(src = "") {
  const m = src.match(/([a-z_]+)\.svg/i);
  return m ? m[1].toLowerCase() : "";
}

export function parseSeries(html, { sourceUrl = "", event = "", color = {} } = {}) {
  const $ = cheerio.load(html);

  const teamNames = $(".teamsBox .teamName")
    .map((_, el) => $(el).text().trim())
    .get();
  const [nameA = "Team A", nameB = "Team B"] = teamNames;

  const series = {
    event: event || $(".event a").first().text().trim() || "Unknown event",
    date: $(".timeAndEvent .date").first().text().trim() || undefined,
    sourceUrl: sourceUrl || undefined,
    teams: {
      a: { name: nameA, color: color.a || "#e4b343" },
      b: { name: nameB, color: color.b || "#3a6ea5" }
    },
    seriesScore: { a: 0, b: 0 },
    maps: []
  };

  const mapHolders = $(".mapholder").toArray();

  mapHolders.forEach((el, idx) => {
    const $m = $(el);
    const name = $m.find(".mapname").text().trim() || `Map ${idx + 1}`;
    const scores = $m
      .find(".results-team-score")
      .map((_, s) => parseInt($(s).text().trim(), 10))
      .get();
    const [scoreA, scoreB] = scores;
    // skip maps not played / TBD: score cells absent or non-numeric ("-")
    if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) return;
    const winner = scoreA > scoreB ? "a" : "b";
    const overtime = scoreA > 12 + 1 && scoreB > 12 ? true : scoreA + scoreB > 24;

    const rounds = parseRoundHistory($, $m);

    series.maps.push({
      name,
      score: { a: scoreA, b: scoreB },
      winner,
      overtime,
      decider: false, // set after, only if it was the last played map of a deciding series
      rounds: rounds.length ? rounds : [{ n: 1, winner }]
    });

    if (winner === "a") series.seriesScore.a++;
    else series.seriesScore.b++;
  });

  // mark decider: last map, and series was actually decided by it
  if (series.maps.length > 1) {
    series.maps[series.maps.length - 1].decider = true;
  }

  series.format = series.maps.length >= 4 ? "bo5" : series.maps.length >= 2 ? "bo3" : "bo1";

  return series;
}

// Read the round-history strip for a map. HLTV renders two rows (team1, team2);
// only the winning team's row carries a non-empty outcome icon per round.
function parseRoundHistory($, $m) {
  const rows = $m.find(".round-history-team-row").toArray();
  if (rows.length < 2) return [];

  const cellsA = $(rows[0]).find(".round-history-outcome").toArray();
  const cellsB = $(rows[1]).find(".round-history-outcome").toArray();
  const n = Math.max(cellsA.length, cellsB.length);
  const rounds = [];

  for (let i = 0; i < n; i++) {
    const ka = iconKey($(cellsA[i]).attr("src"));
    const kb = iconKey($(cellsB[i]).attr("src"));
    const aWon = ka && ka !== "emptyhistory";
    const key = aWon ? ka : kb;
    if (!key || key === "emptyhistory") continue;

    const roundNo = i + 1;
    const winner = aWon ? "a" : "b";
    const half = roundNo <= 12 ? 1 : roundNo <= 24 ? 2 : 3 + Math.floor((roundNo - 25) / 3);
    const winType = ICON_WINTYPE[key] || "unknown";
    rounds.push({
      n: roundNo,
      half,
      winner,
      winType,
      bombPlant: winType === "bomb_detonate" || winType === "bomb_defuse"
    });
  }
  return rounds;
}
