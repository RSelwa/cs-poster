// Pure, deterministic: a contract-valid series -> poster geometry.
// No p5, no DOM. Same input -> same output, so it is unit-tested in layout.test.js.
// sketch.js renders this geometry with p5.brush; it computes nothing itself.

const DEFAULTS = {
  width: 1280,
  margin: 90,
  headerH: 200,
  bandH: 300, // constant height per map band
  bandGap: 60,
  slotW: 26, // horizontal pixels per round -> map width is proportional to round count
  baseStroke: 70, // base stroke length in px
  jitter: 0.55 // radians of angular spread within a round's cluster
};

// seeded LCG -> deterministic "noise" (no Math.random, stays reproducible)
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

const HALF1_LEN = 12; // MR12 regulation half

export function computePoster(series, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const maps = series.maps;

  const maxRounds = Math.max(...maps.map((m) => m.rounds.length));
  const innerW = maxRounds * cfg.slotW;
  const width = cfg.width || innerW + cfg.margin * 2;
  const height =
    cfg.headerH +
    cfg.margin * 2 +
    maps.length * cfg.bandH +
    (maps.length - 1) * cfg.bandGap;

  const bands = [];
  const strokes = [];
  const attractors = [];
  const sideSwitches = [];

  const drama = dramaScore(series);

  maps.forEach((map, mi) => {
    const y = cfg.headerH + cfg.margin + mi * (cfg.bandH + cfg.bandGap);
    const bandW = map.rounds.length * cfg.slotW;
    const x = (width - innerW) / 2; // left-aligned to shared per-round scale
    const cy = y + cfg.bandH / 2;

    bands.push({
      name: map.name,
      scoreA: map.score.a,
      scoreB: map.score.b,
      x,
      y,
      w: bandW,
      h: cfg.bandH,
      decider: !!map.decider,
      overtime: !!map.overtime,
      winner: map.winner
    });

    // attractor index for this map (clutches / aces / bomb plants / OT start)
    const mapAttractors = mapAttractorRounds(map);

    map.rounds.forEach((r, ri) => {
      const slotX = x + (ri + 0.5) * cfg.slotW;
      const seed = (mi + 1) * 100003 + r.n * 31 + (r.winner === "a" ? 7 : 13);
      const rand = rng(seed);

      const teamKey = r.winner;
      const color = series.teams[teamKey].color;
      // team a emanates left (-PI), team b emanates right (0)
      const baseAngle = teamKey === "a" ? Math.PI : 0;

      const kills = Number.isFinite(r.kills) ? r.kills : 5;
      const count = Math.max(2, Math.round(kills * 0.8));
      // drama and decider lengthen and intensify strokes
      const dramaBoost = 1 + drama * 0.4 + (map.decider ? 0.25 : 0);
      const len =
        cfg.baseStroke *
        dramaBoost *
        (r.winType === "elimination" ? 1.15 : 0.9) *
        (0.85 + rand() * 0.4);

      for (let k = 0; k < count; k++) {
        const spread = (rand() - 0.5) * cfg.jitter * 2;
        // vertical fan so the cluster reads as a brush sweep, not a single line
        const vy = (rand() - 0.5) * cfg.bandH * 0.7;
        strokes.push({
          x: slotX,
          y: cy + vy,
          length: len * (0.7 + rand() * 0.6),
          angle: baseAngle + spread,
          color,
          weight: 1 + rand() * 2.5 + (map.decider ? 0.8 : 0),
          team: teamKey,
          round: r.n
        });
      }

      // side switch marker (start of 2nd half / each OT half)
      if (r.n === HALF1_LEN + 1 || (map.overtime && r.n > 24 && (r.n - 25) % 3 === 0)) {
        sideSwitches.push({ x: slotX - cfg.slotW / 2, y, h: cfg.bandH });
      }

      const att = mapAttractors.get(r.n);
      if (att) {
        attractors.push({
          x: slotX,
          y: cy,
          strength: att.strength,
          kind: att.kind,
          round: r.n
        });
      }
    });
  });

  return {
    width,
    height,
    bands,
    strokes,
    attractors,
    sideSwitches,
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

// Drama 0..~1: overtime, comebacks, close maps, high round totals.
export function dramaScore(series) {
  let d = 0;
  for (const m of series.maps) {
    if (m.overtime) d += 0.5;
    const diff = Math.abs(m.score.a - m.score.b);
    if (diff <= 2) d += 0.3;
    if (m.score.a + m.score.b >= 24) d += 0.2;
  }
  if (Math.abs(series.seriesScore.a - series.seriesScore.b) <= 1) d += 0.3;
  return Math.min(1, d / series.maps.length);
}

// Which rounds in a map are gravity points, and how strong.
function mapAttractorRounds(map) {
  const m = new Map();
  const bump = (round, kind, strength) => {
    const cur = m.get(round);
    if (!cur || strength > cur.strength) m.set(round, { kind, strength });
  };
  for (const p of map.players || []) {
    for (const c of p.clutches || []) bump(c.round, "clutch", 0.6 + (c.vs || 1) * 0.12);
    for (const r of p.aces || []) bump(r, "ace", 1);
  }
  // bomb-plant rounds get a small pull even without player data
  for (const r of map.rounds) {
    if (r.bombPlant) bump(r.n, "plant", 0.3);
  }
  return m;
}
