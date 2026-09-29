// Format JSON d'une map (export v2 = { version: 2, maps: MapData[] }) et du match assemblé par buildMatch().

export type Pair<T> = [T, T];

// Un kill : l'équipe qui l'a fait et son heure relative dans le round (0 à 1). Sans t, l'heure est tirée au hasard.
export type Kill = { team: number; t?: number };

export type Round = {
  n: number;
  winner: number;
  side: string;
  type: string;
  score: Pair<number>;
  kills?: Kill[];
};

export type Player = {
  name: string;
  kills: number | null;
  hs?: number | null;
  assists?: number | null;
  deaths?: number | null;
  kast?: number | null;
  adr: number | null;
  rating?: number | null;
};

export type MapTeam = { name: string; score: number; startSide?: string };

export type MapData = {
  version: number;
  source: string;
  mapStatsId: number | null;
  matchId: number | null;
  event: string;
  date: number | null;
  map: string;
  teams: Pair<MapTeam>;
  halves?: Pair<number>[];
  rounds: Round[];
  players: Pair<Player[]>;
};

export type MatchExport = { version: 2; maps: MapData[] };

export type MatchRound = Round & { map: number; mapRound: number };
export type MapInfo = { map: string; score: Pair<number>; mapStatsId: number | null; start: number; len: number };
export type MatchTeam = { name: string; score: number; rounds: number };

export type Match = {
  version: 2;
  source: string;
  event: string;
  date: number | null;
  matchId: number | null;
  series: boolean;
  teams: Pair<MatchTeam>;
  rounds: MatchRound[];
  maps: MapData[];
  mapInfo: MapInfo[];
};

export type KeyRound = { i: number; kind: string; mass: number };
