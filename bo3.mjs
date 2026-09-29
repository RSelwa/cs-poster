// bo3.mjs — données de match depuis l'API JSON de bo3.gg.
//
// Pas de Cloudflare : un simple fetch() suffit, sans navigateur. L'API n'est ni documentée ni officielle
// (c'est celle du site bo3.gg) : si un champ disparaît, c'est ici qu'il faut ajuster.
// Contrairement à HLTV, bo3.gg donne les kills par round et par équipe (issus des démos) : plus besoin de les estimer.
//
// Sortie : une map par partie, au format JSON du projet (celui de parseMapStats / README), prête pour buildMatch().

const API = 'https://api.bo3.gg/api/v1';
const HEADERS = { accept: 'application/json', origin: 'https://bo3.gg', referer: 'https://bo3.gg/', 'user-agent': 'Mozilla/5.0 (hltv-posters)' };
const MIN_DELAY_MS = 1000;
const PLAYERS_PER_GAME = 10;

// Raisons de fin de round bo3.gg → types HLTV utilisés par le rendu
const END_REASON = { CTWin: 'ct_win', TerroristsWin: 't_win', TargetBombed: 'bomb_exploded', BombDefused: 'bomb_defused', TargetSaved: 'stopwatch' };

// File d'attente : une requête à la fois, espacées de MIN_DELAY_MS
let queue = Promise.resolve();
let lastRequestAt = 0;
function enqueue(task) {
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_DELAY_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try { return await task(); } finally { lastRequestAt = Date.now(); }
  });
  queue = run.catch(() => {});
  return run;
}

async function get(pathname, params = {}) {
  const url = new URL(API + pathname);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await enqueue(() => fetch(url, { headers: HEADERS }));
  if (!res.ok) throw new Error(`bo3.gg ${res.status} sur ${url.pathname}`);
  return res.json();
}

// Matchs terminés, les plus récents d'abord. tiers : lettres bo3.gg (s = tier 1, a, b, c).
export async function listFinished({ tiers = ['s'], limit = 30 } = {}) {
  const data = await get('/matches', {
    'page[offset]': 0, 'page[limit]': limit, sort: '-start_date',
    'filter[matches.status][in]': 'finished',
    'filter[matches.discipline_id][eq]': 1,
    'filter[matches.tier][in]': tiers.join(','),
    with: 'teams,tournament,games',
  });
  return data.results || [];
}

const getMatch = (slug) => get(`/matches/${slug}`, { scope: 'show-match', with: 'games,teams,tournament_deep' });
const getGame = (id) => get(`/games/${id}`);
const getPlayersStats = (id) => get(`/games/${id}/players_stats`);

const mapLabel = (name) => { const n = String(name || '').replace(/^de_/, ''); return n.charAt(0).toUpperCase() + n.slice(1); };
const round1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

// Une partie bo3.gg → une map du projet. L'équipe 0 est team1 du match.
function toMap(match, game, stats) {
  const teamIds = [match.team1_id, match.team2_id];
  const names = [match.team1?.name, match.team2?.name];
  const clanTeam = new Map([game.winner_team_clan, game.loser_team_clan].map((c) => [c.clan_name, teamIds.indexOf(c.team_id)]));
  const idx = (clan) => {
    const t = clanTeam.get(clan);
    if (t == null || t < 0) throw new Error(`bo3.gg : équipe « ${clan} » inconnue dans la partie ${game.id}`);
    return t;
  };

  const score = [0, 0];
  const rounds = game.game_rounds.slice().sort((a, b) => a.round_number - b.round_number).map((r) => {
    const winner = idx(r.winner_clan_name);
    score[winner]++;
    const kills = r.game_round_team_clans.flatMap((tc) => Array.from({ length: tc.kills || 0 }, () => ({ team: idx(tc.clan_name) })));
    return { n: r.round_number, winner, side: r.winner_clan_side, type: END_REASON[r.end_reason] || (r.winner_clan_side === 'T' ? 't_win' : 'ct_win'), score: [score[0], score[1]], kills };
  });

  const first = game.game_rounds.find((r) => r.round_number === 1);
  const side0 = first?.game_round_team_clans.find((tc) => idx(tc.clan_name) === 0)?.team_side || 'CT';
  const finalScore = (t) => (idx(game.winner_team_clan.clan_name) === t ? game.winner_clan_score : game.loser_clan_score);

  const players = [[], []];
  stats.forEach((p) => players[idx(p.clan_name)].push({
    name: p.steam_profile?.player?.nickname || p.steam_profile?.nickname || '',
    kills: p.kills, hs: p.headshots, assists: p.assists, deaths: p.death,
    kast: round1(p.kast * 100), adr: round1(p.adr), rating: round1(p.player_rating),
  }));

  return {
    version: 1, source: 'bo3', mapStatsId: game.id, matchId: match.id,
    event: match.tournament?.name || '', date: Date.parse(game.begin_at) || null, map: mapLabel(game.map_name),
    teams: names.map((name, t) => ({ name, score: finalScore(t), startSide: t === 0 ? side0 : (side0 === 'CT' ? 'T' : 'CT') })),
    halves: [], rounds, players,
  };
}

// Une partie est prête quand bo3.gg a fini de parser sa démo : tous les rounds et les 10 joueurs.
const isGameReady = (game, stats) => game.state === 'done' && game.rounds_count > 0 && (game.game_rounds || []).length === game.rounds_count && stats.length >= PLAYERS_PER_GAME;

// Récupère un match (slug bo3.gg) et ses maps. ready = false tant qu'une partie n'est pas encore parsée.
export async function fetchMatch(slug) {
  const match = await getMatch(slug);
  if (match.status !== 'finished') return { match, ready: false, reason: `match ${match.status}` };
  const played = (match.games || []).filter((g) => g.status === 'finished' || g.state === 'done');
  const mapsPlayed = (match.team1_score || 0) + (match.team2_score || 0);
  if (played.length < mapsPlayed) return { match, ready: false, reason: `${played.length}/${mapsPlayed} maps listées` };

  const maps = [];
  for (const g of played) {
    const [game, stats] = [await getGame(g.id), await getPlayersStats(g.id)];
    if (!isGameReady(game, stats)) return { match, ready: false, reason: `${mapLabel(game.map_name)} pas encore parsée (${(game.game_rounds || []).length}/${game.rounds_count ?? '?'} rounds, ${stats.length} joueurs)` };
    maps.push(toMap(match, game, stats));
  }
  return { match, ready: true, maps };
}
