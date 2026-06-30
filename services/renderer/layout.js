// Pure, deterministic: a contract-valid series -> poster geometry.
// No p5, no DOM. Same input -> same output, so it is unit-tested in layout.test.js.
//
// The core idea, lifted from Zeh Fernandes' World Cup posters: events are
// "gravity points" in a vector field. Every stroke starts at its round's cell,
// heads in its team's direction (team A left, team B right), and is integrated
// step by step THROUGH the field, so it bends. Near an attractor the field
// gains a tangential (swirl) component, so lines orbit the point rather than
// just being pulled into it. Drama strengthens the swirl. Attractors are never
// drawn — the bending is the visualization.
//
// sketch.js only paints the polylines this produces; it computes nothing.

export const DEFAULTS = {
  width: 1280,
  margin: 90,
  headerH: 210,
  bandH: 360,
  bandGap: 70,
  slotW: 30, // px per round -> map width is proportional to round count
  strokesPerRound: 5,
  baseLen: 150, // base stroke length (integrated arc length, px)
  step: 7, // integration step in px
  pull: 0.45, // radial component (toward attractor)
  swirl: 1.15, // tangential component (orbit) — the "gravity swirl"
  ambient: 0.16, // ambient curl so far-from-event lines aren't dead straight
  taper: 0.45 // pressure at the stroke ends (1 = no taper); mid is always full
};

// seeded LCG -> deterministic "noise" (no Math.random, stays reproducible)
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

export function computePoster(series, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const maps = series.maps;
  const drama = dramaScore(series);

  const maxRounds = Math.max(...maps.map((m) => m.rounds.length));
  const innerW = maxRounds * cfg.slotW;
  const width = cfg.width || innerW + cfg.margin * 2;
  const height =
    cfg.headerH + cfg.margin * 2 + maps.length * cfg.bandH + (maps.length - 1) * cfg.bandGap;

  const bands = [];
  const attractors = [];
  const sideSwitches = [];
  const strokeSeeds = []; // {x,y,baseDir,len,color,weight,team,round}

  maps.forEach((map, mi) => {
    const y = cfg.headerH + cfg.margin + mi * (cfg.bandH + cfg.bandGap);
    const bandW = map.rounds.length * cfg.slotW;
    const x = (width - innerW) / 2;
    const cy = y + cfg.bandH / 2;

    bands.push({
      name: map.name,
      scoreA: map.score.a,
      scoreB: map.score.b,
      x, y, w: bandW, h: cfg.bandH,
      decider: !!map.decider,
      overtime: !!map.overtime,
      winner: map.winner
    });

    attractors.push(...deriveAttractors(map, x, cy, cfg, drama));

    map.rounds.forEach((r, ri) => {
      const slotX = x + (ri + 0.5) * cfg.slotW;
      const rand = rng((mi + 1) * 100003 + r.n * 31 + (r.winner === "a" ? 7 : 13));
      const color = series.teams[r.winner].color;
      const baseDir = r.winner === "a" ? Math.PI : 0; // left vs right

      const kills = Number.isFinite(r.kills) ? r.kills : 5;
      const count = Math.max(3, Math.round(cfg.strokesPerRound * (kills / 6)));
      const lenBoost = (1 + drama * 0.45) * (map.decider ? 1.2 : 1) *
        (r.winType === "elimination" ? 1.1 : 0.95);

      for (let k = 0; k < count; k++) {
        strokeSeeds.push({
          x: slotX + (rand() - 0.5) * cfg.slotW * 0.6,
          y: cy + (rand() - 0.5) * cfg.bandH * 0.28,
          baseDir,
          len: cfg.baseLen * lenBoost * (0.8 + rand() * 0.55),
          color,
          weight: 1.4 + rand() * 2.2 + (map.decider ? 0.6 : 0),
          team: r.winner,
          round: r.n
        });
      }

      if (r.n === 13 || (map.overtime && r.n > 24 && (r.n - 25) % 3 === 0)) {
        sideSwitches.push({ x: slotX - cfg.slotW / 2, y, h: cfg.bandH });
      }
    });
  });

  // integrate every stroke through the shared field -> curved polylines
  const field = buildField(attractors, drama, cfg);
  const strokes = strokeSeeds.map((s) => ({
    points: trace(s.x, s.y, s.baseDir, s.len, field, cfg.step, cfg.taper),
    color: s.color,
    weight: s.weight,
    team: s.team,
    round: s.round
  }));

  return {
    width, height, bands, strokes, attractors, sideSwitches,
    header: {
      event: series.event,
      stage: series.stage || "",
      date: series.date || "",
      teamA: series.teams.a,
      teamB: series.teams.b,
      seriesScore: series.seriesScore,
      format: series.format
    },
    cfg
  };
}

