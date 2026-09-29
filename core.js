/* ------------------------------------------------------------------
   core.js — parseur HLTV + moteur de rendu du poster
   Fonctionne dans le navigateur (DOMParser) et dans Node (jsdom / canvas)
------------------------------------------------------------------- */
(function (root) {
  'use strict';

  /* ============================ PARSEUR HLTV ============================ */
  // Sélecteurs issus de la lib open source gigobyte/HLTV (getMatchMapStats).
  // HLTV change son HTML de temps en temps : si un champ sort vide, c'est ici qu'il faut ajuster.

  const KNOWN_MAPS = ['Mirage', 'Inferno', 'Nuke', 'Ancient', 'Anubis', 'Dust2', 'Overpass', 'Vertigo', 'Train', 'Cache', 'Cobblestone'];
  const num = (s) => { const m = String(s ?? '').replace(',', '.').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };

  function outcomeFromImg(img) {
    const src = img.getAttribute('src') || '';
    return src.split('/').pop().split('.')[0];
  }

  function parseMapStats(html, docFactory) {
    const doc = docFactory ? docFactory(html) : new DOMParser().parseFromString(html, 'text/html');
    const q = (s, r = doc) => r.querySelector(s);
    const qa = (s, r = doc) => Array.from(r.querySelectorAll(s));

    const rows = qa('.round-history-team-row');
    if (rows.length < 2) throw new Error("Historique des rounds introuvable : la page n'est pas une page « map stats » HLTV (ou Cloudflare a répondu à la place).");

    const teamName = (side) => {
      const logo = q(`.team-${side} .team-logo`);
      return (logo && logo.getAttribute('title')) || (q(`.team-${side} a`)?.textContent || '').trim() || side;
    };
    const teams = [teamName('left'), teamName('right')];
    const totals = [num(q('.team-left .bold')?.textContent), num(q('.team-right .bold')?.textContent)];

    const box = q('.match-info-box');
    const boxText = box ? box.textContent : '';
    const map = KNOWN_MAPS.find((m) => boxText.toLowerCase().includes(m.toLowerCase())) || '';
    const unix = num(q('.match-info-box span[data-time-format]')?.getAttribute('data-unix'));
    const eventName = (q('.match-info-box .text-ellipsis')?.textContent || '').trim();

    // rounds
    const outs = rows.slice(0, 2).map((r) => qa('.round-history-outcome', r).map(outcomeFromImg));
    const len = Math.max(outs[0].length, outs[1].length);
    const startsCT0 = (outs[0][0] || '').includes('ct');
    const rounds = [];
    const score = [0, 0];
    for (let i = 0; i < len; i++) {
      const a = outs[0][i] || 'emptyHistory', b = outs[1][i] || 'emptyHistory';
      if (a === 'emptyHistory' && b === 'emptyHistory') continue;
      const winner = a !== 'emptyHistory' ? 0 : 1;
      const type = winner === 0 ? a : b;
      const side = (type === 't_win' || type === 'bomb_exploded') ? 'T' : 'CT';
      score[winner]++;
      rounds.push({ n: rounds.length + 1, winner, side, type, score: [score[0], score[1]] });
    }

    // stats joueurs
    const tables = qa('.stats-table.totalstats');
    const players = [0, 1].map((k) => {
      const t = tables[k === 0 ? 0 : tables.length - 1];
      if (!t) return [];
      return qa('tbody tr', t).map((tr) => {
        const first = (sel) => { const el = q(sel, tr); return el && el.firstChild ? num(el.firstChild.textContent) : null; };
        const txt = (sel) => num(q(sel, tr)?.textContent);
        return {
          name: (q('.st-player a', tr)?.textContent || '').trim(),
          kills: first('.st-kills'),
          hs: num((q('.st-kills .gtSmartphone-only', tr)?.textContent || '').replace(/[()]/g, '')),
          assists: first('.st-assists'),
          deaths: txt('.st-deaths'),
          kast: txt('.st-kdratio'),
          adr: txt('.st-adr'),
          rating: txt('.st-rating'),
        };
      });
    });

    const halvesTxt = q('.match-info-row .right')?.textContent || '';
    const inside = halvesTxt.split('(').slice(1).join('(');
    const halves = [...inside.matchAll(/(\d+)\s*:\s*(\d+)/g)].map((m) => [+m[1], +m[2]]);

    const id = (doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || '').match(/mapstatsid\/(\d+)/)?.[1] || null;

    const matchId = (q('.match-page-link')?.getAttribute('href') || '').match(/\/matches\/(\d+)/)?.[1] || null;

    return {
      version: 1, source: 'hltv', mapStatsId: id ? +id : null, matchId: matchId ? +matchId : null,
      event: eventName, date: unix ? unix : null, map,
      teams: teams.map((name, i) => ({ name, score: totals[i] ?? score[i], startSide: (i === 0) === startsCT0 ? 'CT' : 'T' })),
      halves, rounds, players,
    };
  }

  // Sur une page /matches/<id>/…, récupère les liens vers les pages « map stats »
  function parseMatchPageLinks(html, docFactory) {
    const doc = docFactory ? docFactory(html) : new DOMParser().parseFromString(html, 'text/html');
    const seen = new Set();
    return Array.from(doc.querySelectorAll('a[href*="/stats/matches/mapstatsid/"]'))
      .map((a) => a.getAttribute('href'))
      .filter((h) => (seen.has(h) ? false : seen.add(h)));
  }

  /* ============================ DÉMO ============================ */
  function makeDemoMap(name, seq, startCT0, seed, id, names) {
    let sd = seed; const rnd = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
    const rounds = []; const score = [0, 0];
    for (let i = 0; i < seq.length; i++) {
      const w = +seq[i];
      const ob = Math.floor((i - 24) / 3);
      const team0CT = i < 12 ? startCT0 : i < 24 ? !startCT0 : ((ob % 2 === 0) ? startCT0 : !startCT0);
      const winnerCT = (w === 0) === team0CT;
      const r = rnd();
      const type = winnerCT ? (r < 0.55 ? 'ct_win' : r < 0.85 ? 'bomb_defused' : 'stopwatch') : (r < 0.55 ? 't_win' : 'bomb_exploded');
      score[w]++;
      rounds.push({ n: i + 1, winner: w, side: winnerCT ? 'CT' : 'T', type, score: [score[0], score[1]] });
    }
    const mk = (pre, base, k) => ['A', 'B', 'C', 'D', 'E'].map((c, i) => ({ name: pre + c, kills: base + ((i * 7 + k) % 9) - 3, hs: 8 + i * 2, assists: 4 + i, deaths: 18 + ((i * 5 + k) % 8), kast: 68 + i * 2, adr: 62 + i * 6 + k, rating: +(0.85 + i * 0.09).toFixed(2) }));
    const scale = seq.length / 24;
    return {
      version: 1, source: 'demo', mapStatsId: id, matchId: 0, event: 'Démo : événement fictif', date: Date.UTC(2026, 5, 20) + (id - 9000) * 3600e3, map: name,
      teams: [{ name: names[0], score: score[0], startSide: startCT0 ? 'CT' : 'T' }, { name: names[1], score: score[1], startSide: startCT0 ? 'T' : 'CT' }],
      halves: [], rounds,
      players: [mk('aur', Math.round(20 * scale), seed % 3), mk('bas', Math.round(18 * scale), (seed + 1) % 3)],
    };
  }
  // BO3 fictif : 16–14 (prolongation), 8–13, 13–11 → 2–1
  function demoMatch() {
    const n = ['Team Aurora', 'Team Basalt'];
    return [
      makeDemoMap('Mirage', '001001011001' + '110100110110' + '000110', true, 12345, 9001, n),
      makeDemoMap('Inferno', '110110010110' + '010111011', false, 777, 9002, n),
      makeDemoMap('Nuke', '010011010110' + '101000110100', true, 4242, 9003, n),
    ];
  }

  /* ============================ MATCH = PLUSIEURS MAPS ============================ */
  const sameTeam = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

  // Aligne chaque map sur l'ordre d'équipes de la première, puis met les rounds bout à bout.
  function buildMatch(rawMaps) {
    const maps = rawMaps.slice().sort((a, b) => (a.date || 0) - (b.date || 0) || (a.mapStatsId || 0) - (b.mapStatsId || 0));
    const names = [maps[0].teams[0].name, maps[0].teams[1].name];
    const aligned = maps.map((m) => {
      const swap = !sameTeam(m.teams[0].name, names[0]) && sameTeam(m.teams[1].name, names[0]);
      if (!swap) return m;
      return Object.assign({}, m, {
        teams: [m.teams[1], m.teams[0]],
        rounds: m.rounds.map((r) => Object.assign({}, r, { winner: 1 - r.winner, score: [r.score[1], r.score[0]], kills: r.kills ? r.kills.map((k) => ({ team: 1 - k.team, t: k.t })) : r.kills })),
        players: [m.players[1] || [], m.players[0] || []],
        halves: (m.halves || []).map((h) => [h[1], h[0]]),
      });
    });
    const rounds = [], mapInfo = [];
    aligned.forEach((m, mi) => {
      mapInfo.push({ map: m.map, score: [m.teams[0].score, m.teams[1].score], mapStatsId: m.mapStatsId, start: rounds.length, len: m.rounds.length });
      m.rounds.forEach((r, ri) => rounds.push(Object.assign({}, r, { map: mi, mapRound: ri + 1, n: rounds.length + 1 })));
    });
    const roundsWon = [0, 1].map((t) => aligned.reduce((a, m) => a + m.teams[t].score, 0));
    const mapsWon = [0, 1].map((t) => aligned.filter((m) => m.teams[t].score > m.teams[1 - t].score).length);
    const series = aligned.length > 1;
    return {
      version: 2, source: aligned[0].source, event: aligned[0].event, date: aligned[0].date, matchId: aligned[0].matchId || null,
      series, teams: names.map((name, t) => ({ name, score: series ? mapsWon[t] : roundsWon[t], rounds: roundsWon[t] })),
      rounds, maps: aligned, mapInfo,
    };
  }

  /* ============================ STATS DÉRIVÉES ============================ */
  function teamTotals(match) {
    return [0, 1].map((t) => {
      let kills = 0; const adrs = [];
      match.maps.forEach((m) => {
        const ps = m.players?.[t] || [];
        kills += ps.reduce((a, p) => a + (p.kills || 0), 0);
        const v = ps.map((p) => p.adr).filter((x) => x != null);
        if (v.length) adrs.push(v.reduce((a, b) => a + b, 0) / v.length);
      });
      return { kills, adr: adrs.length ? adrs.reduce((a, b) => a + b, 0) / adrs.length : null };
    });
  }

  function mapDrama(m) {
    const R = m.rounds, n = R.length;
    if (!n) return 0;
    const fin = R[n - 1].score, diff = Math.abs(fin[0] - fin[1]);
    const closeness = 1 - Math.min(1, Math.max(0, (diff - 1) / 12));
    const ot = n > 24 ? 0.6 + 0.4 * Math.min(1, (n - 24) / 12) : 0;
    let lead = 0, changes = 0, maxDef = [0, 0], lateChanges = 0;
    R.forEach((r, i) => {
      const l = Math.sign(r.score[0] - r.score[1]);
      if (l !== 0 && lead !== 0 && l !== lead) { changes++; if (i > n * 0.75) lateChanges++; }
      if (l !== 0) lead = l;
      maxDef[0] = Math.max(maxDef[0], r.score[1] - r.score[0]);
      maxDef[1] = Math.max(maxDef[1], r.score[0] - r.score[1]);
    });
    const win = fin[0] > fin[1] ? 0 : 1;
    const comeback = Math.min(1, maxDef[win] / 8);
    const score = 0.30 * closeness + 0.25 * ot + 0.20 * Math.min(1, changes / 8) + 0.15 * comeback + 0.10 * Math.min(1, lateChanges / 3);
    return Math.max(0, Math.min(1, score));
  }

  // Drame du match : moyenne des maps, poids du meilleur moment, et suspense de la série (2–1 > 2–0)
  function computeDrama(match) {
    const ds = match.maps.map(mapDrama);
    if (!ds.length) return 0;
    if (ds.length === 1) return ds[0];
    const mean = ds.reduce((a, b) => a + b, 0) / ds.length;
    const wins = [0, 1].map((t) => match.teams[t].score);
    const seriesClose = 1 - Math.min(1, (Math.abs(wins[0] - wins[1]) - 1) / Math.max(1, Math.max(wins[0], wins[1])));
    return Math.max(0, Math.min(1, 0.55 * mean + 0.2 * Math.max(...ds) + 0.25 * seriesClose));
  }

  // Rounds « clés » (points de gravité invisibles) : pistols, prolongations, série cassée, dernier round de chaque map
  function keyRounds(match, streakMin) {
    const out = new Map();
    const add = (i, kind, mass) => { const cur = out.get(i); if (!cur || cur.mass < mass) out.set(i, { i, kind, mass }); };
    match.maps.forEach((m, mi) => {
      const info = match.mapInfo[mi], off = info.start, n = m.rounds.length;
      if (n > 0) add(off, 'pistol', 0.8);
      if (n > 12) add(off + 12, 'pistol', 0.8);
      for (let i = 24; i < n; i += 6) add(off + i, 'ot', 0.9);
      let run = 0, runTeam = -1;
      m.rounds.forEach((r, i) => {
        if (r.winner === runTeam) run++; else { if (run >= streakMin) add(off + i, 'streak', 0.55 + 0.08 * run); run = 1; runTeam = r.winner; }
      });
      const last = mi === match.maps.length - 1;
      if (n > 0) add(off + n - 1, last ? 'final' : 'mapend', last ? 1.7 : 1.1);
    });
    return [...out.values()].sort((a, b) => a.i - b.i);
  }

  /* ============================ RNG / BRUIT ============================ */
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function makeNoise(seed) {
    const rnd = mulberry32(seed), G = 256, tab = new Float32Array(G * G);
    for (let i = 0; i < tab.length; i++) tab[i] = rnd();
    const sm = (t) => t * t * (3 - 2 * t);
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
      const g = (a, b) => tab[((b & 255) * G) + (a & 255)];
      const a = g(xi, yi), b = g(xi + 1, yi), c = g(xi, yi + 1), d = g(xi + 1, yi + 1);
      return (a + (b - a) * xf) * (1 - yf) + (c + (d - c) * xf) * yf;
    };
  }

  /* ============================ PARAMÈTRES ============================ */
  const DEFAULTS = {
    seed: 7, theme: 'paper',
    colors: ['#e2452b', '#1f5fa8'],
    cols: 8, rows: 14,
    strokes: 2.5, length: 0.7, brush: 0.02, grain: 1.0,
    noise: 0.3, noiseScale: 2.2,
    gravity: 1.0, swirl: 1.0, dramaAuto: true, drama: 0.5, streakMin: 4,
    blend: 1.0,
    showGrid: false, showBgData: true, showText: true,
  };

  // palette par défaut, stable pour un nom d'équipe (même couleurs dans l'interface et dans le rendu headless)
  const PAIRS = [['#e2452b', '#1f5fa8'], ['#e0891a', '#127a8a'], ['#d6337a', '#2f8f6b'], ['#e3b400', '#5b3fa8'], ['#c8321f', '#1a8fb0'], ['#7a9a1a', '#b03a7a']];
  const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const defaultColors = (names) => PAIRS[hash(names.join('|')) % PAIRS.length].slice();

  const GRAVITY_MIN_MASS = 1;

  const THEMES = {
    paper: { bg: '#efe9dc', ink: '#1b1a17', blend: 'multiply', dataAlpha: 0.10 },
    ink: { bg: '#121417', ink: '#ece8de', blend: 'screen', dataAlpha: 0.12 },
  };

  /* ============================ RENDU ============================ */
  function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

  // Répartition estimée des kills par round (HLTV ne donne pas leur heure).
  // Si data.rounds[i].kills existe (tableau de {team, t}), il est utilisé tel quel.
  function estimateMapKills(m, rnd) {
    const R = m.rounds;
    const out = R.map(() => [[], []]);
    if (R.some((r) => Array.isArray(r.kills))) {
      R.forEach((r, i) => (r.kills || []).forEach((k) => out[i][k.team].push(k.t ?? rnd())));
      return out;
    }
    [0, 1].forEach((t) => {
      const ps = m.players?.[t] || [];
      const total = ps.reduce((a, p) => a + (p.kills || 0), 0) || Math.round(R.length * 3.3);
      const w = R.map((r) => {
        const won = r.winner === t;
        let base = won ? 2.3 : 0.75;
        if (won && (r.type === 'bomb_defused' || r.type === 'stopwatch')) base *= 0.85;
        return base * (0.7 + rnd() * 0.6);
      });
      const sum = w.reduce((a, b) => a + b, 0);
      const raw = w.map((x) => (x / sum) * total);
      const floor = raw.map(Math.floor);
      let left = total - floor.reduce((a, b) => a + b, 0);
      raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left-- > 0) floor[i]++; });
      floor.forEach((c, i) => { for (let k = 0; k < c; k++) out[i][t].push(rnd()); });
    });
    return out;
  }
  const estimateKills = (match, rnd) => match.maps.flatMap((m) => estimateMapKills(m, rnd));

  function renderPoster(ctx, W, H, data, userParams, fonts) {
    const P = Object.assign({}, DEFAULTS, userParams || {});
    const T = THEMES[P.theme] || THEMES.paper;
    const rnd = mulberry32(P.seed * 9973 + 13);
    const rp = mulberry32(P.seed * 7919 + 5); // aléa de peinture : ne modifie pas la géométrie
    const noise = makeNoise(P.seed + 101);
    const F = Object.assign({ serif: 'Georgia, serif', sans: 'Helvetica, Arial, sans-serif', mono: 'Menlo, Consolas, monospace' }, fonts || {});
    const nR = data.rounds.length;

    // fond
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);

    // grille chrono
    const mx = W * 0.075, top = H * 0.135, bottom = H * 0.135;
    const gx = mx, gy = top, gw = W - mx * 2, gh = H - top - bottom;
    const rows = Math.max(2, Math.round(P.rows)), totalSlots = rows * P.cols;
    const cw = gw / P.cols, ch = gh / rows;
    // position (round, fraction du round) → case de la grille → point
    const slotOf = (ri, tm) => Math.min(totalSlots - 1, Math.floor(((ri + tm) / Math.max(1, nR)) * totalSlots));
    const slotPos = (slot, jx = 0.5, jy = 0.5) => [gx + ((slot % P.cols) + jx) * cw, gy + (Math.floor(slot / P.cols) + jy) * ch];

    // fond de données
    if (P.showBgData) {
      const compact = JSON.stringify({ e: data.event, t: data.teams.map((x) => x.name), m: data.maps.map((m) => ({ map: m.map, id: m.mapStatsId, s: m.teams.map((x) => x.score), r: m.rounds.map((r) => `${r.n}${r.winner}${r.type}`), p: m.players })) });
      const fs = W * 0.0072, lh = fs * 1.38;
      ctx.font = `${fs}px ${F.mono}`; ctx.fillStyle = T.ink; ctx.globalAlpha = T.dataAlpha; ctx.textBaseline = 'top';
      const cw1 = ctx.measureText('0123456789').width / 10 || fs * 0.6;
      const cpl = Math.ceil(W / cw1) + 4;
      let str = compact; while (str.length < cpl * 2) str += ' ' + compact;
      for (let y = 0, li = 0; y < H; y += lh, li++) { const o = (li * 37) % compact.length; ctx.fillText((str + str).slice(o, o + cpl), 0, y); }
      ctx.globalAlpha = 1;
    }

    // grille visible
    if (P.showGrid) {
      ctx.strokeStyle = T.ink; ctx.globalAlpha = 0.10; ctx.lineWidth = Math.max(1, W / 1500);
      for (let c = 0; c <= P.cols; c++) { ctx.beginPath(); ctx.moveTo(gx + c * cw, gy); ctx.lineTo(gx + c * cw, gy + gh); ctx.stroke(); }
      for (let r = 0; r <= rows; r++) { ctx.beginPath(); ctx.moveTo(gx, gy + r * ch); ctx.lineTo(gx + gw, gy + r * ch); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }

    // métriques d'équipe
    const tt = teamTotals(data);
    const wonShare = [data.teams[0].rounds, data.teams[1].rounds].map((s, _, a) => s / Math.max(1, a[0] + a[1]));
    const adrSum = (tt[0].adr || 0) + (tt[1].adr || 0);
    const adrShare = adrSum > 0 ? [tt[0].adr / adrSum, tt[1].adr / adrSum] : wonShare;
    const dens = wonShare.map((s) => Math.max(0.3, Math.min(2.2, Math.pow(s * 2, 1.6))));
    const lenF = adrShare.map((s) => Math.pow(s * 2, 1.2));
    const drama = P.dramaAuto ? computeDrama(data) : P.drama;

    // points de gravité : seuls les rounds clés forts (fins de map, dernier round, longues séries cassées) courbent
    // les traits. Des dizaines de petits puits font des bosses locales ; quelques puits larges font de grands balayages.
    const keys = keyRounds(data, P.streakMin);
    const gpts = keys.filter((k) => k.mass >= GRAVITY_MIN_MASS).map((k) => {
      const [x, y] = slotPos(slotOf(k.i, 0.5));
      return { x, y, m: k.mass, kind: k.kind, i: k.i };
    });
    const gR = W * 0.35;
    // Un match entier a beaucoup de rounds clés : on normalise pour que l'attraction totale reste stable.
    const gNorm = Math.min(1, Math.sqrt(4 / Math.max(1, gpts.length)));

    // Une seule déformation, appliquée à tous les points de tous les traits, comme une lentille : une ondulation douce,
    // puis pour chaque round clé une attraction radiale bornée (PULL_MAX < 1 : les traits se resserrent sans se replier)
    // et une torsion proportionnelle au drame. La même application lisse pour tous → les traits voisins se courbent
    // ensemble, sans jamais se croiser ni boucler.
    const PULL_MAX = 0.55, TWIST_MAX = 1.4;
    const warpScale = (P.noiseScale * 3) / W;
    const warp = (x, y) => {
      y += (noise(x * warpScale, y * warpScale) - 0.5) * H * 0.12 * P.noise;
      for (const g of gpts) {
        let dx = x - g.x, dy = y - g.y;
        const e = Math.exp(-(dx * dx + dy * dy) / (gR * gR));
        const pull = Math.min(PULL_MAX, g.m * P.gravity * gNorm * 0.5) * e;
        dx *= 1 - pull; dy *= 1 - pull;
        const th = Math.min(TWIST_MAX, drama * P.swirl * g.m * gNorm * 1.6) * e, c = Math.cos(th), sn = Math.sin(th);
        x = g.x + dx * c - dy * sn; y = g.y + dx * sn + dy * c;
      }
      return [x, y];
    };

    // kills estimés → événements
    const kills = estimateKills(data, rnd);
    const events = [];
    kills.forEach((perTeam, ri) => perTeam.forEach((list, t) => list.forEach((tm) => {
      const [x, y] = slotPos(slotOf(ri, Math.min(0.999, tm)), rnd(), rnd());
      events.push({ x, y, t, round: ri });
    })));
    // Budget : un BO3 a ~3× plus de kills qu'une map ; on réduit les traits par kill pour garder la même densité de peinture
    const budget = Math.min(1, 200 / Math.max(1, events.length));

    // Peinture « aérographe » : les traits ne sont pas dessinés. Chacun dépose de l'encre dans une grille
    // de densité par équipe (basse résolution, qui déborde du cadre), floutée ensuite à la largeur du pinceau :
    // on obtient des zones de couleur, pas des lignes. Le grain vient d'un tramage aléatoire au pixel.
    const lift = (rgb) => (P.theme === 'ink' ? rgb.map((v) => Math.round(v + (255 - v) * 0.42)) : rgb);
    const inkRGB = P.colors.map((c) => lift(hex2rgb(c)));
    const tc = inkRGB.map(([r, g, b]) => `rgb(${r},${g},${b})`);

    const cell = W / 360, pad = Math.ceil((W * 0.12) / cell);
    const dw = Math.ceil(W / cell) + pad * 2, dh = Math.ceil(H / cell) + pad * 2;
    const ink = [new Float32Array(dw * dh), new Float32Array(dw * dh)];
    const deposit = (t, x, y, wgt) => {
      const fx = x / cell + pad, fy = y / cell + pad, ix = Math.floor(fx), iy = Math.floor(fy);
      if (ix < 0 || iy < 0 || ix >= dw - 1 || iy >= dh - 1) return;
      const ax = fx - ix, ay = fy - iy, g = ink[t], o = iy * dw + ix;
      g[o] += wgt * (1 - ax) * (1 - ay); g[o + 1] += wgt * ax * (1 - ay);
      g[o + dw] += wgt * (1 - ax) * ay; g[o + dw + 1] += wgt * ax * ay;
    };
    // Chaque pas du trait pose une bande perpendiculaire à son cap, au profil gaussien : la trace garde sa direction
    // (des bandes étirées, pas des nuages ronds). La pression amincit et allège les deux bouts.
    const brushPx = W * P.brush, across = cell * 1.6;
    function paintStroke(pts, t) {
      const n = pts.length; if (n < 3) return;
      const thick = 0.65 + rnd() * 0.7;
      for (let i = 0; i < n; i++) {
        const press = Math.pow(Math.sin(Math.PI * Math.min(1, (i / (n - 1)) * 1.15)), 0.55) * thick;
        if (press <= 0) continue;
        const [ax, ay] = pts[Math.max(0, i - 1)], [bx, by] = pts[Math.min(n - 1, i + 1)];
        const tl = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / tl, ny = (bx - ax) / tl;
        const half = brushPx * (0.35 + 0.65 * Math.min(1, press)), k = Math.ceil((2 * half) / across);
        for (let j = -k; j <= k; j++) {
          const o = (j / k) * 2 * half;
          deposit(t, pts[i][0] + nx * o, pts[i][1] + ny * o, press * Math.exp((-2 * (j / k) * (j / k)) * 2));
        }
      }
    }

    // Chaque kill lance des traits droits et horizontaux, vers la gauche pour l'équipe 0 et vers la droite pour l'équipe 1.
    // Tous leurs points passent ensuite par warp().
    const step = W * 0.0045;
    function emit(ev) {
      const dir = ev.t === 0 ? -1 : 1;
      const count = Math.max(1, Math.round(P.strokes * budget * dens[ev.t] * (0.7 + rnd() * 0.6)));
      for (let s = 0; s < count; s++) {
        const x0 = ev.x + (rnd() - 0.5) * cw * 0.5, y0 = ev.y + (rnd() - 0.5) * ch * 0.6;
        const n = Math.max(4, Math.round((W * P.length * lenF[ev.t] * (0.55 + rnd() * 0.7)) / step));
        const pts = [];
        for (let i = 0; i <= n; i++) {
          const x = x0 + dir * i * step;
          if (x < -W * 0.1 || x > W * 1.1) break;
          pts.push(warp(x, y0));
        }
        paintStroke(pts, ev.t);
      }
    }
    events.forEach(emit);

    // Flou : 3 passes de flou boîte ≈ gaussienne. Deux échelles : le halo large du pinceau + un cœur plus net.
    const box1d = (src, dst, n, lines, along, across, r) => {
      const k = 1 / (2 * r + 1);
      for (let l = 0; l < lines; l++) {
        const base = l * across;
        let s = 0;
        for (let i = 0; i <= r && i < n; i++) s += src[base + i * along];
        for (let i = 0; i < n; i++) {
          dst[base + i * along] = s * k;
          if (i + r + 1 < n) s += src[base + (i + r + 1) * along];
          if (i - r >= 0) s -= src[base + (i - r) * along];
        }
      }
    };
    const blur = (src, sigma) => {
      const r = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2));
      const a = Float32Array.from(src), b = new Float32Array(src.length);
      for (let p = 0; p < 3; p++) { box1d(a, b, dw, dh, 1, dw, r); box1d(b, a, dh, dw, dw, 1, r); }
      return a;
    };
    const fields = ink.map((g) => blur(g, (brushPx * 0.3 + W * 0.035) / cell));

    // Référence de densité : le 98e centile. Les zones les plus chargées approchent MAX_INK sans jamais être pleines.
    const sample = [];
    fields.forEach((f) => { for (let i = 0; i < f.length; i += 7) if (f[i] > 1e-6) sample.push(f[i]); });
    sample.sort((a, b) => a - b);
    const ref = sample.length ? sample[Math.floor(sample.length * 0.98)] : 1;

    // Encres translucides superposées comme au pochoir : chaque équipe multiplie le papier (ou l'éclaircit en « écran »).
    // Deux encres partielles donnent une troisième couleur (orange × bleu → vert, rouge × bleu → mauve) au lieu d'un noir.
    // Spray : chaque grain tire sa propre densité autour de la couverture (écart max à mi-couverture, nul sur papier nu),
    // et le papier lui-même est légèrement moucheté. Le bruit est surtout commun aux deux équipes (SHARED_GRAIN) :
    // sinon, là où elles se chevauchent, des grains pleins des deux encres se multiplient en points noirs.
    const COVER_GAIN = 3.2, MAX_INK = 0.88, SPRAY = 0.45, PAPER_NOISE = 0.035, SHARED_GRAIN = 0.7;
    const gs = Math.max(1, Math.round((W / 1000) * P.grain));
    const img = ctx.getImageData(0, 0, W, H), px = img.data;
    const cols = Math.ceil(W / gs), grain = [new Float32Array(cols), new Float32Array(cols), new Float32Array(cols)];
    const fxs = new Float32Array(W).map((_, x) => (x + 0.5) / cell + pad);
    const inkF = inkRGB.map((c) => c.map((v) => v / 255));
    const screen = T.blend === 'screen';
    const alpha = [0, 0], mul = [0, 0, 0], mix = [0, 0, 0];
    const LUMA = [0.299, 0.587, 0.114], OVERLAP_LIFT = 0.8, OVERLAP_SAT = 1.2;
    for (let y = 0; y < H; y++) {
      if (y % gs === 0) grain.forEach((row) => { for (let c = 0; c < cols; c++) row[c] = rp() * 2 - 1; });
      const fy = (y + 0.5) / cell + pad, iy = Math.floor(fy), ay = fy - iy, o0 = iy * dw, o1 = o0 + dw;
      for (let x = 0; x < W; x++) {
        const fx = fxs[x], ix = Math.floor(fx), ax = fx - ix, p = (y * W + x) * 4, gc = (x / gs) | 0;
        for (let t = 0; t < 2; t++) {
          const f = fields[t];
          const d = (f[o0 + ix] * (1 - ax) + f[o0 + ix + 1] * ax) * (1 - ay) + (f[o1 + ix] * (1 - ax) + f[o1 + ix + 1] * ax) * ay;
          const cover = d > 0 ? MAX_INK * (1 - Math.exp((-COVER_GAIN * d) / ref)) : 0;
          const n = SHARED_GRAIN * grain[2][gc] + (1 - SHARED_GRAIN) * grain[t][gc];
          alpha[t] = Math.max(0, Math.min(1, cover + SPRAY * n * Math.sqrt(cover * (1 - cover))));
        }
        const lum = 1 + PAPER_NOISE * grain[2][gc];
        const [a0, a1] = alpha;
        if (screen) {
          for (let k = 0; k < 3; k++) px[p + k] = (255 - (255 - px[p + k]) * (1 - a0 * inkF[0][k]) * (1 - a1 * inkF[1][k])) * lum;
          continue;
        }
        // Le produit des deux encres donne la teinte du mélange (orange × bleu → vert) mais l'assombrit trop :
        // on lui rend en partie la clarté d'un simple mélange de peinture (moyenne des encres pondérée par leur couverture),
        // et un peu de saturation là où les deux couvrent.
        const a = 1 - (1 - a0) * (1 - a1);
        let lMul = 0, lMix = 0;
        for (let k = 0; k < 3; k++) {
          const bg = px[p + k];
          mul[k] = bg * (1 - a0 * (1 - inkF[0][k])) * (1 - a1 * (1 - inkF[1][k]));
          const c = a > 0 ? (a0 * inkF[0][k] + a1 * inkF[1][k]) / (a0 + a1) : 1;
          mix[k] = bg * (1 - a + a * c);
          lMul += LUMA[k] * mul[k]; lMix += LUMA[k] * mix[k];
        }
        const lift = lMul > 0 ? Math.pow(lMix / lMul, OVERLAP_LIFT) : 1, sat = 1 + OVERLAP_SAT * Math.min(a0, a1);
        // P.blend dose l'effet : 0 = simple mélange de peinture, 1 = mélange soustractif ci-dessus, au-delà = accentué.
        for (let k = 0; k < 3; k++) {
          const blended = (lMul + (mul[k] - lMul) * sat) * lift;
          px[p + k] = Math.max(0, Math.min(255, mix[k] + (blended - mix[k]) * P.blend)) * lum;
        }
      }
    }
    ctx.putImageData(img, 0, 0);

    // Mouchetures : de courts tirets sombres posés sur une partie des kills, plus une poussière de points au hasard.
    const FLECKS = 70, DUST = 320;
    const pFleck = Math.min(1, FLECKS / Math.max(1, events.length));
    const fleckInk = (t) => (screen ? T.ink : `rgb(${inkRGB[t].map((v) => Math.round(v * 0.45)).join(',')})`);
    ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1, W * 0.0011);
    events.forEach((ev) => {
      if (rp() > pFleck) return;
      const len = W * (0.003 + rp() * 0.006), ang = Math.PI * (0.5 + (rp() - 0.5) * 0.9);
      const x = ev.x + (rp() - 0.5) * cw, y = ev.y + (rp() - 0.5) * ch;
      const dx = (Math.cos(ang) * len) / 2, dy = (Math.sin(ang) * len) / 2;
      ctx.strokeStyle = rp() < 0.35 ? fleckInk(ev.t) : T.ink; ctx.globalAlpha = 0.4 + rp() * 0.4;
      ctx.beginPath(); ctx.moveTo(x - dx, y - dy); ctx.lineTo(x + dx, y + dy); ctx.stroke();
    });
    for (let i = 0; i < DUST; i++) {
      const s = W * (0.0007 + rp() * 0.0013);
      ctx.fillStyle = rp() < 0.5 ? T.ink : fleckInk(rp() < 0.5 ? 0 : 1); ctx.globalAlpha = 0.2 + rp() * 0.4;
      ctx.fillRect(rp() * W, rp() * H, s, s);
    }
    ctx.globalAlpha = 1;

    // typographie
    if (P.showText) {
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = T.ink;
      const small = W * 0.0135;
      ctx.font = `500 ${small}px ${F.sans}`; ctx.textAlign = 'left';
      const d = data.date ? new Date(data.date > 1e11 ? data.date : data.date * 1000) : null;
      const dstr = d ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
      ctx.fillText(data.event || 'Counter-Strike 2', mx, H * 0.06);
      ctx.textAlign = 'right'; ctx.fillText(dstr, W - mx, H * 0.06);
      ctx.textAlign = 'left'; ctx.globalAlpha = 0.65;
      const sub = data.series
        ? data.mapInfo.map((m) => `${m.map || 'Map'} ${m.score[0]}\u2013${m.score[1]}`).join('   ·   ')
        : `${data.mapInfo[0].map || ''}${nR > 24 ? `   ·   prolongation (${nR} rounds)` : `   ·   ${nR} rounds`}`;
      ctx.fillText(sub, mx, H * 0.06 + small * 1.6);
      ctx.globalAlpha = 1;

      const yBase = H - H * 0.052;
      ctx.textAlign = 'center';
      ctx.font = `${W * 0.105}px ${F.serif}`;
      ctx.fillText(`${data.teams[0].score}\u2009–\u2009${data.teams[1].score}`, W / 2, yBase);
      ctx.font = `600 ${W * 0.022}px ${F.sans}`;
      ctx.textAlign = 'left'; ctx.fillStyle = tc[0]; ctx.fillText(data.teams[0].name, mx, yBase - W * 0.008);
      ctx.textAlign = 'right'; ctx.fillStyle = tc[1]; ctx.fillText(data.teams[1].name, W - mx, yBase - W * 0.008);
      ctx.fillStyle = T.ink; ctx.globalAlpha = 0.55; ctx.font = `${small * 0.8}px ${F.mono}`; ctx.textAlign = 'left';
      const ref = data.matchId ? `match ${data.matchId}` : `map ${data.mapInfo.map((m) => m.mapStatsId ?? '—').join('/')}`;
      ctx.fillText(`${data.source === 'bo3' ? 'bo3.gg' : 'hltv'} ${ref}  ·  seed ${P.seed}  ·  drame ${drama.toFixed(2)}`, mx, H - H * 0.018);
      ctx.globalAlpha = 1;
    }

    return { drama, keys, rows, events: events.length };
  }

  const api = { parseMapStats, parseMatchPageLinks, demoMatch, buildMatch, computeDrama, keyRounds, renderPoster, DEFAULTS, THEMES, teamTotals, defaultColors };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HLTVPoster = api;
})(typeof window !== 'undefined' ? window : globalThis);
