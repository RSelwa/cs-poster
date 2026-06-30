// Renders poster geometry (from layout.js) with p5.brush, plus a crisp DOM
// text overlay and a live parameter panel. Pure drawing — all geometry/field
// math lives in layout.js; this file computes nothing about composition.
//
// Why spline-over-traced-points instead of brush.flowLine: p5.brush's field
// sets each step's heading to (field - plotAngle), i.e. the field replaces
// direction. A single global field can't give team A leftward AND team B
// rightward flow at once. So layout.js owns the field (base dir + gravity
// perturbation, deterministic + testable) and emits polylines with per-point
// pressure; here we just paint them with the chosen brush.
import p5 from "p5";
import * as brush from "p5.brush";
import { computePoster, DEFAULTS } from "./layout.js";

const BG = "#0e0d11";
const $ = (id) => document.getElementById(id);

// layout knobs exposed as sliders (Zeh's "interface to iterate on the rules")
const KNOBS = [
  { key: "swirl", min: 0, max: 2.5, step: 0.05 },
  { key: "pull", min: 0, max: 1.5, step: 0.05 },
  { key: "ambient", min: 0, max: 0.6, step: 0.02 },
  { key: "baseLen", min: 60, max: 340, step: 10 },
  { key: "strokesPerRound", min: 1, max: 14, step: 1 },
  { key: "taper", min: 0.05, max: 1, step: 0.05 },
  { key: "slotW", min: 14, max: 64, step: 2 },
  { key: "bandH", min: 200, max: 540, step: 20 },
  { key: "step", min: 4, max: 14, step: 1 }
];
const BRUSHES = ["spray", "marker", "marker2", "2B", "HB", "charcoal", "pen", "rotring", "cpencil"];

let p5instance = null;
let lastPoster = null;
let currentSeries = null;
const overrides = { width: 1280 };
const renderOpts = { brush: "spray", opacity: 0.85, curvature: 0.5, brushScale: 1.1, bgTexture: true };

