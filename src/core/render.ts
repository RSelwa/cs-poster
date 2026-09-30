// Moteur de rendu du poster (Canvas 2D). Même code dans l'éditeur et dans le rendu headless du serveur.
import { computeDrama, keyRounds, teamTotals } from './match.ts';
import { makeNoise, mulberry32 } from './noise.ts';
import type { MapData, Match, Pair } from './types.ts';

export type Theme = 'paper' | 'ink';
export type BgText = 'data' | 'players';
export type Fonts = { serif: string; sans: string; mono: string };

export type PosterParams = {
  seed: number; theme: Theme; colors: Pair<string>;
  cols: number; rows: number;
  strokes: number; length: number; brush: number; grain: number;
  noise: number; noiseScale: number;
  gravity: number; swirl: number; dramaAuto: boolean; drama: number; streakMin: number;
  blend: number;
  showGrid: boolean; showBgData: boolean; bgText: BgText; showText: boolean;
};

export const DEFAULTS: PosterParams = {
  seed: 7, theme: 'paper',
  colors: ['#e2452b', '#1f5fa8'],
  cols: 8, rows: 14,
  strokes: 2.5, length: 0.7, brush: 0.02, grain: 1.0,
  noise: 0.3, noiseScale: 2.2,
  gravity: 1.0, swirl: 1.0, dramaAuto: true, drama: 0.5, streakMin: 4,
  blend: 1.0,
  showGrid: false, showBgData: true, bgText: 'data', showText: true,
};

// palette par défaut, stable pour un nom d'équipe (mêmes couleurs dans l'éditeur et dans le rendu headless)
const PAIRS: Pair<string>[] = [['#e2452b', '#1f5fa8'], ['#e0891a', '#127a8a'], ['#d6337a', '#2f8f6b'], ['#e3b400', '#5b3fa8'], ['#c8321f', '#1a8fb0'], ['#7a9a1a', '#b03a7a']];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
// distance RGB sous laquelle deux encres se confondent sur le poster
const CLASH_DISTANCE = 110;
const rgbDistance = (a: string, b: string) => Math.hypot(...hex2rgb(a).map((v, i) => v - hex2rgb(b)[i]));

// Couleur de chaque équipe si elle est connue, sinon la palette. Deux couleurs trop proches (deux équipes rouges) :
// l'équipe 1 prend la couleur de la palette la plus éloignée de celle de l'équipe 0.
export const defaultColors = (teams: { name: string; color?: string }[]): Pair<string> => {
  const pair = PAIRS[hash(teams.map((t) => t.name).join('|')) % PAIRS.length];
  const first = teams[0].color || pair[0], second = teams[1].color || pair[1];
  if (rgbDistance(first, second) >= CLASH_DISTANCE) return [first, second];
  return [first, rgbDistance(first, pair[0]) > rgbDistance(first, pair[1]) ? pair[0] : pair[1]];
};

const GRAVITY_MIN_MASS = 1;

export const THEMES = {
  paper: { bg: '#efe9dc', ink: '#1b1a17', blend: 'multiply', dataAlpha: 0.10 },
  ink: { bg: '#121417', ink: '#ece8de', blend: 'screen', dataAlpha: 0.12 },
} as const;

const SOURCE_LABEL: Record<string, string> = { bo3: 'bo3.gg', hltv: 'hltv', fake: 'fictif', demo: 'démo' };

function hex2rgb(h: string) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

