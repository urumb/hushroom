// main.js — app bootstrap: wires the timer, sound engine, scene, tasks and
// stats to the DOM, plus themes, focus mode, shortcuts, dialogs and the
// service worker.

import { load, save, exportAll, importAll, resetAll } from './storage.js';
import { Timer, MODES, DEFAULTS } from './timer.js';
import { SoundEngine, CHANNELS, PRESETS } from './audio.js';
import { createScene } from './scene.js';
import { createTasks } from './tasks.js';
import { recordFocus, renderStats } from './stats.js';

const $ = (id) => document.getElementById(id);
const root = document.documentElement;

// ---------- small helpers ----------
let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

// ======================================================================
// Theme (Dawn / Day / Dusk / Night, plus Auto = follow local time)
// ======================================================================
const THEMES = ['auto', 'dawn', 'day', 'dusk', 'night'];
const THEME_COLOR = { dawn: '#4c3a4e', day: '#5e4c40', dusk: '#2e2440', night: '#14192a' };

function timeTheme(d = new Date()) {
  const h = d.getHours();
  if (h >= 5 && h < 9) return 'dawn';
  if (h >= 9 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'dusk';
  return 'night';
}

// First visit: dark OS → Night, otherwise follow the clock.
let themePref = load('theme', null);
if (!THEMES.includes(themePref)) {
  themePref = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'night' : 'auto';
}

const sceneApi = createScene($('scene'), {
  // The window fills the hero, leaving a thin strip of wall for the sill.
  windowBottom: () => $('stage').clientHeight - 64,
});

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/** Run a DOM change under a circular "iris" wipe that grows from `origin` (View Transitions API; instant elsewhere). */
function iris(origin, change) {
  if (!document.startViewTransition || reducedMotion.matches) { change(); return; }
  const r = origin ? origin.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
  root.style.setProperty('--vx', `${r.left + r.width / 2}px`);
  root.style.setProperty('--vy', `${r.top + r.height / 2}px`);
  document.startViewTransition(async () => {
    change();
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))); // let the canvas redraw
  });
}

function applyTheme(snap = false) {
  const eff = themePref === 'auto' ? timeTheme() : themePref;
  root.dataset.theme = eff;
  sceneApi.setTheme(eff, snap);
  document.querySelector('meta[name="theme-color"]').content = THEME_COLOR[eff];
  document.querySelectorAll('input[name="theme"]').forEach((r) => { r.checked = r.value === themePref; });
}
function setThemePref(p, origin) { themePref = p; save('theme', p); iris(origin, () => applyTheme(true)); }
document.querySelectorAll('input[name="theme"]').forEach((r) => r.addEventListener('change', () => setThemePref(r.value, r.parentElement)));
setInterval(() => { if (themePref === 'auto') applyTheme(); }, 60000);
applyTheme();

// ======================================================================
// Sound engine + mixer UI
// ======================================================================
const audio = new SoundEngine();
const savedMix = load('mix', {});
if (typeof savedMix.master === 'number') audio.masterVol = Math.min(1, Math.max(0, savedMix.master));
audio.muted = !!savedMix.muted;
for (const c of CHANNELS) {
  const s = savedMix.ch?.[c.id];
  if (s) audio.state[c.id] = { on: !!s.on, vol: typeof s.vol === 'number' ? Math.min(1, Math.max(0, s.vol)) : 0.5 };
}

const ICONS = {
  rain: '<path d="M7 14a4 4 0 1 1 1-7.9A5 5 0 0 1 18 8a3.5 3.5 0 0 1-.5 7H7zM8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h7"/>',
  fire: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>',
  cafe: '<path d="M5 9h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM16 10h2a2 2 0 0 1 0 5h-2M8 3v3M12 3v3"/>',
  brown: '<path d="M3 12c2-6 3-6 5 0s3 6 5 0 3-6 5 0 2 4 3 3"/>',
  lofi: '<path d="M9 18V6l10-2v12M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3zm10-2a3 3 0 1 1-3-3 3 3 0 0 1 3 3z"/>',
};

function saveMix() {
  save('mix', { master: audio.masterVol, muted: audio.muted, ch: audio.state });
}

function updateWeather() {
  const lvl = (id) => (audio.state[id].on ? 0.3 + 0.7 * audio.state[id].vol : 0);
  sceneApi.setWeather({ rain: lvl('rain'), fire: lvl('fire'), wind: lvl('wind') });
}

