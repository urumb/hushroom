// stats.js — focus history, streaks, weekly bar chart, heatmap, badges.
// History is { "YYYY-MM-DD": { min: <focus minutes>, n: <sessions> } } in local time.

import { load, save, dayKey } from './storage.js';

const DAY = 86400000;
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

let history = load('history', {});
if (!history || typeof history !== 'object' || Array.isArray(history)) history = {};

/** Re-read from storage (after an import). */
export function reloadHistory() {
  history = load('history', {});
  if (!history || typeof history !== 'object' || Array.isArray(history)) history = {};
}

export function recordFocus(minutes) {
  const k = dayKey();
  const d = history[k] || { min: 0, n: 0 };
  d.min += minutes;
  d.n += 1;
  history[k] = d;
  save('history', history);
}

const daysAgo = (n) => dayKey(new Date(Date.now() - n * DAY));
const minOn = (k) => (history[k] ? history[k].min : 0);

export function summary() {
  const all = Object.values(history);
  const totalMin = all.reduce((a, d) => a + (d.min || 0), 0);
  const totalN = all.reduce((a, d) => a + (d.n || 0), 0);
  const week = Array.from({ length: 7 }, (_, i) => daysAgo(6 - i));
  const weekMin = week.reduce((a, k) => a + minOn(k), 0);
  // streak: consecutive days with a session, ending today (or yesterday if today is still empty)
  let i = history[daysAgo(0)]?.n ? 0 : 1;
  let streak = 0;
  while (history[daysAgo(i)]?.n) { streak++; i++; }
  // best streak ever
  const keys = Object.keys(history).filter((k) => history[k].n).sort();
  let best = 0, run = 0, prev = null;
  for (const k of keys) {
    const t = new Date(k + 'T12:00:00').getTime();
    run = prev !== null && Math.round((t - prev) / DAY) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return { today: minOn(daysAgo(0)), weekMin, streak, best, totalMin, totalN };
}

export const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

const BADGES = [
  { id: 'first', label: 'First step', desc: 'Complete a focus session', ok: (s) => s.totalN >= 1 },
  { id: 'ten', label: 'Ten sessions', desc: 'Complete 10 focus sessions', ok: (s) => s.totalN >= 10 },
  { id: 'streak3', label: 'Three in a row', desc: 'Focus 3 days in a row', ok: (s) => s.best >= 3 },
  { id: 'streak7', label: 'A full week', desc: 'Focus 7 days in a row', ok: (s) => s.best >= 7 },
  { id: 'hours5', label: 'Five hours', desc: '5 hours of focus in total', ok: (s) => s.totalMin >= 300 },
  { id: 'hours25', label: 'Deep diver', desc: '25 hours of focus in total', ok: (s) => s.totalMin >= 1500 },
];

export function renderStats(els) {
  const s = summary();
  els.today.textContent = fmtMin(s.today);
  els.week.textContent = fmtMin(s.weekMin);
  els.streak.textContent = `${s.streak} ${s.streak === 1 ? 'day' : 'days'}`;
  els.total.textContent = fmtMin(s.totalMin);

  // ----- weekly bar chart -----
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * DAY);
    return { k: dayKey(d), label: WEEKDAYS[d.getDay()], min: 0 };
  });
  days.forEach((d) => { d.min = minOn(d.k); });
  const max = Math.max(60, ...days.map((d) => d.min));
  const bw = 28, gap = 14, top = 20, ch = 90;
  let bars = '';
  days.forEach((d, i) => {
    const h = Math.round((d.min / max) * ch);
    const x = i * (bw + gap) + 6;
    bars += `<rect class="bar${i === 6 ? ' today' : ''}" x="${x}" y="${top + ch - h}" width="${bw}" height="${Math.max(h, d.min ? 3 : 2)}" rx="6"><title>${d.k}: ${d.min} min</title></rect>`;
    if (d.min) bars += `<text class="val" x="${x + bw / 2}" y="${top + ch - h - 5}" text-anchor="middle">${d.min}</text>`;
    bars += `<text class="lbl" x="${x + bw / 2}" y="${top + ch + 16}" text-anchor="middle">${d.label}</text>`;
  });
  els.weekChart.innerHTML = `<svg viewBox="0 0 ${7 * (bw + gap) + 4} ${top + ch + 24}" role="img" aria-label="Focus minutes for each of the last 7 days: ${days.map((d) => d.min).join(', ')}">${bars}</svg>`;

  // ----- heatmap: 12 weeks, columns = weeks (Mon–Sun rows), last column holds today -----
  const cell = 13, hgap = 3, weeks = 12;
  const todayIdx = (new Date().getDay() + 6) % 7; // Monday = 0
  let cells = '';
  let total = 0;
  for (let w = 0; w < weeks; w++) {
    for (let r = 0; r < 7; r++) {
      const ago = (weeks - 1 - w) * 7 + (todayIdx - r);
      if (ago < 0) continue; // future
      const k = daysAgo(ago);
      const m = minOn(k);
      total += m;
      const lvl = m === 0 ? 0 : m < 25 ? 1 : m < 60 ? 2 : m < 120 ? 3 : 4;
      cells += `<rect class="cell l${lvl}" style="--i:${w * 7 + r}" x="${w * (cell + hgap)}" y="${r * (cell + hgap)}" width="${cell}" height="${cell}" rx="3"><title>${k}: ${m} min</title></rect>`;
    }
  }
  els.heatmap.innerHTML = `<svg viewBox="0 0 ${weeks * (cell + hgap)} ${7 * (cell + hgap)}" role="img" aria-label="Heatmap of focus over the last 12 weeks: ${fmtMin(total)} in total">${cells}</svg>`;

  // ----- badges -----
  els.badges.innerHTML = BADGES.map((b) => {
    const on = b.ok(s);
    return `<li class="badge-card${on ? ' earned' : ''}"><strong>${b.label}</strong><span>${b.desc}</span><em>${on ? 'Earned' : 'Locked'}</em></li>`;
  }).join('');
}
