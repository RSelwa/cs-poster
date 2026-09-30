// team-colors.ts — couleur d'une équipe : d'abord TEAM_COLORS (choisies à la main), sinon la teinte dominante
// de son logo bo3.gg (sinon de son maillot), mise en cache par équipe dans le store. null → palette par défaut.

import { readPixels } from './render.ts';
import { getTeamColors, saveTeamColor } from './store.ts';

// slug bo3.gg → couleur. Pour une équipe dont le logo est noir et blanc, ou dont la teinte extraite est mauvaise.
const TEAM_COLORS: Record<string, string> = {};

const HUE_BUCKETS = 24;
const OPAQUE = 200;
const MIN_SAT = 0.3, MIN_LIGHT = 0.15, MAX_LIGHT = 0.85;
const MIN_SHARE = 0.04;
// les couleurs de logo sont souvent fluo : ramenées vers les tons de pigment de la palette par défaut
const INK_MAX_SAT = 0.8, INK_MAX_LIGHT = 0.48;

type TeamRef = { id: number; slug: string; image_url?: string | null; tshirt_image_url?: string | null };

const toHex = (rgb: number[]) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

const hsl = (r: number, g: number, b: number) => {
  const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255, l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const h = max === rn ? ((gn - bn) / d + 6) % 6 : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [h / 6, s, l];
};

const fromHsl = (h: number, s: number, l: number) => {
  const a = s * Math.min(l, 1 - l);
  return [0, 8, 4].map((n) => { const k = (n + h * 12) % 12; return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))); });
};

const toInk = (rgb: number[]) => {
  const [h, s, l] = hsl(rgb[0], rgb[1], rgb[2]);
  return toHex(fromHsl(h, Math.min(s, INK_MAX_SAT), Math.min(l, INK_MAX_LIGHT)));
};

// Teinte dominante parmi les pixels opaques assez saturés (le noir, le blanc et les gris ne comptent pas),
// pondérée par la saturation. Les teintes voisines sont regroupées pour ne pas couper un rouge en deux.
export const dominantColor = (rgba: ArrayLike<number>) => {
  const buckets = Array.from({ length: HUE_BUCKETS }, () => [0, 0, 0, 0]);
  let opaque = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < OPAQUE) continue;
    opaque++;
    const [r, g, b] = [rgba[i], rgba[i + 1], rgba[i + 2]], [h, s, l] = hsl(r, g, b);
    if (s < MIN_SAT || l < MIN_LIGHT || l > MAX_LIGHT) continue;
    const bucket = buckets[Math.floor(h * HUE_BUCKETS) % HUE_BUCKETS];
    bucket[0] += s; bucket[1] += r * s; bucket[2] += g * s; bucket[3] += b * s;
  }
  const around = (i: number) => [-1, 0, 1].map((o) => buckets[(i + o + HUE_BUCKETS) % HUE_BUCKETS]).reduce((a, b) => a.map((v, k) => v + b[k]));
  const best = buckets.map((_, i) => around(i)).reduce((a, b) => (b[0] > a[0] ? b : a));
  if (!opaque || best[0] < MIN_SHARE * opaque) return null;
  return toInk(best.slice(1).map((v) => v / best[0]));
};

const extract = async (url: string) => {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return dominantColor(await readPixels(Buffer.from(await res.arrayBuffer()), res.headers.get('content-type') || 'image/webp'));
  } catch {
    return null;
  }
};

const teamColor = async (team: TeamRef) => {
  if (TEAM_COLORS[team.slug]) return TEAM_COLORS[team.slug];
  const images = [team.image_url, team.tshirt_image_url].filter((u): u is string => !!u);
  const key = images.join(' ');
  const cached = (await getTeamColors())[team.id];
  if (cached && cached.images === key) return cached.color;
  let color: string | null = null;
  for (const url of images) { color ??= await extract(url); }
  await saveTeamColor(team.id, { slug: team.slug, images: key, color });
  return color;
};

// Une équipe après l'autre : le cache est un seul fichier réécrit à chaque équipe.
export async function teamColors(teams: (TeamRef | undefined)[]) {
  const colors: (string | null)[] = [];
  for (const t of teams) colors.push(t ? await teamColor(t) : null);
  return colors;
}
