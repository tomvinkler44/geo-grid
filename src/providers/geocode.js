/**
 * Geocoding with automatic failover.
 *
 * Nominatim (OpenStreetMap) is the obvious free geocoder but it blocks
 * aggressively: VPN exit IPs, datacentre ranges and anything it considers
 * bulk use get a 403 with a link to its usage policy. That made it a single
 * point of failure, so it is now last in a chain of independent services,
 * each of which is free and needs no API key:
 *
 *   1. "lat,lng" typed directly           – no network at all
 *   2. Zippopotam                         – US/CA/UK postal codes
 *   3. Photon (Komoot)                    – free-text, OSM data, permissive
 *   4. Open-Meteo geocoding               – city + state/region
 *   5. Nominatim                          – last resort
 *
 * Results are cached on disk so a repeated audit never re-queries anyone.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { haversineMi } from '../geometry.js';

const COORD_RE = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;
const US_ZIP_RE = /^\s*(\d{5})(?:-\d{4})?\s*$/;

/** Resolved per call so the cache location can be changed at runtime. */
function cacheFile() {
  return path.join(process.env.GEO_CACHE_DIR || path.join(process.cwd(), '.cache'), 'geocode.json');
}
let cache = null;

/** Drop the in-memory cache so the next lookup re-reads from disk. */
export function resetGeocodeCache() { cache = null; }

const US_STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin',
  WY: 'Wyoming', DC: 'District of Columbia',
};

/** Accepts "lat,lng" (or "lat lng") typed directly into the location field. */
export function parseCoordinates(s) {
  const m = COORD_RE.exec(s || '');
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  // "95126" and similar must not be read as a coordinate pair.
  if (!/[,\s]/.test(s.trim())) return null;
  return { lat, lng };
}

/** Split "San Jose, CA" into { city, state, stateName }. */
export function splitCityState(query) {
  const parts = String(query || '').split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return { city: parts[0] || '', state: '', stateName: '' };
  const city = parts[0];
  const tail = parts[1].toUpperCase();
  const abbr = US_STATES[tail] ? tail : null;
  const full = abbr
    ? US_STATES[abbr]
    : Object.values(US_STATES).find((n) => n.toLowerCase() === parts[1].toLowerCase()) || '';
  return { city, state: abbr || '', stateName: full };
}

async function loadCache() {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(cacheFile(), 'utf8'));
  } catch {
    cache = {};
  }
  return cache;
}

async function saveCache() {
  try {
    const file = cacheFile();
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(cache, null, 2));
  } catch { /* cache is best-effort */ }
}

