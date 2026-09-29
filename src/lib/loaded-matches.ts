// Matchs chargés dans l'éditeur : les maps sont regroupées par match, une map déjà présente est remplacée.
import type { MapData } from '@/core/types.ts';

export type LoadedMatch = { key: string; maps: MapData[] };

// Une map appartient à un match : par identifiant du match si on l'a, sinon mêmes équipes + même événement.
const groupKey = (d: MapData) => (d.matchId ? `m${d.matchId}` : `e:${d.teams.map((t) => t.name.toLowerCase()).sort().join('|')}|${(d.event || '').toLowerCase()}`);

// Ajoute des maps ; retourne la nouvelle liste et l'index du match de la dernière map ajoutée.
export function addMaps(matches: LoadedMatch[], maps: MapData[]) {
  const next = matches.map((m) => ({ ...m, maps: [...m.maps] }));
  let idx = -1;
  for (const d of maps) {
    const key = groupKey(d);
    idx = next.findIndex((m) => m.key === key);
    if (idx < 0) { next.push({ key, maps: [] }); idx = next.length - 1; }
    const group = next[idx].maps;
    const dup = d.mapStatsId ? group.findIndex((x) => x.mapStatsId === d.mapStatsId) : -1;
    if (dup >= 0) group[dup] = d; else group.push(d);
  }
  return { matches: next, index: idx };
}

// Contenu d'un fichier JSON importé : export v2 { maps }, tableau de maps, ou map seule.
export function parseImport(text: string): MapData[] {
  const j = JSON.parse(text);
  const list: MapData[] = Array.isArray(j) ? j : (j.maps || [j]);
  list.forEach((d) => { if (!d.rounds || !d.teams) throw new Error('JSON inattendu : il manque « rounds » ou « teams ».'); });
  return list;
}
