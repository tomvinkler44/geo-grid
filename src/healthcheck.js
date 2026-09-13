/**
 * "Is my setup working?" – runs one tiny call against each configured
 * service and returns a checklist the UI can show in plain English.
 */
import { config } from './config.js';
import { geocode } from './providers/geocode.js';
import { renderBasemap, TILE_PROVIDERS } from './basemap.js';
import { getProvider } from './providers/index.js';
import { resolveWithPlaces } from './providers/places.js';
import { liveReady } from './settings.js';

const TEST = { lat: 37.3382, lng: -121.8863, keyword: 'plumber', business: 'Starbucks', location: 'San Jose, CA' };

async function check(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    return { name, ok: true, detail: detail || 'OK', ms: Date.now() - started };
  } catch (err) {
    return { name, ok: false, detail: err.message, ms: Date.now() - started };
  }
}

export async function runHealthCheck() {
  const checks = [];

  checks.push(await check('Map', async () => {
    if (config.mapProvider === 'none') return 'Using the offline illustrative basemap';
    // Render a small real map: this exercises the same fetching, validation
    // and fallback the report uses, so a blocked tile server shows up here.
    const bm = await renderBasemap({
      lat: TEST.lat, lng: TEST.lng, width: 512, height: 512, spanMeters: 3000,
    });
    const label = TILE_PROVIDERS[bm.provider]?.label || bm.provider;
    if (bm.offline) throw new Error(`no map service worked, so reports will show a plain pattern. ${bm.error || ''}`);
    if (bm.fellBack) {
      return `${label} is being used instead of ${bm.requestedProvider}, which failed: ${bm.error}`;
    }
    return `${label} is working`;
  }));

  checks.push(await check('Address lookup', async () => {
    const g = await geocode(TEST.location);
    return `"${TEST.location}" → ${g.lat.toFixed(3)}, ${g.lng.toFixed(3)} (answered by ${g.source})`;
  }));

  if (config.googlePlacesKey) {
    checks.push(await check('Google Places listing lookup', async () => {
      const b = await resolveWithPlaces({ name: TEST.business, location: TEST.location });
      return `Found "${b.name}" (${b.placeId})`;
    }));
  } else {
    checks.push({ name: 'Google Places listing lookup', ok: null, detail: 'Not configured (optional). Listing lookup will use the rank provider instead.' });
  }

  if (config.rankProvider === 'mock') {
    checks.push({ name: 'Ranking data', ok: null, detail: 'Mock mode only. Add DataForSEO or SerpApi credentials in Settings to get real rankings.' });
  } else if (!liveReady()) {
    checks.push({ name: `Ranking data (${config.rankProvider})`, ok: false, detail: 'Selected, but credentials are missing. Add them in Settings.' });
  } else {
    checks.push(await check(`Ranking data (${config.rankProvider})`, async () => {
      const p = getProvider(config.rankProvider);
      const rank = p.createRanker({ keyword: TEST.keyword, spacingMi: 0.5, business: {} });
      const results = await rank({ lat: TEST.lat, lng: TEST.lng });
      if (!results.length) throw new Error('Call succeeded but returned no results');
      return `1 test search OK · top result: "${results[0].title}"`;
    }));
  }

  const failed = checks.filter((c) => c.ok === false).length;
  return { ok: failed === 0, liveReady: liveReady(), checks };
}
