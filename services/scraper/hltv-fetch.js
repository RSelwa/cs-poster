// Thin network layer over gigobyte/HLTV. Not unit-tested (hits the network);
// all transformation logic lives in the pure hltv-adapter.js.
//
// HLTV is behind Cloudflare and the lib's own docs warn that hammering it gets
// your IP banned. We make the minimum calls (1 getMatch + 1 getMatchMapStats
// per played map) and throttle between them.
import { HLTV } from "hltv";
import { toSeries } from "./hltv-adapter.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchSeries(matchId, { colors = {}, throttleMs = 2500 } = {}) {
  const match = await HLTV.getMatch({ id: Number(matchId) });

  const mapStatsById = {};
  const played = (match.maps || []).filter((m) => m.result && m.statsId);
  for (let i = 0; i < played.length; i++) {
    const m = played[i];
    if (i > 0) await sleep(throttleMs);
    try {
      mapStatsById[m.statsId] = await HLTV.getMatchMapStats({ id: m.statsId });
    } catch (e) {
      console.warn(`map "${m.name}" stats failed (${e.message}); using score only`);
    }
  }

  return toSeries({ match, mapStatsById, colors });
}