// Répartition des kills dans les rounds. Si les rounds portent kills: [{team, t}], ils sont utilisés tels quels
// (t absent → heure tirée au hasard) ; sinon la répartition est estimée à partir des totaux des joueurs.
function estimateMapKills(m: MapData, rnd: () => number) {
  const R = m.rounds;
  const out: Pair<number[]>[] = R.map(() => [[], []]);
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
const estimateKills = (match: Match, rnd: () => number) => match.maps.flatMap((m) => estimateMapKills(m, rnd));

// Pseudos des deux équipes, sans doublon d'une map à l'autre ; noms d'équipe si le match n'a pas de joueurs.
const playerNames = (data: Match) => {
  const names = [0, 1].flatMap((t) => [...new Set(data.maps.flatMap((m) => (m.players?.[t] || []).map((p) => p.name.trim().toUpperCase())))]).filter(Boolean);
  return `${(names.length ? names : data.teams.map((t) => t.name.toUpperCase())).join('  ·  ')}  ·  `;
};

type Well = { x: number; y: number; m: number; kind: string; i: number };
type KillEvent = { x: number; y: number; t: number; round: number };

export function renderPoster(ctx: CanvasRenderingContext2D, W: number, H: number, data: Match, userParams?: Partial<PosterParams>, fonts?: Partial<Fonts>) {
  const P: PosterParams = { ...DEFAULTS, ...userParams };
  const T = THEMES[P.theme] || THEMES.paper;
  const rnd = mulberry32(P.seed * 9973 + 13);
  const rp = mulberry32(P.seed * 7919 + 5); // aléa de peinture : ne modifie pas la géométrie
  const noise = makeNoise(P.seed + 101);
  const F: Fonts = { serif: 'Georgia, serif', sans: 'Helvetica, Arial, sans-serif', mono: 'Menlo, Consolas, monospace', ...fonts };
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
  const slotOf = (ri: number, tm: number) => Math.min(totalSlots - 1, Math.floor(((ri + tm) / Math.max(1, nR)) * totalSlots));
  const slotPos = (slot: number, jx = 0.5, jy = 0.5) => [gx + ((slot % P.cols) + jx) * cw, gy + (Math.floor(slot / P.cols) + jy) * ch];

  // fond de texte : les données du match en JSON, ou les pseudos des joueurs répétés
  if (P.showBgData) {
    const players = P.bgText === 'players';
    const compact = players ? playerNames(data) : JSON.stringify({ e: data.event, t: data.teams.map((x) => x.name), m: data.maps.map((m) => ({ map: m.map, id: m.mapStatsId, s: m.teams.map((x) => x.score), r: m.rounds.map((r) => `${r.n}${r.winner}${r.type}`), p: m.players })) });
    const fs = W * (players ? 0.021 : 0.0072), lh = fs * (players ? 1.12 : 1.38);
    ctx.font = players ? `600 ${fs}px ${F.sans}` : `${fs}px ${F.mono}`; ctx.fillStyle = T.ink; ctx.globalAlpha = T.dataAlpha; ctx.textBaseline = 'top';
    const cw1 = (players ? ctx.measureText(compact).width / compact.length : ctx.measureText('0123456789').width / 10) || fs * 0.6;
    const cpl = Math.ceil(W / cw1) + 4;
    const sep = players ? '' : ' ';
    let str = compact; while (str.length < cpl * 2) str += sep + compact;
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
  const adrShare = adrSum > 0 ? [(tt[0].adr || 0) / adrSum, (tt[1].adr || 0) / adrSum] : wonShare;
  const dens = wonShare.map((s) => Math.max(0.3, Math.min(2.2, Math.pow(s * 2, 1.6))));
  const lenF = adrShare.map((s) => Math.pow(s * 2, 1.2));
  const drama = P.dramaAuto ? computeDrama(data) : P.drama;

  // points de gravité : seuls les rounds clés forts (fins de map, dernier round, longues séries cassées) courbent
  // les traits. Des dizaines de petits puits font des bosses locales ; quelques puits larges font de grands balayages.
  const keys = keyRounds(data, P.streakMin);
  const gpts: Well[] = keys.filter((k) => k.mass >= GRAVITY_MIN_MASS).map((k) => {
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
  const warp = (x: number, y: number) => {
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

  // kills → événements
  const kills = estimateKills(data, rnd);
  const events: KillEvent[] = [];
  kills.forEach((perTeam, ri) => perTeam.forEach((list, t) => list.forEach((tm) => {
    const [x, y] = slotPos(slotOf(ri, Math.min(0.999, tm)), rnd(), rnd());
    events.push({ x, y, t, round: ri });
  })));
  // Budget : un BO3 a ~3× plus de kills qu'une map ; on réduit les traits par kill pour garder la même densité de peinture
  const budget = Math.min(1, 200 / Math.max(1, events.length));

  // Peinture « aérographe » : les traits ne sont pas dessinés. Chacun dépose de l'encre dans une grille
  // de densité par équipe (basse résolution, qui déborde du cadre), floutée ensuite à la largeur du pinceau :
  // on obtient des zones de couleur, pas des lignes. Le grain vient d'un tramage aléatoire au pixel.
  const lift = (rgb: number[]) => (P.theme === 'ink' ? rgb.map((v) => Math.round(v + (255 - v) * 0.42)) : rgb);
  const inkRGB = P.colors.map((c) => lift(hex2rgb(c)));
  const tc = inkRGB.map(([r, g, b]) => `rgb(${r},${g},${b})`);

  const cell = W / 360, pad = Math.ceil((W * 0.12) / cell);
  const dw = Math.ceil(W / cell) + pad * 2, dh = Math.ceil(H / cell) + pad * 2;
  const ink = [new Float32Array(dw * dh), new Float32Array(dw * dh)];
  const deposit = (t: number, x: number, y: number, wgt: number) => {
    const fx = x / cell + pad, fy = y / cell + pad, ix = Math.floor(fx), iy = Math.floor(fy);
    if (ix < 0 || iy < 0 || ix >= dw - 1 || iy >= dh - 1) return;
    const ax = fx - ix, ay = fy - iy, g = ink[t], o = iy * dw + ix;
    g[o] += wgt * (1 - ax) * (1 - ay); g[o + 1] += wgt * ax * (1 - ay);
    g[o + dw] += wgt * (1 - ax) * ay; g[o + dw + 1] += wgt * ax * ay;
  };
  // Chaque pas du trait pose une bande perpendiculaire à son cap, au profil gaussien : la trace garde sa direction
  // (des bandes étirées, pas des nuages ronds). La pression amincit et allège les deux bouts.
  const brushPx = W * P.brush, across = cell * 1.6;
  function paintStroke(pts: number[][], t: number) {
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
  function emit(ev: KillEvent) {
    const dir = ev.t === 0 ? -1 : 1;
    const count = Math.max(1, Math.round(P.strokes * budget * dens[ev.t] * (0.7 + rnd() * 0.6)));
    for (let s = 0; s < count; s++) {
      const x0 = ev.x + (rnd() - 0.5) * cw * 0.5, y0 = ev.y + (rnd() - 0.5) * ch * 0.6;
      const n = Math.max(4, Math.round((W * P.length * lenF[ev.t] * (0.55 + rnd() * 0.7)) / step));
      const pts: number[][] = [];
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
  const box1d = (src: Float32Array, dst: Float32Array, n: number, lines: number, along: number, across: number, r: number) => {
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
  const blur = (src: Float32Array, sigma: number) => {
    const r = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2));
    const a = Float32Array.from(src), b = new Float32Array(src.length);
    for (let p = 0; p < 3; p++) { box1d(a, b, dw, dh, 1, dw, r); box1d(b, a, dh, dw, dw, 1, r); }
    return a;
  };
  const fields = ink.map((g) => blur(g, (brushPx * 0.3 + W * 0.035) / cell));

  // Référence de densité : le 98e centile. Les zones les plus chargées approchent MAX_INK sans jamais être pleines.
  const sample: number[] = [];
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
  const fleckInk = (t: number) => (screen ? T.ink : `rgb(${inkRGB[t].map((v) => Math.round(v * 0.45)).join(',')})`);
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
      ? data.mapInfo.map((m) => `${m.map || 'Map'} ${m.score[0]}–${m.score[1]}`).join('   ·   ')
      : `${data.mapInfo[0].map || ''}${nR > 24 ? `   ·   prolongation (${nR} rounds)` : `   ·   ${nR} rounds`}`;
    ctx.fillText(sub, mx, H * 0.06 + small * 1.6);
    ctx.globalAlpha = 1;

    const yBase = H - H * 0.052;
    ctx.textAlign = 'center';
    ctx.font = `${W * 0.105}px ${F.serif}`;
    ctx.fillText(`${data.teams[0].score} – ${data.teams[1].score}`, W / 2, yBase);
    ctx.font = `600 ${W * 0.022}px ${F.sans}`;
    ctx.textAlign = 'left'; ctx.fillStyle = tc[0]; ctx.fillText(data.teams[0].name, mx, yBase - W * 0.008);
    ctx.textAlign = 'right'; ctx.fillStyle = tc[1]; ctx.fillText(data.teams[1].name, W - mx, yBase - W * 0.008);
    ctx.fillStyle = T.ink; ctx.globalAlpha = 0.55; ctx.font = `${small * 0.8}px ${F.mono}`; ctx.textAlign = 'left';
    const ref = data.matchId ? `match ${data.matchId}` : `map ${data.mapInfo.map((m) => m.mapStatsId ?? '—').join('/')}`;
    ctx.fillText(`${SOURCE_LABEL[data.source] || data.source} ${ref}  ·  seed ${P.seed}  ·  drame ${drama.toFixed(2)}`, mx, H - H * 0.018);
    ctx.globalAlpha = 1;
  }

  return { drama, keys, rows, events: events.length };
}
