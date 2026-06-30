// Pure, deterministic: a contract-valid series -> poster geometry.
// No p5, no DOM. Same input -> same output, unit-tested in layout.test.js.
//
// Model (matching Zeh Fernandes' World Cup posters, adapted to CS2):
//   - ONE continuous grid for the whole series. 1 cell = 1 round. All rounds of
//     all maps fill cells in reading order (left->right, top->bottom), in match
//     chronological order, with NO break between maps. Grid footprint is fixed;
//     cells subdivide to hold however many rounds (fixed columns, rows grow,
//     cell height shrinks).
//   - Each cell emits brush strokes in the ROUND WINNER's color, flowing left
//     (team A) or right (team B). Strokes are long and integrated step-by-step
//     THROUGH a vector field, so they curve.
//   - "Importance" rounds are gravity points: the field gains a tangential
//     (swirl) component near them, so lines orbit. Football used shots; we use
//     map-clinch rounds, pistols, streaks, + mocked clutches (real clutch data
//     is Cloudflare-blocked; mock is seeded + clearly flagged).
//
// sketch.js only paints what this returns.

export const DEFAULTS = {
  width: 1100,
  margin: 95,
  headerH: 140,
  footerH: 120,
  gridH: 1160, // fixed grid footprint height -> "grid size stays the same"
  cols: 8, // fixed columns; rows = ceil(totalRounds / cols)
  strokesPerCell: 30,
  baseLenFrac: 0.72, // stroke length as a fraction of inner width (long sweeps)
  lenVar: 0.5,
  step: 7, // field integration step (px)
  pull: 0.5, // radial component (toward well)
  swirl: 1.25, // tangential component (orbit) — the gravity swirl
  ambient: 0.14, // ambient curl so far-from-well lines aren't dead straight
  taper: 0.4, // pressure at stroke ends (mid is always full)
  weightMin: 0.5,
  weightMax: 1.6,
  wellRadiusFrac: 0.3, // well influence radius as fraction of inner width
  mockClutches: true // seed fake clutch rounds when real ones are absent
};

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

export function computePoster(series, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const drama = dramaScore(series);

  // flatten all rounds into one chronological list, each tagged with its map
  const flat = [];
  series.maps.forEach((map, mapIdx) => {
    map.rounds.forEach((r) => flat.push({ ...r, mapIdx, mapName: map.name, map }));
  });
  const total = flat.length;

  const innerW = cfg.width - cfg.margin * 2;
  const cols = Math.max(1, Math.round(cfg.cols));
  const rows = Math.ceil(total / cols);
  const cellW = innerW / cols;
  const cellH = cfg.gridH / rows;
  const gridTop = cfg.headerH;
  const width = cfg.width;
  const height = cfg.headerH + cfg.gridH + cfg.footerH;

  const cellCenter = (i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return [cfg.margin + (col + 0.5) * cellW, gridTop + (row + 0.5) * cellH];
  };

  // mark importance flags per global round index
  const clutchSet = new Set();
  const aceSet = new Set();
  flat.forEach((r, i) => {
    for (const p of r.map.players || []) {
      if ((p.clutches || []).some((c) => c.round === r.n)) clutchSet.add(i);
      if ((p.aces || []).includes(r.n)) aceSet.add(i);
    }
  });

  const wells = deriveWells(series, flat, cellCenter, innerW, cfg, drama, clutchSet, aceSet);

  // strokes: one cluster per round-cell, in the winner's color, flowing to side
  const seeds = [];
  flat.forEach((r, i) => {
    const [cx, cy] = cellCenter(i);
    const rand = rng((r.mapIdx + 1) * 100003 + r.n * 131 + (r.winner === "a" ? 7 : 13));
    const color = series.teams[r.winner].color;
    const baseDir = r.winner === "a" ? Math.PI : 0;

    const importance =
      1 +
      (clutchSet.has(i) ? 1.3 : 0) +
      (aceSet.has(i) ? 1.0 : 0) +
      (isMockClutch(i, flat, cfg, clutchSet) ? 1.1 : 0) +
      (isMapClinch(i, flat) ? 0.7 : 0) +
      (isPistol(r.n) ? 0.25 : 0);
    const count = Math.max(3, Math.round(cfg.strokesPerCell * importance));

    for (let k = 0; k < count; k++) {
      seeds.push({
        x: cx + (rand() - 0.5) * cellW * 1.4,
        y: cy + (rand() - 0.5) * cellH * 1.4,
        baseDir,
        len: innerW * (cfg.baseLenFrac + (rand() - 0.5) * cfg.lenVar),
        color,
        weight: cfg.weightMin + rand() * (cfg.weightMax - cfg.weightMin),
        team: r.winner,
        round: r.n
      });
    }
  });

  const field = buildField(wells, drama, cfg);
  const strokes = seeds.map((s) => ({
    points: trace(s.x, s.y, s.baseDir, s.len, field, cfg.step, cfg.taper),
    color: s.color,
    weight: s.weight,
    team: s.team,
    round: s.round
  }));

  // tiny map markers at the first cell of each map (minimal text)
  const mapMarkers = [];
  let acc = 0;
  series.maps.forEach((m) => {
    const [mx, my] = cellCenter(acc);
    mapMarkers.push({ x: mx, y: my, name: m.name, scoreA: m.score.a, scoreB: m.score.b, decider: !!m.decider });
    acc += m.rounds.length;
  });

  const gridCols = Array.from({ length: cols + 1 }, (_, c) => cfg.margin + c * cellW);
  const gridRows = Array.from({ length: rows + 1 }, (_, r) => gridTop + r * cellH);

  return {
    width, height, strokes, wells, mapMarkers,
    grid: { cols, rows, cellW, cellH, gridTop, gridH: cfg.gridH, margin: cfg.margin, innerW, gridCols, gridRows, total },
    header: {
      event: series.event,
      stage: series.stage || "",
      date: series.date || "",
      teamA: series.teams.a,
      teamB: series.teams.b,
      seriesScore: series.seriesScore,
      format: series.format
    },
    drama,
    cfg
  };
}

