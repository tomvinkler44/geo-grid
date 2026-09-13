/**
 * Settings saved from the web UI (data/settings.json). They override .env so
 * non-technical users never have to touch a file. Secrets are masked when
 * read back and never overwritten with the mask.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
const FILE = path.join(DATA_DIR, 'settings.json');
export const MASK = '••••••••';

/** UI field -> config path. `secret` fields are masked on read. */
export const FIELDS = {
  rankProvider: { path: ['rankProvider'] },
  dataforseoLogin: { path: ['dataforseo', 'login'] },
  dataforseoPassword: { path: ['dataforseo', 'password'], secret: true },
  serpapiKey: { path: ['serpapiKey'], secret: true },
  googlePlacesKey: { path: ['googlePlacesKey'], secret: true },
  mapProvider: { path: ['mapProvider'] },
  mapboxToken: { path: ['mapboxToken'], secret: true },
  agencyName: { path: ['agencyName'] },
  agencyUrl: { path: ['agencyUrl'] },
  userAgent: { path: ['userAgent'] },
};

const get = (obj, p) => p.reduce((o, k) => (o == null ? undefined : o[k]), obj);
const set = (obj, p, v) => { let o = obj; for (const k of p.slice(0, -1)) o = o[k] ??= {}; o[p.at(-1)] = v; };

let saved = {};

export async function loadSettings() {
  try {
    saved = JSON.parse(await fs.readFile(FILE, 'utf8'));
  } catch {
    saved = {};
  }
  apply();
  return saved;
}

function apply() {
  for (const [key, f] of Object.entries(FIELDS)) {
    const v = saved[key];
    if (typeof v === 'string' && v.trim() !== '') set(config, f.path, v.trim());
  }
}

/** Current effective values, secrets masked, plus which ones are set at all. */
export function readSettings() {
  const out = {};
  for (const [key, f] of Object.entries(FIELDS)) {
    const v = get(config, f.path) || '';
    out[key] = f.secret ? (v ? MASK : '') : v;
  }
  return out;
}

/** Merge a partial update from the UI. Empty string clears; MASK leaves as is. */
export async function saveSettings(update = {}) {
  for (const [key, f] of Object.entries(FIELDS)) {
    if (!(key in update)) continue;
    const v = update[key];
    if (typeof v !== 'string') continue;
    if (f.secret && v === MASK) continue;
    if (v.trim() === '') {
      delete saved[key];
      set(config, f.path, ''); // clearing in the UI also clears the env value for this run
    } else {
      saved[key] = v.trim();
    }
  }
  if (saved.rankProvider && !['mock', 'dataforseo', 'serpapi'].includes(saved.rankProvider)) delete saved.rankProvider;
  if (saved.mapProvider && !['osm', 'carto', 'mapbox', 'none'].includes(saved.mapProvider)) delete saved.mapProvider;
  apply();
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(saved, null, 2), { mode: 0o600 });
  return readSettings();
}

export function liveReady() {
  return (
    (config.rankProvider === 'dataforseo' && !!config.dataforseo.login && !!config.dataforseo.password) ||
    (config.rankProvider === 'serpapi' && !!config.serpapiKey)
  );
}