// Field angle at (x,y) for a stroke whose base flow is baseDir.
function buildField(attractors, drama, cfg) {
  return (x, y, baseDir) => {
    let vx = Math.cos(baseDir);
    let vy = Math.sin(baseDir);
    for (const a of attractors) {
      const dx = a.x - x;
      const dy = a.y - y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > a.radius) continue;
      const fall = 1 - d / a.radius; // 1 at center -> 0 at edge
      const rinx = dx / d, riny = dy / d; // unit toward attractor
      const tanx = -riny, tany = rinx; // perpendicular -> orbit
      const w = fall * fall * a.strength;
      vx += w * (cfg.pull * rinx + cfg.swirl * (0.4 + drama) * tanx);
      vy += w * (cfg.pull * riny + cfg.swirl * (0.4 + drama) * tany);
    }
    const amb = cfg.ambient * Math.sin(x * 0.012 + y * 0.015);
    return Math.atan2(vy, vx) + amb;
  };
}

// Walk the field from a start point, accumulating arc length, until `len`.
// Each point carries a pressure (3rd element) so the brush tapers: thin at the
// ends, full through the middle. Uniform pressure is what made v2 look like
// dead tubes; the taper is what reads as a real brush mark.
function trace(x0, y0, baseDir, len, field, step, taper) {
  const xy = [[x0, y0]];
  let x = x0, y = y0, acc = 0;
  let guard = 0;
  while (acc < len && guard++ < 400) {
    const a = field(x, y, baseDir);
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
    acc += step;
    xy.push([round2(x), round2(y)]);
  }
  const n = xy.length;
  return xy.map(([px, py], i) => {
    const t = n > 1 ? i / (n - 1) : 0; // 0..1 along the stroke
    const pressure = taper + (1 - taper) * Math.sin(Math.PI * t); // ends->mid->ends
    return [px, py, round2(pressure)];
  });
}

const round2 = (v) => Math.round(v * 100) / 100;

// Drama 0..~1: overtime, comebacks, close maps, high round totals.
export function dramaScore(series) {
  let d = 0;
  for (const m of series.maps) {
    if (m.overtime) d += 0.5;
    if (Math.abs(m.score.a - m.score.b) <= 2) d += 0.3;
    if (m.score.a + m.score.b >= 24) d += 0.2;
  }
  if (Math.abs(series.seriesScore.a - series.seriesScore.b) <= 1) d += 0.3;
  return Math.min(1, d / series.maps.length);
}

// Gravity points for a map, in canvas coords. Explicit events (clutch/ace/plant)
// pull hard; when those are absent (reconstructed data), match dynamics still
// give the composition something to bend around: the decisive round and the
// biggest momentum streak.
function deriveAttractors(map, bandX, cy, cfg, drama) {
  const xOf = (n) => bandX + (n - 0.5) * cfg.slotW;
  const seen = new Map();
  const put = (n, kind, strength) => {
    const cur = seen.get(n);
    if (!cur || strength > cur.strength) seen.set(n, { n, kind, strength });
  };

  for (const p of map.players || []) {
    for (const c of p.clutches || []) put(c.round, "clutch", 0.6 + (c.vs || 1) * 0.12);
    for (const r of p.aces || []) put(r, "ace", 1);
  }
  for (const r of map.rounds) if (r.bombPlant) put(r.n, "plant", 0.32);

  // decisive round: the last round of the map (match point landed here)
  const last = map.rounds[map.rounds.length - 1];
  if (last) put(last.n, "decisive", 0.8);

  // biggest momentum streak -> attractor at its midpoint
  const streak = longestStreak(map.rounds);
  if (streak.len >= 4) put(Math.round((streak.start + streak.end) / 2), "momentum", Math.min(0.9, streak.len / 7));

  return [...seen.values()].map((a) => ({
    x: xOf(a.n),
    y: cy + (a.kind === "ace" ? -30 : a.kind === "clutch" ? 25 : 0),
    strength: a.strength,
    kind: a.kind,
    round: a.n,
    radius: 200 + a.strength * 160 + drama * 80
  }));
}

function longestStreak(rounds) {
  let best = { len: 0, start: 1, end: 1 };
  let curLen = 0, curStart = 1, prev = null;
  rounds.forEach((r) => {
    if (r.winner === prev) curLen++;
    else { curLen = 1; curStart = r.n; prev = r.winner; }
    if (curLen > best.len) best = { len: curLen, start: curStart, end: r.n };
  });
  return best;
}
