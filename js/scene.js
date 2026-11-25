// scene.js — the living window view, drawn on a single <canvas> (no images).
// Sky/lighting follow the theme, and rain / fire / wind react to the mixer.

const T = {
  dawn: {
    skyTop: [110, 126, 190], skyMid: [238, 156, 150], skyBot: [253, 214, 160],
    hill1: [128, 104, 144], hill2: [96, 80, 120], tree: [62, 52, 86], wall: [76, 58, 80],
    sun: [255, 236, 190], cloud: [255, 205, 190],
    sunA: 1, sunX: 0.28, sunY: 0.8, moonA: 0, stars: 0.12,
  },
  day: {
    skyTop: [86, 160, 226], skyMid: [140, 200, 240], skyBot: [214, 238, 250],
    hill1: [104, 158, 132], hill2: [70, 122, 104], tree: [40, 92, 78], wall: [94, 78, 66],
    sun: [255, 244, 200], cloud: [255, 255, 255],
    sunA: 1, sunX: 0.72, sunY: 0.2, moonA: 0, stars: 0,
  },
  dusk: {
    skyTop: [60, 50, 112], skyMid: [172, 88, 132], skyBot: [246, 152, 102],
    hill1: [96, 62, 112], hill2: [64, 46, 94], tree: [38, 28, 66], wall: [46, 35, 64],
    sun: [255, 172, 112], cloud: [232, 142, 142],
    sunA: 1, sunX: 0.76, sunY: 0.82, moonA: 0, stars: 0.45,
  },
  night: {
    skyTop: [8, 12, 36], skyMid: [18, 28, 66], skyBot: [40, 52, 100],
    hill1: [28, 36, 70], hill2: [18, 24, 52], tree: [10, 14, 34], wall: [22, 28, 46],
    sun: [255, 240, 200], cloud: [62, 74, 112],
    sunA: 0, sunX: 0.5, sunY: 1.1, moonA: 1, stars: 1,
  },
};

const clone = (p) => JSON.parse(JSON.stringify(p));
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mixc = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** Move every field of palette `p` toward `target` by fraction k. */
function approach(p, target, k) {
  for (const key of Object.keys(target)) {
    p[key] = Array.isArray(target[key]) ? mixc(p[key], target[key], k) : p[key] + (target[key] - p[key]) * k;
  }
}

