# Affiches CS2 depuis HLTV

Une affiche par match : toutes les maps sont mises bout à bout sur la même toile. Uniquement des traits, aucun marqueur.

## Lancer

    pnpm install
    pnpm start        # puis ouvrir http://localhost:4173

Le serveur ouvre un vrai Chrome pour récupérer les pages HLTV (Cloudflare bloque les requêtes
classiques). Si un captcha apparaît, résous-le une fois : le cookie est conservé dans .browser-profile/.
Si Chrome n'est pas installé : npx playwright install chromium

Les pages téléchargées sont mises en cache dans .cache/ (une page n'est demandée qu'une fois) et
les requêtes sont espacées de 2 s.

## Poster automatique après chaque match tier 1

    pnpm watch                                   # boucle, toutes les 2 min
    node watch.mjs --once                        # un seul passage
    node watch.mjs --match vitality-vs-furia-20-09-2026   # un match précis (slug bo3.gg)

Options : --tiers s (lettres bo3.gg, ex. s,a), --size 2400 (largeur en px), --interval 120 (s),
--lookback 12 (heures).

Les données viennent de l'API JSON de bo3.gg (bo3.mjs) : pas de Cloudflare, donc pas de fenêtre Chrome.
Elle donne les kills réels de chaque round (plus d'estimation). Un match est rendu dès que bo3.gg a
parsé toutes ses démos, en général 10 à 20 min après la fin ; sinon il est retenté au passage suivant.
Le rendu se fait dans un Chromium headless (render.mjs), avec le même moteur et les mêmes réglages par
défaut que l'interface.

Sortie : posters/<date>_<slug>.png et .json (à déposer dans l'interface pour retoucher les réglages).
Les matchs déjà rendus sont notés dans .watch-state.json.

Attention : l'API de bo3.gg n'est ni documentée ni officielle, elle peut changer sans prévenir.

## Sans serveur

index.html s'ouvre aussi directement (double-clic). Dans ce mode, enregistre la page HLTV (Ctrl+S)
et dépose les fichiers (plusieurs à la fois) dans l'interface, ou dépose un .json.

## Liens acceptés

- Un match : https://www.hltv.org/matches/<id>/<slug> (toutes les maps sont récupérées et fusionnées)
- Une map : https://www.hltv.org/stats/matches/mapstatsid/<id>/<slug> (rejoint son match si les autres maps sont déjà chargées)

Les maps sont regroupées par match automatiquement (identifiant du match HLTV, sinon mêmes équipes + même événement).
Si l'ordre des équipes est inversé d'une map à l'autre, il est remis d'aplomb.

## Fichiers

- core.js : parseur HLTV, calcul du drame, rounds clés, moteur de rendu (Canvas 2D, sans dépendance)
- index.html : interface
- server.mjs : récupération des pages HLTV via Playwright + cache
- bo3.mjs : API bo3.gg → maps au format JSON ci-dessous
- render.mjs : rendu PNG headless
- watch.mjs : surveillance des matchs terminés

## Si le parseur ne trouve plus rien

HLTV modifie son HTML de temps en temps. Les sélecteurs sont regroupés dans parseMapStats() (core.js) :
.round-history-team-row, .round-history-outcome, .team-left / .team-right, .stats-table.totalstats, .st-*

## Format JSON

Export = `{ "version": 2, "maps": [ …une entrée par map… ] }`. L'import accepte aussi une map seule ou un tableau de maps.

    {
      "map": "Mirage", "event": "…", "date": 1780000000000, "mapStatsId": 123, "matchId": 456,
      "teams": [{"name": "A", "score": 16}, {"name": "B", "score": 14}],
      "rounds": [{"n": 1, "winner": 0, "side": "CT", "type": "ct_win", "score": [1, 0],
                  "kills": [{"team": 0, "t": 0.3}]}],
      "players": [[{"name": "x", "kills": 20, "adr": 80.1}], [ … ]]
    }

"kills" est optionnel (heure relative dans le round, 0 à 1). Sans lui, la répartition des kills dans
les rounds est estimée à partir des totaux, car HLTV ne publie pas l'heure des kills.