function updateHint() {
  const anyOn = Object.values(audio.state).some((s) => s.on);
  $('audioHint').hidden = !(audio.supported && anyOn && !audio.running);
}

function buildMixer() {
  if (!audio.supported) { $('audioNote').hidden = false; }
  $('masterVol').value = audio.masterVol;
  $('channels').innerHTML = CHANNELS.map((c) => `
    <li class="channel reveal" data-fx="wipe" data-id="${c.id}">
      <svg viewBox="0 0 24 24" class="ch-icon" aria-hidden="true">${ICONS[c.id]}</svg>
      <label class="ch-name" for="sw-${c.id}">${c.label}</label>
      <input type="checkbox" role="switch" class="switch" id="sw-${c.id}" ${audio.state[c.id].on ? 'checked' : ''} />
      <input type="range" id="vol-${c.id}" min="0" max="1" step="0.01" value="${audio.state[c.id].vol}" aria-label="${c.label} volume" />
      <span class="eq" aria-hidden="true">${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => `<i style="--k:${k}"></i>`).join('')}</span>
    </li>`).join('');
  $('presets').innerHTML = PRESETS.map((p) => `<button type="button" class="chip" data-preset="${p.id}">${p.label}</button>`).join('');
}
function refreshMixerUI() {
  for (const c of CHANNELS) {
    $('sw-' + c.id).checked = audio.state[c.id].on;
    $('vol-' + c.id).value = audio.state[c.id].vol;
  }
}
buildMixer();

$('channels').addEventListener('input', (e) => {
  const id = e.target.closest('li')?.dataset.id;
  if (!id) return;
  if (e.target.type === 'range') audio.setChannel(id, { vol: Number(e.target.value) });
  else audio.setChannel(id, { on: e.target.checked });
  saveMix(); updateWeather(); updateHint();
});
$('presets').addEventListener('click', (e) => {
  const b = e.target.closest('[data-preset]');
  if (!b) return;
  const p = PRESETS.find((x) => x.id === b.dataset.preset);
  audio.applyPreset(p.mix);
  refreshMixerUI(); saveMix(); updateWeather(); updateHint();
  toast(`Mix: ${p.label}`);
});
$('masterVol').addEventListener('input', (e) => { audio.setMaster(Number(e.target.value)); saveMix(); });

function setMuted(m) {
  audio.setMuted(m);
  document.body.classList.toggle('muted', m);
  $('btnMute').setAttribute('aria-pressed', String(m));
  $('btnMute').setAttribute('aria-label', m ? 'Unmute sounds' : 'Mute all sounds');
  saveMix();
}
$('btnMute').addEventListener('click', () => setMuted(!audio.muted));
setMuted(audio.muted);
updateWeather();

// Browsers only allow audio after a user gesture, so saved sounds start on the first interaction.
function firstGesture() {
  if (Object.values(audio.state).some((s) => s.on)) audio.ensure();
  updateHint();
}
for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, firstGesture, { once: true });
$('audioHint').addEventListener('click', () => { audio.ensure(); updateHint(); });
setInterval(updateHint, 1500); // context state changes (e.g. iOS interruptions)
updateHint();

// ======================================================================
// Tasks
// ======================================================================
const tasks = createTasks({
  form: $('taskForm'), input: $('taskInput'), list: $('taskList'),
  count: $('taskCount'), clearBtn: $('clearDone'),
  onCurrentChange: updateCurrentTask,
});
function updateCurrentTask() {
  const c = tasks.current();
  $('currentTask').textContent = c ? c.title : 'No task selected';
  $('currentTask').classList.toggle('empty', !c);
}
updateCurrentTask();

// ======================================================================
// Timer
// ======================================================================
const RING = 2 * Math.PI * 90;
$('ringProg').style.strokeDasharray = RING;

