// Headless composition preview -> SVG (zero deps). No spray grain; this only
// verifies the sweep / density / gravity shape of the layout. Rasterize with
// ImageMagick: `magick preview.svg preview.png`.
// Usage: node services/renderer/preview.mjs data/sample-match.json out/preview.svg '{"strokesPerCell":40}'
import { readFileSync, writeFileSync } from "node:fs";
import { computePoster } from "./layout.js";

const [, , dataPath = "data/sample-match.json", outPath = "out/preview.svg", optsJson] = process.argv;
const series = JSON.parse(readFileSync(dataPath, "utf8"));
const opts = optsJson ? JSON.parse(optsJson) : {};
const poster = computePoster(series, opts);
const op = opts.opacity ?? 0.3;

const lines = poster.strokes
  .map((s) => {
    const pts = s.points.map((p) => `${p[0]},${p[1]}`).join(" ");
    return `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="${s.weight}" stroke-opacity="${op}" stroke-linecap="round" style="mix-blend-mode:multiply"/>`;
  })
  .join("\n");

const wells = poster.wells
  .map((w) => {
    const a = 13;
    return `<g stroke="rgba(28,26,23,0.5)" stroke-width="0.8" fill="none">
      <circle cx="${w.x}" cy="${w.y}" r="9"/>
      <line x1="${w.x - a}" y1="${w.y}" x2="${w.x + a}" y2="${w.y}"/>
      <line x1="${w.x}" y1="${w.y - a}" x2="${w.x}" y2="${w.y + a}"/>
    </g>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${poster.width}" height="${poster.height}" viewBox="0 0 ${poster.width} ${poster.height}">
<rect width="100%" height="100%" fill="#f4f0e7"/>
<g>${lines}</g>
${wells}
</svg>`;

writeFileSync(outPath, svg);
console.log(`wrote ${outPath} (${poster.width}x${poster.height}, ${poster.strokes.length} strokes, ${poster.wells.length} wells)`);
