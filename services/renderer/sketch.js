// Paints poster geometry (layout.js) with p5.brush on a light ground, plus a
// minimal DOM text overlay and a live tuning panel. Computes no composition.
//
// Why brush.spline over points (not brush.flowLine): p5.brush's field sets each
// step heading = field - plotAngle (field replaces direction), so one global
// field can't do team-A-left AND team-B-right. layout.js owns the field and
// emits curved polylines with per-point pressure; here we just stroke them.
import p5 from "p5";
import * as brush from "p5.brush";
import { computePoster, DEFAULTS } from "./layout.js";

const PAPER = "#f4f0e7"; // cream ground
const INK = "#1c1a17";
const $ = (id) => document.getElementById(id);

const KNOBS = [
  { key: "cols", min: 4, max: 14, step: 1 },
  { key: "strokesPerCell", min: 4, max: 60, step: 2 },
  { key: "baseLenFrac", min: 0.2, max: 1.4, step: 0.05 },
  { key: "lenVar", min: 0, max: 1, step: 0.05 },
  { key: "swirl", min: 0, max: 2.5, step: 0.05 },
  { key: "pull", min: 0, max: 1.5, step: 0.05 },
  { key: "ambient", min: 0, max: 0.5, step: 0.02 },
  { key: "taper", min: 0.05, max: 1, step: 0.05 },
  { key: "wellRadiusFrac", min: 0.1, max: 0.6, step: 0.02 },
  { key: "step", min: 4, max: 14, step: 1 }
];
const BRUSHES = ["spray", "marker", "marker2", "2B", "HB", "charcoal", "pen", "rotring", "cpencil"];

let p5instance = null;
let lastPoster = null;
let currentSeries = null;
const overrides = {};
const renderOpts = {
  brush: "spray", opacity: 0.32, curvature: 0.5, brushScale: 0.9,
  showGrid: false, showWells: true, mockClutches: true, bgTexture: true
};

async function loadSeries(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not load ${url} (${res.status})`);
  return res.json();
}

function render() {
  if (!currentSeries) return;
  const poster = computePoster(currentSeries, { ...overrides, mockClutches: renderOpts.mockClutches });
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
      p.background(PAPER);
      if (renderOpts.showGrid) drawGrid(p, poster);
      drawStrokes(p, poster);
      if (renderOpts.showWells) drawWells(p, poster);
    };
  };
  p5instance = new p5(sketch);
}

function drawGrid(p, poster) {
  const g = poster.grid;
  p.push();
  p.stroke(INK);
  p.drawingContext.globalAlpha = 0.12;
  p.strokeWeight(0.6);
  for (const x of g.gridCols) p.line(x, g.gridTop, x, g.gridTop + g.gridH);
  for (const y of g.gridRows) p.line(g.margin, y, g.margin + g.innerW, y);
  p.drawingContext.globalAlpha = 1;
  p.pop();
}

// Many long thin low-opacity flow lines, layered -> they blend into a gradient.
function drawStrokes(p, poster) {
  const haveBrush = typeof brush.spline === "function";
  if (haveBrush) {
    try { brush.scaleBrushes?.(renderOpts.brushScale); } catch { /* optional */ }
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
      } catch { /* fall through */ }
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

// Gravity wells, faint like his final: thin circle + crosshair. Round-number
// label is drawn in the DOM overlay so it stays crisp.
function drawWells(p, poster) {
  p.push();
  p.noFill();
  for (const w of poster.wells) {
    const c = p.color(w.kind === "map" ? INK : w.kind.startsWith("clutch") ? "#c2641e" : "#2f5fa6");
    c.setAlpha(120);
    p.stroke(c);
    p.strokeWeight(0.8);
    p.circle(w.x, w.y, 18);
    const arm = 13;
    p.line(w.x - arm, w.y, w.x + arm, w.y);
    p.line(w.x, w.y - arm, w.x, w.y + arm);
    c.setAlpha(200);
    p.fill(c);
    p.noStroke();
    p.circle(w.x, w.y, 4);
    p.noFill();
  }
  p.pop();
}

// Minimal DOM text: tiny map markers, faint well round-labels, and a small
// boxed score block bottom-right (his only real text). No big header.
function buildOverlay(poster, series) {
  const host = $("canvas-host");
  host.style.width = poster.width + "px";
  host.style.height = poster.height + "px";
  host.querySelectorAll(".overlay, .bg-data").forEach((n) => n.remove());

  if (renderOpts.bgTexture) {
    const unit = series.maps
      .map((m) => `${m.name.toUpperCase()} ${m.score.a}-${m.score.b}  ` +
        m.rounds.map((r) => (r.winner === "a" ? "▮" : "▯")).join(""))
      .join("   //   ");
    const bg = document.createElement("div");
    bg.className = "bg-data";
    bg.textContent = (unit + "   //   ").repeat(120);
    host.appendChild(bg);
  }

  const add = (cls, html, style) => {
    const d = document.createElement("div");
    d.className = "overlay " + cls;
    d.innerHTML = html;
    Object.assign(d.style, style);
    host.appendChild(d);
  };

  for (const m of poster.mapMarkers) {
    add("maptag", `${m.name.toUpperCase()} ${m.scoreA}-${m.scoreB}`,
      { left: m.x + 10 + "px", top: m.y - 8 + "px" });
  }

  if (renderOpts.showWells) {
    for (const w of poster.wells) {
      const label = w.kind === "map" ? `R${w.round}` : w.kind.startsWith("clutch") ? `CLUTCH${w.kind.endsWith("*") ? "*" : ""}` : w.kind.toUpperCase();
      add("welllabel", label, { left: w.x + 12 + "px", top: w.y - 26 + "px" });
    }
  }

  const h = poster.header;
  add(
    "scorebox",
    `<div class="teams">
       <div><span style="color:${h.teamA.color}">●</span> ${h.teamA.name} <b>${h.seriesScore.a}</b></div>
       <div><span style="color:${h.teamB.color}">●</span> ${h.teamB.name} <b>${h.seriesScore.b}</b></div>
     </div>
     <div class="meta">${(h.format || "").toUpperCase()}<br>${h.event}${h.date ? "<br>" + h.date : ""}</div>`,
    { right: poster.cfg.margin + "px", bottom: "46px" }
  );
}

async function savePng() {
  const host = $("canvas-host");
  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(host, { backgroundColor: PAPER, scale: 2, useCORS: true });
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

  for (const [key, min, max, step] of [["opacity", 0.05, 1, 0.02], ["curvature", 0, 1, 0.05], ["brushScale", 0.4, 2, 0.1]]) {
    const inp = document.createElement("input");
    Object.assign(inp, { type: "range", min, max, step, value: renderOpts[key] });
    const row = mk(`${key} <b>${renderOpts[key]}</b>`, inp);
    inp.addEventListener("input", () => {
      renderOpts[key] = parseFloat(inp.value);
      row.querySelector("b").textContent = inp.value;
      render();
    });
  }

  for (const key of ["showGrid", "showWells", "mockClutches", "bgTexture"]) {
    const inp = document.createElement("input");
    Object.assign(inp, { type: "checkbox", checked: renderOpts[key] });
    inp.addEventListener("change", () => { renderOpts[key] = inp.checked; render(); });
    mk(key, inp);
  }
}

async function boot() {
  buildPanel();
  const params = new URLSearchParams(location.search);
  const dataUrl = params.get("data") || "/data/sample-match.json";
  try {
    currentSeries = await loadSeries(dataUrl);
    render();
  } catch (e) {
    $("canvas-host").innerHTML = `<p style="color:#c33;padding:20px">${e.message}</p>`;
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
