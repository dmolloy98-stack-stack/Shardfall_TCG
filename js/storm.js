// The main menu background. Loaded after js/ui.js; showScreen() starts and stops it.

// ---------------------------------------------------------------------------
// Menu background: crystal shards falling like meteors through a night sky.
// Each shard spins and tumbles; nearer ones are bigger, faster and leave a trail.
// ---------------------------------------------------------------------------
const storm = (() => {
  const cv = $("#storm"), ctx = cv.getContext("2d");
  // Shard colors: [light core, deep edge, glow rgb]. Later each faction could get its own.
  const PALETTE = [
    ["#ffffff", "#bcd8ff", "190,220,255"],
    ["#eef6ff", "#3b82f6", "90,150,255"],
    ["#e6f1ff", "#6ba3ff", "120,170,255"],
    ["#ffffff", "#d3e6ff", "210,230,255"],
  ];
  // Outline of a crystal shard (unit size): a long, uneven hexagon with a sharp tip.
  const SHAPE = [[0, -1.7], [0.55, -0.55], [0.45, 0.85], [0, 1.25], [-0.5, 0.75], [-0.58, -0.6]];
  const DIR = { x: -0.34, y: 0.94 };   // falling down and slightly to the left
  let raf = 0, last = 0, w = 0, h = 0, shards = [], stars = [], nextStar = 3;
  const motionOff = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let reduce = motionOff;   // still: reduced motion, or Heavy effects turned off in Settings

  function shard(anywhere, big) {
    const z = big ? 1 : Math.random() ** 1.6;                 // depth: most shards are far away
    return {
      x: Math.random() * (w + h * 0.4),
      y: anywhere ? Math.random() * h : -40 - Math.random() * h * 0.4,
      z, big,
      size: big ? 30 : 5 + z * 19,
      speed: big ? 760 : 70 + z * 330,
      rot: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * (1 + z * 3),
      flip: Math.random() * Math.PI * 2, flipSpeed: 1 + Math.random() * 3,
      colors: PALETTE[Math.floor(Math.random() * PALETTE.length)],
    };
  }
  function size() {
    w = innerWidth; h = innerHeight;
    cv.width = w * devicePixelRatio; cv.height = h * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    const n = Math.min(55, Math.round((w * h) / 16000));
    shards = Array.from({ length: n }, () => shard(true));
    stars = Array.from({ length: Math.round((w * h) / 9000) }, () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.2 + 0.2, t: Math.random() * 6 }));
  }

  function sky(t) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#04060f"); g.addColorStop(0.55, "#0a1226"); g.addColorStop(1, "#0b1026");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // a faint violet glow over the horizon where the shards land
    const rg = ctx.createRadialGradient(w / 2, h * 1.1, 10, w / 2, h * 1.1, h * 0.8);
    rg.addColorStop(0, "rgba(90,140,255,0.22)"); rg.addColorStop(1, "rgba(90,140,255,0)");
    ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
    for (const s of stars) {
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 1.3 + s.t);
      ctx.fillStyle = "#e6f0ff";
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }

  function drawShard(s) {
    const [core, edge, glow] = s.colors;
    const a = 0.35 + s.z * 0.65;                              // far shards are dimmer
    ctx.globalCompositeOperation = "lighter";
    if (s.z > 0.3) {
      // the meteor trail, pointing back up the way it came
      const len = s.size * 5 + s.speed * 0.22;
      const tx = s.x - DIR.x * len, ty = s.y - DIR.y * len;
      const tg = ctx.createLinearGradient(s.x, s.y, tx, ty);
      tg.addColorStop(0, `rgba(${glow},${0.55 * a})`); tg.addColorStop(1, `rgba(${glow},0)`);
      ctx.strokeStyle = tg; ctx.lineWidth = s.size * 0.7; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(tx, ty); ctx.stroke();
    }
    // soft glow around the crystal
    const gr = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size * 2.6);
    gr.addColorStop(0, `rgba(${glow},${0.35 * a})`); gr.addColorStop(1, `rgba(${glow},0)`);
    ctx.fillStyle = gr; ctx.fillRect(s.x - s.size * 3, s.y - s.size * 3, s.size * 6, s.size * 6);
    ctx.globalCompositeOperation = "source-over";

    // the crystal itself, tumbling: squashing it sideways makes it look like it turns in 3D
    ctx.save();
    ctx.translate(s.x, s.y); ctx.rotate(s.rot);
    const turn = Math.cos(s.flip);
    ctx.scale(s.size * (0.25 + 0.75 * Math.abs(turn)), s.size);
    ctx.globalAlpha = a;
    const fg = ctx.createLinearGradient(-0.6, -1.7, 0.6, 1.3);
    fg.addColorStop(0, turn > 0 ? core : edge); fg.addColorStop(0.5, "#ffffff"); fg.addColorStop(1, turn > 0 ? edge : core);
    ctx.fillStyle = fg;
    ctx.beginPath(); SHAPE.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); ctx.fill();
    // facets
    ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 0.06;
    ctx.beginPath(); ctx.moveTo(0, -1.7); ctx.lineTo(0.1 * turn, 0.2); ctx.lineTo(0, 1.25);
    ctx.moveTo(0.55, -0.55); ctx.lineTo(0.1 * turn, 0.2); ctx.lineTo(-0.58, -0.6); ctx.stroke();
    ctx.strokeStyle = `rgba(${glow},0.9)`; ctx.lineWidth = 0.08;
    ctx.beginPath(); SHAPE.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
    sky(t / 1000);
    if (!reduce) {
      // now and then a big, bright shard streaks across
      nextStar -= dt;
      if (nextStar <= 0) { shards.push(shard(false, true)); nextStar = 4 + Math.random() * 5; }
    }
    shards.sort((a, b) => a.z - b.z);
    for (const s of shards) {
      if (!reduce) {
        s.x += DIR.x * s.speed * dt; s.y += DIR.y * s.speed * dt;
        s.rot += s.spin * dt; s.flip += s.flipSpeed * dt;
      }
      drawShard(s);
    }
    // shards that fall off the screen start again at the top; big ones just go
    shards = shards.flatMap(s => (s.y > h + 80 || s.x < -120 ? (s.big ? [] : [shard(false)]) : [s]));
    if (!reduce) raf = requestAnimationFrame(frame);
  }
  addEventListener("resize", () => { if (raf || reduce) { size(); if (reduce) frame(performance.now()); } });
  return {
    start() { reduce = motionOff || document.documentElement.classList.contains("light-fx"); if (!raf) { size(); last = performance.now(); if (reduce) frame(last); else raf = requestAnimationFrame(frame); } },
    stop() { cancelAnimationFrame(raf); raf = 0; },
  };
})();
