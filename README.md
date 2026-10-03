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

## Déployer (VPS + pm2)

Chaque push sur `main` lance `.github/workflows/deploy.yml` : connexion SSH au VPS, `git reset --hard
origin/main`, `pnpm install`, Chromium de Playwright, `pnpm build`, puis
`pm2 startOrReload ecosystem.config.cjs`. `data/` est ignoré par git : le reset ne touche ni le cache
des matchs ni les posters.

Une seule fois sur le VPS :

    # Node ≥ 23 (type stripping natif), pnpm, pm2
    npm i -g pnpm pm2
    git clone git@github.com:RSelwa/cs-poster.git ~/cs-posters && cd ~/cs-posters
    pnpm install && sudo pnpm exec playwright install-deps chromium && pnpm exec playwright install chromium
    pnpm build
    pm2 start ecosystem.config.cjs && pm2 save
    pm2 startup   # puis lancer la commande qu'il affiche

Le serveur écoute sur `:4173`, nginx le sert sur `cs-poster.raphael-selwa.com` (DNS : un enregistrement
A vers l'IP du VPS) :

    sudo cp deploy/cs-poster.raphael-selwa.com.conf /etc/nginx/sites-available/cs-poster
    sudo ln -s /etc/nginx/sites-available/cs-poster /etc/nginx/sites-enabled/
    sudo nginx -t && sudo systemctl reload nginx
    sudo certbot --nginx -d cs-poster.raphael-selwa.com   # HTTPS + redirection, renouvelé automatiquement
Les variables d'environnement (`TIERS`, `POSTER_SIZE`…) vont dans `env` de `ecosystem.config.cjs`.

Dans le repo GitHub, environnement par défaut :

| nom | type | valeur |
| --- | --- | --- |
| `VPS_HOST` | variable | IP ou hôte du VPS |
| `VPS_USER` | variable | utilisateur SSH |
| `APP_DIR` | variable | chemin du clone, ex. `/home/deploy/cs-posters` |
| `NODE_BIN_DIR` | variable | dossier contenant `node`, `pnpm` et `pm2` (`dirname $(which pm2)`) |
| `SSH_PRIVATE_KEY` | secret | clé privée dont la publique est dans `~/.ssh/authorized_keys` du VPS |

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