// Field angle at (x,y) for a stroke whose base flow is baseDir.
function buildField(wells, drama, cfg) {
  return (x, y, baseDir) => {
    let vx = Math.cos(baseDir);
    let vy = Math.sin(baseDir);
    for (const w of wells) {
      const dx = w.x - x;
      const dy = w.y - y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > w.radius) continue;
      const fall = 1 - d / w.radius;
      const rinx = dx / d, riny = dy / d;
      const tanx = -riny, tany = rinx;
      const wgt = fall * fall * w.strength;
      vx += wgt * (cfg.pull * rinx + cfg.swirl * (0.4 + drama) * tanx);
      vy += wgt * (cfg.pull * riny + cfg.swirl * (0.4 + drama) * tany);
    }
    const amb = cfg.ambient * Math.sin(x * 0.012 + y * 0.015);
    return Math.atan2(vy, vx) + amb;
  };
}

function trace(x0, y0, baseDir, len, field, step, taper) {
  const xy = [[x0, y0]];
  let x = x0, y = y0, acc = 0, guard = 0;
  while (acc < len && guard++ < 600) {
    const a = field(x, y, baseDir);
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
    acc += step;
    xy.push([round2(x), round2(y)]);
  }
  const n = xy.length;
  return xy.map(([px, py], i) => {
    const t = n > 1 ? i / (n - 1) : 0;
    const pressure = taper + (1 - taper) * Math.sin(Math.PI * t);
    return [px, py, round2(pressure)];
  });
}

const round2 = (v) => Math.round(v * 100) / 100;

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

// global-index predicates over the flattened round list
function isPistol(n) {
  return n === 1 || n === 13 || (n > 24 && (n - 25) % 3 === 0);
}
function isMapClinch(i, flat) {
  const r = flat[i];
  const next = flat[i + 1];
  return !next || next.mapIdx !== r.mapIdx; // last round of its map
}
// deterministic stand-in for clutches when real data is absent: the ~60% round
// of each map. Only active when the map truly has no real clutch.
function isMockClutch(i, flat, cfg, clutchSet) {
  if (!cfg.mockClutches) return false;
  const r = flat[i];
  if ([...clutchSet].some((ci) => flat[ci].mapIdx === r.mapIdx)) return false; // real clutch exists
  const mapRounds = flat.filter((x) => x.mapIdx === r.mapIdx);
  const target = mapRounds[Math.floor(mapRounds.length * 0.6)];
  return target && target.n === r.n;
}

function deriveWells(series, flat, cellCenter, innerW, cfg, drama, clutchSet, aceSet) {
  const wells = [];
  const baseR = innerW * cfg.wellRadiusFrac;
  const add = (i, kind, strength) => {
    const [x, y] = cellCenter(i);
    wells.push({ x, y, strength, kind, round: flat[i].n, mapName: flat[i].mapName, radius: baseR * (0.6 + strength) });
  };
  flat.forEach((r, i) => {
    if (aceSet.has(i)) add(i, "ace", 1);
    else if (clutchSet.has(i)) add(i, "clutch", 0.85);
    else if (isMockClutch(i, flat, cfg, clutchSet)) add(i, "clutch*", 0.8);
    if (isMapClinch(i, flat)) add(i, "map", 0.9);
  });
  return wells;
}
