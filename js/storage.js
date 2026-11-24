// storage.js — safe localStorage helpers plus export / import / reset.
// Every access is wrapped in try/catch so the app still works when storage
// is blocked (private mode, disabled cookies, quota errors).

const PREFIX = 'hushroom:';

// Every key the app persists. Export/import/reset only touch these.
export const KEYS = ['settings', 'mix', 'tasks', 'current', 'cycle', 'history', 'welcomed', 'theme'];

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Local-time date key, e.g. "2026-11-24" (not UTC, so streaks follow the user's day). */
export function dayKey(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** Everything the app stores, as a plain object ready for JSON.stringify. */
export function exportAll() {
  const data = {};
  for (const key of KEYS) {
    const value = load(key, undefined);
    if (value !== undefined) data[key] = value;
  }
  return { app: 'hushroom', version: 1, exportedAt: new Date().toISOString(), data };
}

/** Validate and write an exported file back into storage. Throws on bad input. */
export function importAll(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!parsed || parsed.app !== 'hushroom' || typeof parsed.data !== 'object' || parsed.data === null) {
    throw new Error('That file does not look like a Hushroom export.');
  }
  for (const key of KEYS) {
    if (key in parsed.data) save(key, parsed.data[key]);
  }
}

export function resetAll() {
  for (const key of KEYS) {
    try { localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
  }
}
