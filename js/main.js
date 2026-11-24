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

function applyTheme() {
  const eff = themePref === 'auto' ? timeTheme() : themePref;
  root.dataset.theme = eff;
  sceneApi.setTheme(eff);
  document.querySelector('meta[name="theme-color"]').content = THEME_COLOR[eff];
  document.querySelectorAll('input[name="theme"]').forEach((r) => { r.checked = r.value === themePref; });
}
function setThemePref(p) { themePref = p; save('theme', p); applyTheme(); }
document.querySelectorAll('input[name="theme"]').forEach((r) => r.addEventListener('change', () => setThemePref(r.value)));
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
    <li class="channel" data-id="${c.id}">
      <svg viewBox="0 0 24 24" class="ch-icon" aria-hidden="true">${ICONS[c.id]}</svg>
      <label class="ch-name" for="sw-${c.id}">${c.label}</label>
      <input type="checkbox" role="switch" class="switch" id="sw-${c.id}" ${audio.state[c.id].on ? 'checked' : ''} />
      <input type="range" id="vol-${c.id}" min="0" max="1" step="0.01" value="${audio.state[c.id].vol}" aria-label="${c.label} volume" />
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

const fmt = (ms) => {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

function render(t) {
  const left = t.timeLeft;
  $('time').textContent = fmt(left);
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
// Scroll reveal + small nav niceties
// ======================================================================
const reveals = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  reveals.forEach((el, i) => { el.style.setProperty('--d', `${(i % 4) * 70}ms`); io.observe(el); });
} else {
  reveals.forEach((el) => el.classList.add('in'));
}
$('footIntro').addEventListener('click', (e) => { e.preventDefault(); $('dlgWelcome').showModal(); });

// ======================================================================
// Focus mode
// ======================================================================
let focusMode = false;
function setFocusMode(on) {
  focusMode = on;
  document.body.classList.toggle('focus-mode', on);
  $('btnFocus').setAttribute('aria-pressed', String(on));
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
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); }); // click on backdrop closes
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
  else if (k === 't') setThemePref(THEMES[(THEMES.indexOf(themePref) + 1) % THEMES.length]);
  else if (e.key === '?') $('dlgHelp').showModal();
  else if (e.key === 'Escape' && focusMode) setFocusMode(false);
});

// ======================================================================
// Offline support
// ======================================================================
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
