# Affiches CS2

Une affiche par match : toutes les maps sont mises bout à bout sur la même toile. Uniquement des traits,
aucun marqueur. Un serveur surveille les matchs tier 1 et rend l'affiche quelques minutes après la fin ;
un éditeur permet de la retoucher.

## Lancer

    pnpm install
    pnpm dev         # éditeur sur http://localhost:5173, serveur (API + watcher) sur :4173

En production :

    pnpm build
    pnpm start       # un seul serveur sur http://localhost:4173

Le rendu automatique utilise Chrome sans fenêtre. Si Chrome n'est pas installé :
`npx playwright install chromium`.

## Poster automatique après chaque match tier 1

Le serveur interroge bo3.gg toutes les 2 min. Un match est rendu dès que bo3.gg a traité toutes ses
démos, en général 10 à 20 min après la fin ; sinon il est retenté au passage suivant. Les posters sont
dans `data/posters/`, et un badge « poster » apparaît à côté du match dans l'éditeur.

Variables d'environnement :

| variable | défaut | rôle |
| --- | --- | --- |
| `PORT` | 4173 | port du serveur |
| `TIERS` | `s` | tiers bo3.gg surveillés (`s` = tier 1, ex. `s,a`) |
| `WATCH` | `1` | `0` coupe le watcher |
| `WATCH_INTERVAL_S` | 120 | secondes entre deux passages |
| `WATCH_LOOKBACK_H` | 12 | ne rend que les matchs finis depuis moins de N heures |
| `POSTER_SIZE` | 2400 | largeur des posters en px |

Les données viennent de l'API JSON de bo3.gg : pas de Cloudflare, donc pas de navigateur pour les
récupérer. Elle donne les kills réels de chaque round. Attention : cette API n'est ni documentée ni
officielle, elle peut changer sans prévenir (tout le code qui la lit est dans `server/bo3.ts`).

## Éditeur

- À gauche : les matchs tier 1 récents (un clic charge le match), l'import d'un JSON, la démo, les
  matchs de test fictifs, et le détail du match affiché.
- Au centre : l'affiche.
- À droite : couleurs, fond, curseurs, graine, export PNG (jusqu'à 3540 × 4720 px, 30 × 40 cm à 300 dpi).

## Organisation

- `src/core/` : moteur du poster (assemblage du match, drame, rounds clés, rendu Canvas 2D), partagé
  par l'éditeur et le serveur
- `src/` : éditeur React (Vite, TypeScript, Tailwind, shadcn)
- `server/` : API (Hono), récupération bo3.gg, watcher, rendu headless, stockage (`store.ts`, à
  remplacer par une base de données)
- `fixtures/` : matchs fictifs, régénérés par `pnpm fixtures`

## Vérifier

    pnpm typecheck
    pnpm lint

## Format JSON

Export = `{ "version": 2, "maps": [ …une entrée par map… ] }`. L'import accepte aussi une map seule ou
un tableau de maps.

    {
      "map": "Mirage", "event": "…", "date": 1780000000000, "mapStatsId": 123, "matchId": 456,
      "teams": [{"name": "A", "score": 16}, {"name": "B", "score": 14}],
      "rounds": [{"n": 1, "winner": 0, "side": "CT", "type": "ct_win", "score": [1, 0],
                  "kills": [{"team": 0, "t": 0.3}]}],
      "players": [[{"name": "x", "kills": 20, "adr": 80.1}], [ … ]]
    }

`kills` est optionnel. `t` est l'heure relative du kill dans le round (0 à 1) ; sans `t`, elle est tirée
au hasard (même graine, même tirage). Sans `kills`, la répartition des kills dans les rounds est estimée
à partir des totaux des joueurs.