async function loadSeries(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not load ${url} (${res.status})`);
  return res.json();
}

function render() {
  if (!currentSeries) return;
  const poster = computePoster(currentSeries, overrides);
  lastPoster = poster;
  if (p5instance) p5instance.remove();
  buildOverlay(poster, currentSeries);

  const sketch = (p) => {
    p.setup = () => {
      const c = p.createCanvas(poster.width, poster.height, p.WEBGL);
      c.parent("canvas-host");
      p.pixelDensity(2);
      p.noLoop();
      try {
        brush.instance(p);
        brush.load();
      } catch (e) {
        console.warn("p5.brush unavailable, native fallback:", e);
      }
    };
    p.draw = () => {
      p.translate(-poster.width / 2, -poster.height / 2);
      p.background(BG);
      drawSideSwitches(p, poster);
      drawStrokes(p, poster);
    };
  };
  p5instance = new p5(sketch);
}

function drawSideSwitches(p, poster) {
  p.push();
  p.stroke(255, 255, 255, 18);
  p.strokeWeight(1);
  for (const s of poster.sideSwitches) p.line(s.x, s.y, s.x, s.y + s.h);
  p.pop();
}

// Paint each pre-traced flow polyline. Points are [x, y, pressure] so the brush
// tapers along the stroke. Many strokes at low opacity build depth.
function drawStrokes(p, poster) {
  const haveBrush = typeof brush.spline === "function";
  if (haveBrush) {
    try {
      brush.scaleBrushes?.(renderOpts.brushScale);
    } catch {
      /* optional */
    }
  }
  const alpha = Math.round(renderOpts.opacity * 255);
  for (const s of poster.strokes) {
    if (s.points.length < 2) continue;
    if (haveBrush) {
      try {
        const col = p.color(s.color);
        col.setAlpha(alpha);
        brush.set(renderOpts.brush, col, s.weight);
        brush.spline(s.points, renderOpts.curvature);
        continue;
      } catch {
        /* fall through to native */
      }
    }
    const col = p.color(s.color);
    col.setAlpha(alpha);
    p.noFill();
    p.stroke(col);
    p.strokeWeight(s.weight);
    p.beginShape();
    p.curveVertex(s.points[0][0], s.points[0][1]);
    for (const pt of s.points) p.curveVertex(pt[0], pt[1]);
    const last = s.points[s.points.length - 1];
    p.curveVertex(last[0], last[1]);
    p.endShape();
  }
}

// Crisp text as positioned DOM over the canvas (WEBGL text needs a font file;
// DOM stays sharp and html2canvas snapshots canvas + DOM together into the PNG).
function buildOverlay(poster, series) {
  const host = $("canvas-host");
  host.style.width = poster.width + "px";
  host.style.height = poster.height + "px";
  host.querySelectorAll(".overlay, .bg-data").forEach((n) => n.remove());

  if (renderOpts.bgTexture) {
    const unit = series.maps
      .map((m) => {
        const seq = m.rounds.map((r) => (r.winner === "a" ? "▮" : "▯")).join("");
        return `${m.name.toUpperCase()} ${m.score.a}-${m.score.b}  ${seq}`;
      })
      .join("   //   ");
    const bg = document.createElement("div");
    bg.className = "bg-data";
    bg.textContent = (unit + "   //   ").repeat(120);
    host.appendChild(bg);
  }

  const h = poster.header;
  const add = (cls, html, style) => {
    const d = document.createElement("div");
    d.className = "overlay " + cls;
    d.innerHTML = html;
    Object.assign(d.style, style);
    host.appendChild(d);
  };

  add(
    "header",
    `<div class="event">${h.event}${h.stage ? " · " + h.stage : ""}</div>
     <div class="title">
       <span style="color:${h.teamA.color}">${h.teamA.name}</span>
       <span class="score">${h.seriesScore.a}–${h.seriesScore.b}</span>
       <span style="color:${h.teamB.color}">${h.teamB.name}</span>
     </div>
     <div class="date">${h.date || ""} · ${(h.format || "").toUpperCase()}</div>`,
    { left: "0", top: "40px", width: poster.width + "px" }
  );

  for (const b of poster.bands) {
    add(
      "maplabel",
      `<span class="mapname">${b.name}</span>
       <span class="mapscore">${b.scoreA}–${b.scoreB}</span>
       ${b.overtime ? '<span class="tag">OT</span>' : ""}
       ${b.decider ? '<span class="tag dec">DECIDER</span>' : ""}`,
      { left: b.x + "px", top: b.y - 30 + "px", width: b.w + "px" }
    );
  }
}

async function savePng() {
  const host = $("canvas-host");
  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(host, { backgroundColor: BG, scale: 2, useCORS: true });
  const a = document.createElement("a");
  const name = (lastPoster?.header.event || "poster").replace(/\W+/g, "-").toLowerCase();
  a.download = `${name}.png`;
  a.href = canvas.toDataURL("image/png");
  a.click();
}

function buildPanel() {
  const panel = $("panel");
  if (!panel) return;
  const mk = (label, input) => {
    const row = document.createElement("label");
    row.className = "ctl";
    row.innerHTML = `<span>${label}</span>`;
    row.appendChild(input);
    panel.appendChild(row);
    return row;
  };

  for (const k of KNOBS) {
    const val = overrides[k.key] ?? DEFAULTS[k.key];
    const inp = document.createElement("input");
    Object.assign(inp, { type: "range", min: k.min, max: k.max, step: k.step, value: val });
    const row = mk(`${k.key} <b>${val}</b>`, inp);
    inp.addEventListener("input", () => {
      overrides[k.key] = parseFloat(inp.value);
      row.querySelector("b").textContent = inp.value;
      render();
    });
  }

  const brushSel = document.createElement("select");
  brushSel.innerHTML = BRUSHES.map((b) => `<option ${b === renderOpts.brush ? "selected" : ""}>${b}</option>`).join("");
  brushSel.addEventListener("change", () => { renderOpts.brush = brushSel.value; render(); });
  mk("brush", brushSel);

  for (const [key, min, max, step] of [["opacity", 0.1, 1, 0.05], ["curvature", 0, 1, 0.05], ["brushScale", 0.5, 2.5, 0.1]]) {
    const inp = document.createElement("input");
    Object.assign(inp, { type: "range", min, max, step, value: renderOpts[key] });
    const row = mk(`${key} <b>${renderOpts[key]}</b>`, inp);
    inp.addEventListener("input", () => {
      renderOpts[key] = parseFloat(inp.value);
      row.querySelector("b").textContent = inp.value;
      render();
    });
  }

  const tex = document.createElement("input");
  Object.assign(tex, { type: "checkbox", checked: renderOpts.bgTexture });
  tex.addEventListener("change", () => { renderOpts.bgTexture = tex.checked; render(); });
  mk("bg data texture", tex);
}

async function boot() {
  buildPanel();
  const params = new URLSearchParams(location.search);
  const dataUrl = params.get("data") || "/data/sample-match.json";
  try {
    currentSeries = await loadSeries(dataUrl);
    render();
  } catch (e) {
    $("canvas-host").innerHTML = `<p style="color:#f66">${e.message}</p>`;
  }

  $("file").addEventListener("change", async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    currentSeries = JSON.parse(await f.text());
    render();
  });
  $("save").addEventListener("click", savePng);
}

boot();
