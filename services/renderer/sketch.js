// Renders poster geometry (from layout.js) with p5.brush, plus a crisp DOM
// text overlay. Pure drawing — all geometry/math lives in layout.js.
import p5 from "p5";
import * as brush from "p5.brush";
import { computePoster } from "./layout.js";

const BG = "#111014";
const ATTRACTOR_RADIUS = 220; // px of influence for the gravity bend

const $ = (id) => document.getElementById(id);

async function loadSeries(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not load ${url} (${res.status})`);
  return res.json();
}

let p5instance = null;
let lastPoster = null;

function render(series) {
  const poster = computePoster(series, { width: 1280 });
  lastPoster = poster;
  if (p5instance) p5instance.remove();
  buildOverlay(poster);

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
        console.warn("p5.brush unavailable, falling back to native strokes:", e);
      }
    };

    p.draw = () => {
      p.translate(-poster.width / 2, -poster.height / 2);
      p.background(BG);
      drawBands(p, poster);
      drawSideSwitches(p, poster);
      drawStrokes(p, poster);
      drawAttractors(p, poster);
    };
  };

  p5instance = new p5(sketch);
}

function drawBands(p, poster) {
  p.noStroke();
  for (const b of poster.bands) {
    p.fill(255, 255, 255, b.decider ? 14 : 8);
    p.rect(b.x, b.y, b.w, b.h, 6);
  }
}

function drawSideSwitches(p, poster) {
  p.stroke(255, 255, 255, 40);
  p.strokeWeight(1);
  for (const s of poster.sideSwitches) p.line(s.x, s.y, s.x, s.y + s.h);
}

// Bend a stroke's midpoint toward the nearest attractor (gravity), then paint
// it as a brushed spline. Falls back to a native line if p5.brush is missing.
function drawStrokes(p, poster) {
  const haveBrush = typeof brush.spline === "function";
  for (const s of poster.strokes) {
    const ex = s.x + Math.cos(s.angle) * s.length;
    const ey = s.y + Math.sin(s.angle) * s.length;
    let mx = (s.x + ex) / 2;
    let my = (s.y + ey) / 2;

    const att = nearestAttractor(poster.attractors, mx, my);
    if (att) {
      const dx = att.x - mx;
      const dy = att.y - my;
      const dist = Math.hypot(dx, dy) || 1;
      const fall = Math.max(0, 1 - dist / ATTRACTOR_RADIUS);
      const pull = fall * att.strength * 60;
      mx += (dx / dist) * pull;
      my += (dy / dist) * pull;
    }

    if (haveBrush) {
      try {
        brush.set("marker", s.color, s.weight);
        brush.spline([[s.x, s.y], [mx, my], [ex, ey]], 0.6);
        continue;
      } catch {
        /* fall through to native */
      }
    }
    p.noFill();
    p.stroke(s.color);
    p.strokeWeight(s.weight);
    p.bezier(s.x, s.y, mx, my, mx, my, ex, ey);
  }
}

function drawAttractors(p, poster) {
  const tint = { clutch: "#ffd54a", ace: "#ff5a5a", plant: "#7ad1ff" };
  for (const a of poster.attractors) {
    const r = 10 + a.strength * 22;
    p.noStroke();
    p.fill(tint[a.kind] || "#ffffff");
    p.drawingContext.globalAlpha = 0.18;
    p.circle(a.x, a.y, r * 2);
    p.drawingContext.globalAlpha = 1;
    p.fill(tint[a.kind] || "#ffffff");
    p.circle(a.x, a.y, 5);
  }
}

function nearestAttractor(attractors, x, y) {
  let best = null;
  let bestD = ATTRACTOR_RADIUS;
  for (const a of attractors) {
    const d = Math.hypot(a.x - x, a.y - y);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

// Crisp text + score as positioned DOM over the canvas (WEBGL text is painful;
// html2canvas snapshots canvas + this overlay together into the PNG).
function buildOverlay(poster) {
  const host = $("canvas-host");
  host.style.width = poster.width + "px";
  host.style.height = poster.height + "px";
  host.querySelectorAll(".overlay").forEach((n) => n.remove());

  const h = poster.header;
  const add = (cls, html, style) => {
    const d = document.createElement("div");
    d.className = "overlay " + cls;
    d.innerHTML = html;
    Object.assign(d.style, style);
    host.appendChild(d);
    return d;
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

async function boot() {
  const params = new URLSearchParams(location.search);
  const dataUrl = params.get("data") || "/data/sample-match.json";
  try {
    render(await loadSeries(dataUrl));
  } catch (e) {
    $("canvas-host").innerHTML = `<p style="color:#f66">${e.message}</p>`;
  }

  $("file").addEventListener("change", async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    render(JSON.parse(await f.text()));
  });
  $("save").addEventListener("click", savePng);
}

boot();