// Rolling digits: every digit is a vertical strip of 0-9 that slides to the right number.
const digitsEl = $('digits');
let cols = [];
function buildDigits(minuteDigits) {
  const dg = () => `<span class="dg"><span class="col">${Array.from({ length: 10 }, (_, i) => `<b>${9 - i}</b>`).join('')}<b>9</b></span></span>`;
  digitsEl.innerHTML = dg().repeat(minuteDigits) + '<span class="colon">:</span>' + dg().repeat(2);
  cols = [...digitsEl.querySelectorAll('.col')];
}
function setDigits(str) {
  const ds = str.replace(':', '').split('');
  if (ds.length !== cols.length) buildDigits(ds.length - 2);
  cols.forEach((c, i) => {
    const d = Number(ds[i]), prev = c._d;
    c._d = d;
    if (i === cols.length - 1 && prev === 0 && d === 9) {
      // seconds wrap 0 -> 9: roll onto the spare "9" at the bottom, then silently jump back to the top
      c.style.setProperty('--d', 10);
      c.addEventListener('transitionend', () => {
        if (c.style.getPropertyValue('--d') !== '10') return; // a newer tick already moved on
        c.style.transition = 'none'; c.style.setProperty('--d', 0); void c.offsetWidth; c.style.transition = '';
      }, { once: true });
    } else c.style.setProperty('--d', 9 - d);
  });
}
buildDigits(2);

const fmt = (ms) => {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

function render(t) {
  const left = t.timeLeft;
  setDigits(fmt(left));
  $('timeText').textContent = fmt(left);
  $('stage').classList.toggle('running', t.running);
  $('modeLabel').textContent = MODES[t.mode].label;
  $('ringProg').style.strokeDashoffset = RING * t.progress;
  $('btnStart').textContent = t.running ? 'Pause' : (left < t.total ? 'Resume' : 'Start');
  $('stage').dataset.mode = t.mode;
  document.querySelectorAll('.modes button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === t.mode)));
  document.title = t.running || left < t.total
    ? `${fmt(left)} · ${MODES[t.mode].label} · Hushroom`
    : 'Hushroom — a calm focus room for studying';
  const n = t.settings.longEvery;
  const filled = t.dotsFilled;
  $('dots').innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i < filled ? 'on' : ''}"></i>`).join('');
  $('dots').setAttribute('aria-label', `${filled} of ${n} sessions done before the long break`);
}

function onComplete(mode, minutes) {
  audio.chime();
  if (mode === 'focus') {
    recordFocus(minutes);
    const task = tasks.addSession();
    renderStats(statEls);
    toast(task ? `Session complete — nice work on “${task.title}”` : 'Session complete — time for a break');
  } else {
    toast('Break over — ready when you are');
  }
  if (timer.settings.notify && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(mode === 'focus' ? 'Focus session complete' : 'Break is over', {
        body: mode === 'focus' ? 'Take a short rest. You earned it.' : 'Ready for the next focus session?',
        icon: 'icons/icon-192.png', silent: true,
      });
    } catch { /* some mobile browsers only allow service-worker notifications */ }
  }
}

const timer = new Timer({ onUpdate: render, onComplete });
render(timer);

$('btnStart').addEventListener('click', () => { audio.ensure(); timer.toggle(); });
$('btnReset').addEventListener('click', () => timer.reset());
$('btnSkip').addEventListener('click', () => timer.skip());
document.querySelectorAll('.modes button').forEach((b) => b.addEventListener('click', () => timer.setMode(b.dataset.mode)));

// ---------- timer settings dialog ----------
const dlgSettings = $('dlgSettings');
const fields = { focus: 'setFocus', short: 'setShort', long: 'setLong', longEvery: 'setEvery' };
function fillSettings() {
  for (const [k, id] of Object.entries(fields)) $(id).value = timer.settings[k];
  $('setAuto').checked = timer.settings.autoStart;
  $('setNotify').checked = timer.settings.notify;
  const noNotif = !('Notification' in window);
  $('setNotify').disabled = noNotif;
  if (noNotif) $('setNotify').parentElement.title = 'Notifications are not supported in this browser';
}
$('btnSettings').addEventListener('click', () => { fillSettings(); dlgSettings.showModal(); });
for (const [k, id] of Object.entries(fields)) {
  $(id).addEventListener('change', () => { timer.applySettings({ [k]: $(id).value }); fillSettings(); });
}
$('setAuto').addEventListener('change', (e) => timer.applySettings({ autoStart: e.target.checked }));
$('setNotify').addEventListener('change', async (e) => {
  if (!e.target.checked) return timer.applySettings({ notify: false });
  let perm = Notification.permission;
  if (perm === 'default') { try { perm = await Notification.requestPermission(); } catch { perm = 'denied'; } }
  const ok = perm === 'granted';
  e.target.checked = ok;
  timer.applySettings({ notify: ok });
  if (!ok) toast('Notifications are blocked. Allow them in your browser’s site settings.');
});
$('btnDefaults').addEventListener('click', () => { timer.applySettings({ ...DEFAULTS }); fillSettings(); });

