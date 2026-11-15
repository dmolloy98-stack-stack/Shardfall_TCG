// Draws the big glowing cracks across the Shattered Crystal board and writes them into css/style.css
// (between the "crystal-cracks" markers) as one CSS variable, --crystal-cracks. Run it again to get a
// different arrangement: change SEED.
//
//   node tools/make-crystal.js
//
// The picture is 1440 x 1000, the same size as the table. Long cracks start at the seam where the two
// players' halves meet and run out toward the corners, forking now and then. Each crack is drawn three
// times, a wide soft glow, a medium glow and a thin bright core, so it looks lit from underneath.

const fs = require("fs");
const path = require("path");

const SEED = 11, W = 1440, H = 1000;
let s = SEED;
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const between = (a, b) => a + rnd() * (b - a);

const paths = [];   // each path is a list of [x, y] points
function crack(x, y, angle, length, depth) {
  const pts = [[x, y]];
  let left = length;
  while (left > 0) {
    const step = between(34, 96);
    angle += between(-0.5, 0.5);
    x += Math.cos(angle) * step; y += Math.sin(angle) * step;
    pts.push([Math.round(x), Math.round(y)]);
    left -= step;
    if (depth < 2 && rnd() < 0.3 && left > 60) crack(x, y, angle + (rnd() < 0.5 ? -1 : 1) * between(0.5, 1.0), left * between(0.35, 0.7), depth + 1);
    if (x < -40 || x > W + 40 || y < -40 || y > H + 40) break;
  }
  paths.push(pts);
}

// Main cracks: out from the middle seam toward the corners and edges.
const SEAM = H * 0.4;
crack(W * 0.22, SEAM, Math.PI * 1.08, 520, 0);
crack(W * 0.22, SEAM, Math.PI * 0.82, 360, 0);
crack(W * 0.5, SEAM, Math.PI * 1.45, 380, 0);
crack(W * 0.5, SEAM, Math.PI * 0.55, 380, 0);
crack(W * 0.78, SEAM, Math.PI * 1.92, 520, 0);
crack(W * 0.78, SEAM, Math.PI * 0.2, 360, 0);

const d = pts => "M" + pts.map(p => p.join(" ")).join("L");
const all = paths.map(d).join("");
const stroke = (w, a) => `<path d='${all}' fill='none' stroke='rgb(205,232,255)' stroke-opacity='${a}' stroke-width='${w}' stroke-linecap='round' stroke-linejoin='round'/>`;
const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${H}' preserveAspectRatio='none'>${stroke(12, 0.07)}${stroke(4.5, 0.2)}${stroke(1.4, 0.85)}</svg>`;
const uri = `url("data:image/svg+xml,${svg.replace(/#/g, "%23").replace(/"/g, "'").replace(/</g, "%3C").replace(/>/g, "%3E")}")`;

const file = path.join(__dirname, "..", "css", "style.css");
const css = fs.readFileSync(file, "utf8");
const re = /\/\* crystal-cracks:start \*\/[\s\S]*?\/\* crystal-cracks:end \*\//;
if (!re.test(css)) throw new Error("css/style.css has no crystal-cracks markers");
fs.writeFileSync(file, css.replace(re, `/* crystal-cracks:start */\n  --crystal-cracks: ${uri};\n  /* crystal-cracks:end */`));
console.log(`Wrote the cracks: ${paths.length} lines, ${Math.round(uri.length / 1024)} KB.`);