export function createScene(canvas, { windowBottom }) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { setTheme() {}, setWeather() {} };

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let animate = !motionQuery.matches;
  let W = 0, H = 0;
  let pal = clone(T.night);
  let target = T.night;
  const weather = { rain: 0, fire: 0, wind: 0 };
  const goal = { rain: 0, fire: 0, wind: 0 };
  let t = 0, last = 0, raf = 0, pending = false;
  const par = { x: 0, y: 0 }, parT = { x: 0, y: 0 }; // pointer parallax, -1..1, smoothed

  // Fixed random scenery, generated once.
  const stars = Array.from({ length: 80 }, () => ({ x: Math.random(), y: Math.random() * 0.7, r: Math.random() * 1.2 + 0.4, ph: Math.random() * 6.28 }));
  const clouds = Array.from({ length: 6 }, () => ({ x: Math.random(), y: 0.08 + Math.random() * 0.35, s: 0.7 + Math.random() * 0.8, v: 0.004 + Math.random() * 0.006 }));
  const trees = Array.from({ length: 11 }, (_, i) => ({ x: (i + Math.random() * 0.6) / 11, h: 0.16 + Math.random() * 0.14, ph: Math.random() * 6.28 }));
  const streaks = Array.from({ length: 110 }, () => ({ x: Math.random(), y: Math.random(), v: 1.1 + Math.random() * 0.9, l: 0.05 + Math.random() * 0.06 }));
  let drops = [];
  let vig = null; // cached vignette layer

  function resize() {
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const budget = 2.2e6; // the scene is soft anyway; don't pay for 4K pixels
    if (W * H * dpr * dpr > budget) dpr = Math.max(1, Math.sqrt(budget / (W * H)));
    vig = null;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    requestFrame();
  }

  function update(dt) {
    const k = animate ? 1 - Math.exp(-dt * 1.8) : 1;
    approach(pal, target, k);
    for (const key of ['rain', 'fire', 'wind']) weather[key] += (goal[key] - weather[key]) * (animate ? 1 - Math.exp(-dt * 1.5) : 1);
    if (!animate) return;
    t += dt;
    const kp = 1 - Math.exp(-dt * 3.5);
    par.x += (parT.x - par.x) * kp; par.y += (parT.y - par.y) * kp;
    for (const c of clouds) { c.x += c.v * dt * (1 + weather.wind * 5); if (c.x > 1.25) c.x = -0.25; }
    for (const s of streaks) {
      s.y += s.v * dt;
      s.x -= s.v * dt * 0.18;
      if (s.y > 1.1) { s.y = -0.1; s.x = Math.random() * 1.2; }
    }
    // window droplets
    if (weather.rain > 0.15 && drops.length < 36 && Math.random() < dt * weather.rain * 5) {
      drops.push({ x: Math.random(), y: Math.random() * 0.85, r: 1.6 + Math.random() * 2.6, slide: Math.random() < 0.4 ? t + Math.random() * 4 : Infinity, v: 0 });
    }
    for (const d of drops) {
      if (t > d.slide) { d.v = 0.03 + Math.random() * 0.002 + 0.03 * Math.abs(Math.sin(t * 2 + d.x * 9)); d.y += d.v * dt; if (Math.random() < dt * 0.6) d.slide = t + 1 + Math.random() * 3; }
    }
    drops = drops.filter((d) => d.y < 1 && (weather.rain > 0.05 || Math.random() > dt * 2));
  }

  /** Darken and desaturate a sky colour when it's raining. */
  const sky = (c) => {
    const l = ((c[0] + c[1] + c[2]) / 3) * 0.85;
    return mixc(c, [l, l * 1.02, l * 1.08], weather.rain * 0.55);
  };

  function hills(x0, w, baseY, amp, f1, p1, color) {
    ctx.beginPath();
    ctx.moveTo(x0, baseY + 400);
    for (let x = 0; x <= w; x += 10) {
      const u = x / w;
      ctx.lineTo(x0 + x, baseY - amp * (Math.sin(u * f1 + p1) + 0.5 * Math.sin(u * f1 * 2.3 + p1 * 2)) - amp);
    }
    ctx.lineTo(x0 + w, baseY + 400);
    ctx.closePath();
    ctx.fillStyle = rgba(color);
    ctx.fill();
  }

  function cloud(cx, cy, s, color, a) {
    ctx.fillStyle = rgba(color, a);
    for (const [dx, dy, r] of [[0, 0, 22], [24, 6, 17], [-24, 7, 16], [8, -10, 18], [-10, 8, 20]]) {
      ctx.beginPath(); ctx.arc(cx + dx * s, cy + dy * s, r * s, 0, 6.283); ctx.fill();
    }
  }

  function pine(x, baseY, h, sway, color) {
    const w = h * 0.42;
    ctx.fillStyle = rgba(color);
    for (let i = 0; i < 3; i++) {
      const top = baseY - h + (i * h) / 3.4;
      const bot = baseY - h * 0.1 - ((2 - i) * h) / 3.6 + h * 0.05;
      const wid = w * (0.55 + i * 0.28);
      ctx.beginPath();
      ctx.moveTo(x + sway * (1 - i * 0.3), top);
      ctx.lineTo(x + wid + sway * (0.4 - i * 0.1), bot + h * 0.2);
      ctx.lineTo(x - wid + sway * (0.4 - i * 0.1), bot + h * 0.2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillRect(x - 2, baseY - h * 0.1, 4, h * 0.12);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    // --- wall ---
    const wall = pal.wall;
    const wg = ctx.createLinearGradient(0, 0, 0, H);
    wg.addColorStop(0, rgba(mixc(wall, [0, 0, 0], 0.15)));
    wg.addColorStop(1, rgba(mixc(wall, [0, 0, 0], 0.45)));
    ctx.fillStyle = wg;
    ctx.fillRect(0, 0, W, H);

    // --- window geometry ---
    const wx = W * 0.025 + 8, wy = W < 700 ? 74 : 86, ww = W - wx * 2; // top inset leaves room for the floating nav
    const wb = Math.max(H * 0.3, windowBottom());
    const wh = wb - wy;

    ctx.save();
    ctx.beginPath();
    ctx.rect(wx, wy, ww, wh);
    ctx.clip();

    // sky
    const g = ctx.createLinearGradient(0, wy, 0, wb);
    g.addColorStop(0, rgba(sky(pal.skyTop)));
    g.addColorStop(0.55, rgba(sky(pal.skyMid)));
    g.addColorStop(1, rgba(sky(pal.skyBot)));
    ctx.fillStyle = g;
    ctx.fillRect(wx, wy, ww, wh);

    // stars
    const starA = pal.stars * (1 - weather.rain * 0.7);
    if (starA > 0.02) {
      for (const s of stars) {
        const tw = animate ? 0.6 + 0.4 * Math.sin(t * 1.5 + s.ph) : 1;
        ctx.fillStyle = `rgba(255,255,255,${starA * tw})`;
        ctx.beginPath(); ctx.arc(wx + s.x * ww, wy + s.y * wh, s.r, 0, 6.283); ctx.fill();
      }
    }
    // sun
    const sunA = pal.sunA * (1 - weather.rain * 0.85);
    if (sunA > 0.02) {
      const sx = wx + ww * pal.sunX + par.x * -4, sy = wy + wh * pal.sunY + par.y * -3, R = Math.min(ww, wh) * 0.09;
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, R * 4.5);
      glow.addColorStop(0, rgba(pal.sun, 0.55 * sunA));
      glow.addColorStop(1, rgba(pal.sun, 0));
      ctx.fillStyle = glow; ctx.fillRect(sx - R * 4.5, sy - R * 4.5, R * 9, R * 9);
      ctx.fillStyle = rgba(pal.sun, sunA);
      ctx.beginPath(); ctx.arc(sx, sy, R, 0, 6.283); ctx.fill();
    }
    // moon
    const moonA = pal.moonA * (1 - weather.rain * 0.75);
    if (moonA > 0.02) {
      const mx = wx + ww * 0.24 + par.x * -4, my = wy + wh * 0.26 + par.y * -3, R = Math.min(ww, wh) * 0.07;
      const glow = ctx.createRadialGradient(mx, my, R * 0.6, mx, my, R * 4);
      glow.addColorStop(0, `rgba(200,215,255,${0.3 * moonA})`);
      glow.addColorStop(1, 'rgba(200,215,255,0)');
      ctx.fillStyle = glow; ctx.fillRect(mx - R * 4, my - R * 4, R * 8, R * 8);
      ctx.fillStyle = `rgba(236,240,255,${moonA})`;
      ctx.beginPath(); ctx.arc(mx, my, R, 0, 6.283); ctx.fill();
      ctx.fillStyle = `rgba(170,182,220,${0.35 * moonA})`;
      for (const [dx, dy, r] of [[-0.3, -0.2, 0.22], [0.25, 0.1, 0.16], [-0.05, 0.4, 0.12]]) {
        ctx.beginPath(); ctx.arc(mx + dx * R, my + dy * R, r * R, 0, 6.283); ctx.fill();
      }
    }
    // clouds (more and darker in rain)
    const cloudA = 0.55 + weather.rain * 0.35;
    const cloudC = mixc(pal.cloud, [110, 118, 135], weather.rain * 0.7);
    for (const c of clouds) cloud(wx + c.x * ww + par.x * -6, wy + c.y * wh + par.y * -3, c.s * Math.min(1.3, ww / 520 + 0.4), cloudC, cloudA);

    // hills + trees
    hills(wx - 60 + par.x * -14, ww + 120, wb - wh * 0.22, wh * 0.06, 5.5, 1.2, mixc(pal.hill1, [60, 70, 85], weather.rain * 0.3));
    hills(wx - 60 + par.x * -26, ww + 120, wb - wh * 0.1, wh * 0.05, 4, 4.1, mixc(pal.hill2, [40, 50, 62], weather.rain * 0.3));
    const sw = animate ? 1 : 0;
    for (const tr of trees) {
      const h = tr.h * wh;
      const sway = Math.sin(t * 1.3 + tr.ph) * (1.2 + weather.wind * 7) * (h / 60) * sw;
      pine(wx + (tr.x * 1.08 - 0.04) * ww + par.x * -40, wb + 2 + par.y * -3, h, sway, pal.tree);
    }

    // rain streaks
    if (animate && weather.rain > 0.03) {
      ctx.strokeStyle = `rgba(210,225,255,${0.35 * weather.rain})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const n = Math.floor(streaks.length * weather.rain);
      for (let i = 0; i < n; i++) {
        const s = streaks[i];
        const x = wx + s.x * ww, y = wy + s.y * wh, l = s.l * wh;
        ctx.moveTo(x, y); ctx.lineTo(x + l * 0.18, y - l);
      }
      ctx.stroke();
    }

    // glass: soft reflection + droplets
    const refl = ctx.createLinearGradient(wx, wy, wx + ww * 0.6, wy + wh);
    refl.addColorStop(0, 'rgba(255,255,255,0.10)');
    refl.addColorStop(0.35, 'rgba(255,255,255,0.02)');
    refl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = refl; ctx.fillRect(wx, wy, ww, wh);
    if (weather.rain > 0.05) {
      ctx.fillStyle = `rgba(255,255,255,${0.04 * weather.rain})`;
      ctx.fillRect(wx, wy, ww, wh);
      const a = Math.min(1, weather.rain * 3);
      for (const d of drops) {
        const x = wx + d.x * ww, y = wy + d.y * wh;
        if (d.v > 0) { ctx.strokeStyle = `rgba(255,255,255,${0.08 * a})`; ctx.lineWidth = d.r * 0.6; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 14); ctx.stroke(); }
        ctx.fillStyle = `rgba(255,255,255,${0.16 * a})`;
        ctx.beginPath(); ctx.ellipse(x, y, d.r, d.r * 1.3, 0, 0, 6.283); ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${0.55 * a})`;
        ctx.beginPath(); ctx.arc(x - d.r * 0.3, y - d.r * 0.4, d.r * 0.28, 0, 6.283); ctx.fill();
      }
    }
    ctx.restore();

    // --- window frame ---
    const fr = 9;
    ctx.fillStyle = '#2b2019';
    ctx.fillRect(wx - fr, wy - fr, ww + fr * 2, fr);             // top
    ctx.fillRect(wx - fr, wy - fr, fr, wh + fr * 2);             // left
    ctx.fillRect(wx + ww, wy - fr, fr, wh + fr * 2);             // right
    ctx.fillRect(wx - fr, wb, ww + fr * 2, fr);                  // bottom
    ctx.fillRect(wx + ww / 2 - 3.5, wy, 7, wh);                  // vertical mullion
    ctx.fillRect(wx, wy + wh * 0.46 - 3.5, ww, 7);               // horizontal mullion
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(wx - fr, wy - fr, ww + fr * 2, 2);
    // sill
    ctx.fillStyle = '#3d2e24';
    ctx.fillRect(wx - fr - 8, wb + fr - 2, ww + fr * 2 + 16, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(wx - fr - 8, wb + fr - 2, ww + fr * 2 + 16, 2);

    // --- sill objects: plant (left) and mug with steam (right) ---
    const sillY = wb + fr - 2;
    const px = wx + Math.min(60, ww * 0.1);
    ctx.fillStyle = '#b0624a';
    ctx.beginPath(); ctx.moveTo(px - 14, sillY - 22); ctx.lineTo(px + 14, sillY - 22); ctx.lineTo(px + 10, sillY); ctx.lineTo(px - 10, sillY); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c47658'; ctx.fillRect(px - 16, sillY - 26, 32, 6);
    ctx.fillStyle = '#467f5c';
    for (let i = -2; i <= 2; i++) {
      const sway = Math.sin(t * 1.5 + i) * (0.8 + weather.wind * 4) * sw;
      ctx.beginPath();
      ctx.ellipse(px + i * 7 + sway, sillY - 42 - (2 - Math.abs(i)) * 5, 5, 17, i * 0.35, 0, 6.283);
      ctx.fill();
    }
    const mx = wx + ww - Math.min(70, ww * 0.12);
    ctx.fillStyle = '#e4d8c6';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(mx - 12, sillY - 22, 24, 22, 4) : ctx.rect(mx - 12, sillY - 22, 24, 22); ctx.fill();
    ctx.strokeStyle = '#e4d8c6'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(mx + 13, sillY - 11, 6, -1.4, 1.4); ctx.stroke();
    ctx.fillStyle = 'rgba(70,40,25,0.8)'; ctx.fillRect(mx - 10, sillY - 21, 20, 3);
    if (animate) {
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        const ph = t * 1.2 + i * 2;
        ctx.moveTo(mx - 6 + i * 6, sillY - 26);
        ctx.bezierCurveTo(mx - 10 + i * 6 + Math.sin(ph) * 4, sillY - 34, mx - 2 + i * 6 + Math.cos(ph) * 4, sillY - 40, mx - 6 + i * 6 + Math.sin(ph + 1) * 3, sillY - 50);
        ctx.stroke();
      }
    }

    // --- fire glow (warm, flickering, additive) ---
    if (weather.fire > 0.01) {
      const fl = animate ? 0.8 + 0.12 * Math.sin(t * 9) + 0.08 * Math.sin(t * 5.3 + 1) + 0.05 * Math.sin(t * 17) : 0.85;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const [cx, cy, r, a] of [[W * 0.5, H * 1.02, H * 0.95, 0.34], [W * 0.1, H, H * 0.6, 0.16], [W * 0.9, H, H * 0.6, 0.16]]) {
        const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        fg.addColorStop(0, `rgba(255,140,50,${a * weather.fire * fl})`);
        fg.addColorStop(1, 'rgba(255,90,20,0)');
        ctx.fillStyle = fg; ctx.fillRect(0, H * 0.2, W, H * 0.8);
      }
      ctx.restore();
    }

    // vignette
    if (!vig) {
      vig = document.createElement('canvas');
      vig.width = canvas.width; vig.height = canvas.height;
      const vc = vig.getContext('2d');
      vc.scale(canvas.width / W, canvas.height / H);
      const vg = vc.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.8);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.32)');
      vc.fillStyle = vg; vc.fillRect(0, 0, W, H);
    }
    ctx.drawImage(vig, 0, 0, W, H);
  }

  // ---- animation loop (pauses when hidden or when motion is reduced) ----
  // Capped at ~45 fps, and it stops completely while the hero is off-screen or the tab is hidden.
  let visible = true;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - last < 22) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    if (!(animate && visible && !document.hidden)) { cancelAnimationFrame(raf); raf = 0; }
  }
  function requestFrame() {
    if (raf) return;
    last = performance.now() - 30;
    raf = requestAnimationFrame(loop);
  }

  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver((en) => { visible = en[0].isIntersecting; if (visible) requestFrame(); }).observe(canvas);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) requestFrame(); });
  motionQuery.addEventListener?.('change', (e) => { animate = !e.matches; requestFrame(); });

  return {
    /** snap = jump straight to the new palette (used under the circular wipe). */
    setTheme(name, snap = false) { target = T[name] || T.night; if (snap) pal = clone(target); requestFrame(); },
    setParallax(x, y) { parT.x = x; parT.y = y; },
    /** Each value 0..1 (0 = off). */
    setWeather(w) { Object.assign(goal, w); requestFrame(); },
    redraw: requestFrame,
  };
}
