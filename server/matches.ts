// matches.ts — les matchs vus par l'API et le watcher : liste récente (cache mémoire court) et maps d'un match
// (cache disque dès qu'il est entièrement parsé, puisqu'il ne change plus).

import type { MapData } from '../src/core/types.ts';
import type { MatchMaps, MatchSummary } from '../src/lib/api-types.ts';
import { fetchMatch, listFinished, type Bo3Match } from './bo3.ts';
import { getMaps, listPosters, saveMaps } from './store.ts';
import { teamColors } from './team-colors.ts';

const LIST_TTL_MS = 60_000;

let listCache: { key: string; at: number; matches: Bo3Match[] } | null = null;

export async function listRecentBo3(tiers: string[]) {
  const key = tiers.join(',');
  if (listCache && listCache.key === key && Date.now() - listCache.at < LIST_TTL_MS) return listCache.matches;
  const matches = await listFinished({ tiers });
  listCache = { key, at: Date.now(), matches };
  return matches;
}

export async function listRecent(tiers: string[]): Promise<MatchSummary[]> {
  const [matches, posters] = await Promise.all([listRecentBo3(tiers), listPosters()]);
  return matches.map((m) => ({
    id: m.id, slug: m.slug, event: m.tournament?.name || '', tier: m.tier ?? null, bo: m.bo_type, endedAt: m.end_date,
    teams: [
      { name: m.team1?.name || '', score: m.team1_score ?? 0 },
      { name: m.team2?.name || '', score: m.team2_score ?? 0 },
    ],
    poster: posters[m.id] ? `/posters/${posters[m.id].file}` : null,
  }));
}

export async function loadMatch(slug: string): Promise<MatchMaps> {
  const cached = await getMaps(slug);
  if (cached) return { ready: true, maps: cached };
  const r = await fetchMatch(slug);
  if (!r.ready) return { ready: false, reason: r.reason };
  const colors = teamColors([r.match.team1, r.match.team2]);
  const maps = r.maps.map((m) => ({ ...m, teams: m.teams.map((t, i) => (colors[i] ? { ...t, color: colors[i] } : t)) as MapData['teams'] }));
  await saveMaps(slug, maps);
  return { ready: true, maps };
}