// ======================================================================
// Stats + data tools
// ======================================================================
const statEls = {
  today: $('statToday'), week: $('statWeek'), streak: $('statStreak'), total: $('statTotal'),
  weekChart: $('weekChart'), heatmap: $('heatmap'), badges: $('badges'),
};
renderStats(statEls);

$('btnExport').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(exportAll(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `hushroom-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Backup downloaded');
});
$('btnImport').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    importAll(await file.text());
    toast('Imported — reloading…');
    setTimeout(() => location.reload(), 600);
  } catch (err) {
    toast(err.message || 'Could not import that file');
  }
});
$('btnResetData').addEventListener('click', () => $('dlgConfirm').showModal());
$('dlgConfirm').addEventListener('close', () => {
  if ($('dlgConfirm').returnValue === 'confirm') { resetAll(); location.reload(); }
});

// ======================================================================
// Motion: loader curtain, split headlines, reveals, magnetic buttons,
// pointer lamp + parallax, scroll effects. All of it is skipped (or reduced
// to a plain fade) when the user prefers reduced motion.
// ======================================================================
const reduced = reducedMotion.matches;
const fine = window.matchMedia('(pointer: fine)').matches;
const stage = $('stage');

// 1. Split headlines into masked words, and give italic words a hand-drawn underline.
function splitWords(el) {
  const walk = (node) => {
    for (const ch of [...node.childNodes]) {
      if (ch.nodeType === 3) {
        const frag = document.createDocumentFragment();
        for (const tok of ch.textContent.split(/(\s+)/)) {
          if (!tok) continue;
          if (/^\s+$/.test(tok)) { frag.append(' '); continue; }
          const w = document.createElement('span'); w.className = 'w';
          const i = document.createElement('span'); i.className = 'wi'; i.textContent = tok;
          w.append(i); frag.append(w);
        }
        ch.replaceWith(frag);
      } else if (ch.nodeType === 1) walk(ch);
    }
  };
  walk(el);
  el.querySelectorAll('.wi').forEach((w, i) => w.style.setProperty('--i', i));
  el.classList.add('split');
}
const SQUIG = '<svg class="squig" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M2 7 Q 14 1 26 7 T 50 7 T 74 7 T 98 6"/></svg>';
const heroH1 = document.querySelector('.hero-copy h1');
document.querySelectorAll('h1, .sec-head h2, .foot-line').forEach((h) => {
  splitWords(h);
  h.querySelectorAll('em').forEach((em) => em.insertAdjacentHTML('beforeend', SQUIG));
});
heroH1.style.setProperty('--base', '250ms');

// Footer wordmark: one span per letter so they can rise and wiggle individually.
const wm = $('watermark');
wm.innerHTML = [...wm.textContent].map((ch, i) => `<span style="--i:${i}">${ch}</span>`).join('');

// 2. Reveal on scroll (the hero headline is started separately, after the loader).
const toReveal = [...document.querySelectorAll('.reveal, .split, .watermark')].filter((el) => el !== heroH1);
if ('IntersectionObserver' in window && !reduced) {
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) {
        const el = en.target;
        el.classList.add('in');
        io.unobserve(el);
        setTimeout(() => el.style.setProperty('--d', '0s'), 2200);
      }
  }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
  toReveal.forEach((el) => {
    const sibs = [...(el.parentElement?.children || [])].filter((c) => c.classList.contains('reveal'));
    el.style.setProperty('--d', `${Math.max(0, sibs.indexOf(el)) * 90}ms`);
    io.observe(el);
  });
} else {
  toReveal.forEach((el) => el.classList.add('in'));
}

// 3. Loader curtain on the first visit of a session, then the hero animates in.
const loader = $('loader');
const startHero = () => { stage.classList.add('ready'); heroH1.classList.add('in'); };
let seen = false;
try { seen = sessionStorage.getItem('hushroom-seen') === '1'; sessionStorage.setItem('hushroom-seen', '1'); } catch { /* ignore */ }
if (reduced || seen) {
  loader.remove(); startHero();
} else {
  setTimeout(() => {
    loader.classList.add('done');
    setTimeout(startHero, 350);
    setTimeout(() => loader.remove(), 1300);
  }, 750);
}

// 4. Magnetic buttons: they lean toward the pointer.
if (fine && !reduced) {
  document.querySelectorAll('.mag').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.28}px, ${(e.clientY - r.top - r.height / 2) * 0.28}px)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  });
}

// 5. A warm lamp follows the pointer across the window, and the scenery shifts in layers.
if (fine && !reduced) {
  stage.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    stage.style.setProperty('--mx', `${x}px`);
    stage.style.setProperty('--my', `${y}px`);
    stage.classList.add('lit');
    sceneApi.setParallax((x / r.width - 0.5) * 2, (y / r.height - 0.5) * 2);
  });
  stage.addEventListener('pointerleave', () => { stage.classList.remove('lit'); sceneApi.setParallax(0, 0); });
}

// 6. Scroll effects: progress bar, nav that hides on the way down, hero parallax,
//    marquee that leans with scroll speed, big section numbers that drift.
const nav = $('nav'), bar = $('progress'), marquee = $('marquee');
const sections = [...document.querySelectorAll('.section')];
let lastY = scrollY, ticking = false, skewTimer;
function onScroll() {
  ticking = false;
  const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
  bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
  nav.classList.toggle('solid', y > innerHeight * 0.5);
  if (!reduced) {
    if (y > lastY && y > innerHeight * 0.9) nav.classList.add('hide');
    else if (y < lastY) nav.classList.remove('hide');
    stage.style.setProperty('--sy', Math.min(y, innerHeight));
    marquee.style.setProperty('--sk', `${Math.max(-7, Math.min(7, -(y - lastY) * 0.12))}deg`);
    clearTimeout(skewTimer);
    skewTimer = setTimeout(() => marquee.style.setProperty('--sk', '0deg'), 120);
    for (const s of sections) {
      const r = s.getBoundingClientRect();
      s.style.setProperty('--p', ((r.top + r.height / 2 - innerHeight / 2) / innerHeight).toFixed(3));
    }
  }
  lastY = y;
}
addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
onScroll();

$('footIntro').addEventListener('click', (e) => { e.preventDefault(); $('dlgWelcome').showModal(); });

// ======================================================================
// Focus mode
// ======================================================================
let focusMode = false;
function setFocusMode(on) {
  focusMode = on;
  iris($(on ? 'btnFocus' : 'exitFocus'), () => {
    document.body.classList.toggle('focus-mode', on);
    $('btnFocus').setAttribute('aria-pressed', String(on));
  });
  if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {}); // optional nicety
  } else if (!on && document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
  if (on) $('btnStart').focus({ preventScroll: true });
  requestAnimationFrame(() => sceneApi.redraw());
}
$('btnFocus').addEventListener('click', () => setFocusMode(!focusMode));
$('exitFocus').addEventListener('click', () => setFocusMode(false));
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && focusMode) setFocusMode(false); });

// ======================================================================
// Dialogs, welcome flow, shortcuts
// ======================================================================
document.querySelectorAll('dialog').forEach((d) => {
  d.addEventListener('click', (e) => { // click on the backdrop (outside the box) closes
    const r = d.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (e.target === d && !inside) d.close();
  });
});
$('btnHelp').addEventListener('click', () => $('dlgHelp').showModal());
$('btnIntro').addEventListener('click', () => { $('dlgHelp').close(); $('dlgWelcome').showModal(); });
$('dlgWelcome').addEventListener('close', () => save('welcomed', true));
if (!load('welcomed', false)) $('dlgWelcome').showModal();

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
  if (document.querySelector('dialog[open]')) return;
  const tag = e.target.tagName;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.target.isContentEditable) return;
  const k = e.key.toLowerCase();
  if (e.key === ' ') {
    if (tag === 'BUTTON' || tag === 'A') return; // let the focused control handle Space
    e.preventDefault(); audio.ensure(); timer.toggle();
  } else if (k === 'r') timer.reset();
  else if (k === 'm') setMuted(!audio.muted);
  else if (k === 'f') setFocusMode(!focusMode);
  else if (k === 't') setThemePref(THEMES[(THEMES.indexOf(themePref) + 1) % THEMES.length], null);
  else if (e.key === '?') $('dlgHelp').showModal();
  else if (e.key === 'Escape' && focusMode) setFocusMode(false);
});

// ======================================================================
// Offline support
// ======================================================================
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
