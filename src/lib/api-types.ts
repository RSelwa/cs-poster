// Réponses de l'API du serveur (server/index.ts), lues par l'éditeur.
import type { MapData, Pair } from '../core/types.ts';

export type MatchSummary = {
  id: number;
  slug: string;
  event: string;
  tier: string | null;
  bo: number;
  endedAt: string | null;
  teams: Pair<{ name: string; score: number }>;
  poster: string | null;
};

export type MatchList = { matches: MatchSummary[] };

export type MatchMaps = { ready: true; maps: MapData[] } | { ready: false; reason: string };
