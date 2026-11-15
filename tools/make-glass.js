// Draws the cracked stained-glass window behind the game board and writes it into css/style.css
// (between the "glass-window" markers) as one CSS variable, --glass-window. Run it again to get a
// different arrangement of panes: change SEED, or the grid size.
//
//   node tools/make-glass.js
//
// The window is 1440 x 1000, the same size as the table. Panes are triangles from a jittered grid,
// each tinted faintly with one of a few jewel colours; the lead lines between them are dark.

const fs = require("fs");
const path = require("path");

const SEED = 7, COLS = 12, ROWS = 8, W = 1440, H = 1000;
let s = SEED;
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

// Jittered grid corners (the outer edge stays straight).
const pts = [];
for (let r = 0; r <= ROWS; r++) {
  pts.push([]);
  for (let c = 0; c <= COLS; c++) {
    const edgeX = c === 0 || c === COLS, edgeY = r === 0 || r === ROWS;
    const x = c * W / COLS + (edgeX ? 0 : (rnd() - 0.5) * W / COLS * 0.7);
    const y = r * H / ROWS + (edgeY ? 0 : (rnd() - 0.5) * H / ROWS * 0.7);
    pts[r].push([Math.round(x), Math.round(y)]);
  }
}

// Jewel tints (hue, alpha), picked at random per pane.
const TINTS = ["hsla(265,70%,55%,.30)", "hsla(215,75%,50%,.26)", "hsla(175,65%,40%,.20)", "hsla(330,65%,52%,.24)", "hsla(40,85%,50%,.16)", "hsla(265,70%,55%,.12)", "hsla(215,75%,50%,.12)"];
const groups = TINTS.map(() => []);
const tri = (a, b, c) => `M${a[0]} ${a[1]}L${b[0]} ${b[1]}L${c[0]} ${c[1]}Z`;
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const a = pts[r][c], b = pts[r][c + 1], d = pts[r + 1][c], e = pts[r + 1][c + 1];
    const t = rnd() < 0.5 ? [[a, b, e], [a, e, d]] : [[a, b, d], [b, e, d]];
    for (const p of t) groups[Math.floor(rnd() * TINTS.length)].push(tri(...p));
  }
}
let svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${H}' preserveAspectRatio='none'>`;
groups.forEach((g, i) => { if (g.length) svg += `<path d='${g.join("")}' fill='${TINTS[i]}' stroke='%2304020a' stroke-width='6' stroke-linejoin='round'/>`; });
svg += `</svg>`;
const uri = `url("data:image/svg+xml,${svg.replace(/#/g, "%23").replace(/"/g, "'").replace(/</g, "%3C").replace(/>/g, "%3E")}")`;

const file = path.join(__dirname, "..", "css", "style.css");
const css = fs.readFileSync(file, "utf8");
const re = /\/\* glass-window:start \*\/[\s\S]*?\/\* glass-window:end \*\//;
if (!re.test(css)) throw new Error("css/style.css has no glass-window markers");
fs.writeFileSync(file, css.replace(re, `/* glass-window:start */\n  --glass-window: ${uri};\n  /* glass-window:end */`));
console.log(`Wrote the window: ${groups.reduce((n, g) => n + g.length, 0)} panes, ${Math.round(uri.length / 1024)} KB.`);
