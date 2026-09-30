// store.ts — tout ce qui persiste. Aujourd'hui des fichiers dans data/ ; pour passer à une base de données,
// c'est le seul module à réécrire (mêmes fonctions, mêmes types).
//
//   data/matches/<slug>.json   maps d'un match terminé et entièrement parsé (ne change plus)
//   data/posters/<nom>.png     posters rendus par le watcher
//   data/posters.json          index des posters, par identifiant de match bo3.gg
//   data/teams.json            couleur extraite de chaque équipe, par identifiant d'équipe bo3.gg

import fs from 'node:fs/promises';
import path from 'node:path';
import type { MapData } from '../src/core/types.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const MATCHES_DIR = path.join(DATA_DIR, 'matches');
export const POSTERS_DIR = path.join(DATA_DIR, 'posters');
const POSTERS_INDEX = path.join(DATA_DIR, 'posters.json');
const TEAMS_INDEX = path.join(DATA_DIR, 'teams.json');

export const SLUG = /^[a-z0-9][a-z0-9-]*$/i;

// images : les urls d'où la couleur a été extraite (un nouveau logo relance l'extraction)
export type TeamColorRecord = { slug: string; images: string; color: string | null };
export type PosterRecord = { matchId: number; slug: string; file: string; drama: number; size: number; at: string };

const matchFile = (slug: string) => {
  if (!SLUG.test(slug)) throw new Error(`slug invalide : ${slug}`);
  return path.join(MATCHES_DIR, `${slug}.json`);
};

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(file, 'utf8')) as T; } catch { return fallback; }
}

export const getMaps = (slug: string) => readJson<MapData[] | null>(matchFile(slug), null);

export async function saveMaps(slug: string, maps: MapData[]) {
  await fs.mkdir(MATCHES_DIR, { recursive: true });
  await fs.writeFile(matchFile(slug), JSON.stringify(maps));
}

export const listPosters = () => readJson<Record<string, PosterRecord>>(POSTERS_INDEX, {});

export async function savePoster(record: Omit<PosterRecord, 'file' | 'at'>, png: Buffer) {
  await fs.mkdir(POSTERS_DIR, { recursive: true });
  const file = `${record.slug}.png`;
  await fs.writeFile(path.join(POSTERS_DIR, file), png);
  const index = await listPosters();
  const saved: PosterRecord = { ...record, file, at: new Date().toISOString() };
  index[record.matchId] = saved;
  await fs.writeFile(POSTERS_INDEX, JSON.stringify(index, null, 2));
  return saved;
}

export const getTeamColors = () => readJson<Record<string, TeamColorRecord>>(TEAMS_INDEX, {});

export async function saveTeamColor(teamId: number, record: TeamColorRecord) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const index = await getTeamColors();
  index[teamId] = record;
  await fs.writeFile(TEAMS_INDEX, JSON.stringify(index, null, 2));
}