async function getJson(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': config.userAgent, Accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------- providers

/** Postal codes: api.zippopotam.us/us/95126 */
async function viaZippopotam(query) {
  const m = US_ZIP_RE.exec(query);
  if (!m) return null;
  const j = await getJson(`https://api.zippopotam.us/us/${m[1]}`);
  const p = j?.places?.[0];
  if (!p) return null;
  const lat = Number(p.latitude);
  const lng = Number(p.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat, lng,
    displayName: `${p['place name']}, ${p['state abbreviation']} ${m[1]}`,
    city: p['place name'],
    state: p['state abbreviation'],
    source: 'zippopotam',
  };
}

/** Free-text, OSM-derived: photon.komoot.io */
async function viaPhoton(query) {
  const j = await getJson(`https://photon.komoot.io/api?q=${encodeURIComponent(query)}&limit=1&lang=en`);
  const f = j?.features?.[0];
  const c = f?.geometry?.coordinates;
  if (!Array.isArray(c) || c.length < 2) return null;
  const lng = Number(c[0]);
  const lat = Number(c[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const p = f.properties || {};
  return {
    lat, lng,
    displayName: [p.name, p.city, p.state, p.country].filter(Boolean).join(', '),
    city: p.city || p.name || '',
    state: p.state || '',
    source: 'photon',
  };
}

/** City-level: geocoding-api.open-meteo.com (needs a bare city name) */
async function viaOpenMeteo(query) {
  const { city, state, stateName } = splitCityState(query);
  if (!city) return null;
  const j = await getJson(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=10&language=en&format=json`,
  );
  const rows = Array.isArray(j?.results) ? j.results : [];
  if (!rows.length) return null;
  const wanted = (stateName || '').toLowerCase();
  const pick =
    (wanted && rows.find((r) => String(r.admin1 || '').toLowerCase() === wanted)) ||
    rows.find((r) => r.country_code === 'US') ||
    rows[0];
  if (!Number.isFinite(pick?.latitude) || !Number.isFinite(pick?.longitude)) return null;
  return {
    lat: pick.latitude,
    lng: pick.longitude,
    displayName: [pick.name, pick.admin1, pick.country].filter(Boolean).join(', '),
    city: pick.name,
    state: state || pick.admin1 || '',
    source: 'open-meteo',
  };
}

/** Last resort: nominatim.openstreetmap.org */
async function viaNominatim(query) {
  const j = await getJson(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1`,
  );
  const r = Array.isArray(j) ? j[0] : null;
  if (!r) return null;
  const lat = Number(r.lat);
  const lng = Number(r.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const a = r.address || {};
  return {
    lat, lng,
    displayName: r.display_name,
    city: a.city || a.town || a.village || a.county || '',
    state: a.state || '',
    source: 'nominatim',
  };
}

/**
 * Chains for the two kinds of lookup we do. `applies` lets a service opt out
 * of an input it cannot handle (a postal-code service given a city name), so
 * it is never counted as a failure in the error the user reads.
 */
const PLACE_CHAIN = [
  { name: 'zippopotam', applies: (q) => US_ZIP_RE.test(q), run: viaZippopotam },
  { name: 'photon', applies: () => true, run: viaPhoton },
  { name: 'open-meteo', applies: (q) => Boolean(splitCityState(q).city), run: viaOpenMeteo },
  { name: 'nominatim', applies: () => true, run: viaNominatim },
];
const FREE_TEXT_CHAIN = [
  { name: 'photon', applies: () => true, run: viaPhoton },
  { name: 'nominatim', applies: () => true, run: viaNominatim },
];

async function runChain(query, chain) {
  const store = await loadCache();
  const key = `${chain === PLACE_CHAIN ? 'place' : 'text'}:${query.trim().toLowerCase()}`;
  if (store[key]) return store[key];

  const failures = [];
  for (const provider of chain) {
    if (!provider.applies(query)) continue;
    try {
      const hit = await provider.run(query);
      if (hit) {
        store[key] = hit;
        await saveCache();
        return hit;
      }
      failures.push(`${provider.name}: no match`);
    } catch (err) {
      failures.push(`${provider.name}: ${err.message}`);
    }
  }
  const e = new Error(
    `Could not find "${query}". Tried ${failures.length} lookup ${failures.length === 1 ? 'service' : 'services'} ` +
    `(${failures.join('; ')}). Fix: open Google Maps, right-click the business, click the numbers at the top of ` +
    `the menu to copy them, then paste them into "Advanced → Listing coordinates" and run the audit again.`,
  );
  e.code = 'GEOCODE_FAILED';
  e.failures = failures;
  throw e;
}

/** Geocode a city / state / zip. Throws with instructions if every service fails. */
export async function geocode(query) {
  const direct = parseCoordinates(query);
  if (direct) return { ...direct, displayName: query, city: '', state: '', source: 'coordinates' };
  return runChain(String(query || '').trim(), PLACE_CHAIN);
}

/**
 * Try to place a named business. Returns null rather than throwing, and
 * rejects a hit that is implausibly far from `near` (geocoders happily return
 * a same-named street on another continent).
 */
export async function geocodeBusiness(name, location, near, maxMilesAway = 40) {
  try {
    const hit = await runChain(`${name}, ${location}`, FREE_TEXT_CHAIN);
    if (near && haversineMi(near.lat, near.lng, hit.lat, hit.lng) > maxMilesAway) return null;
    return hit;
  } catch {
    return null;
  }
}

/** Exposed for the setup check so it can report which service answered. */
export const GEOCODERS = { viaZippopotam, viaPhoton, viaOpenMeteo, viaNominatim };
