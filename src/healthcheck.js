/**
 * "Is my setup working?" – runs one tiny call against each configured
 * service and returns a checklist the UI can show in plain English.
 */
import { config } from './config.js';
import { geocode } from './providers/geocode.js';
import { renderBasemap, renderWithProvider, TILE_PROVIDERS, resetBlockedProviders } from './basemap.js';
import { getProvider } from './providers/index.js';
import { resolveWithPlaces } from './providers/places.js';
import { liveReady } from './settings.js';
import { resolvedSender } from './offer.js';

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

  // Launch readiness: things that are not broken, but make an audit or email
  // unfit to send to a real prospect.
  const sender = resolvedSender();
  checks.push(sender.canSpamAddressReady
    ? { name: 'Email compliance (CAN-SPAM)', ok: true, detail: `Postal address set: ${sender.postalAddress}` }
    : { name: 'Email compliance (CAN-SPAM)', ok: false, detail: 'No full postal address. Commercial email must include a street address, P.O. box, or registered private mailbox. Add it in section 6.' });
  if (sender.phoneIsFictional) {
    checks.push({ name: 'Contact phone', ok: false, detail: `${sender.phone} is in the 555-0100–0199 range reserved for fiction, so calls never connect. Add your real number in section 6.` });
  }
  checks.push(/localhost|127\.0\.0\.1/.test(config.publicBaseUrl)
    ? { name: 'Checkout link', ok: false, detail: `Printed audits link to ${config.publicBaseUrl}, which a prospect cannot open. Set your public site in section 5.` }
    : { name: 'Checkout link', ok: true, detail: `Printed audits link to ${config.publicBaseUrl}/audit/…` });
  checks.push(config.stripeCheckoutUrl
    ? { name: 'Payments', ok: true, detail: 'Stripe Payment Link set; each payment is tagged with its audit id.' }
    : { name: 'Payments', ok: null, detail: 'No Stripe Payment Link yet, so the checkout button emails you instead. Add it in section 5.' });

  const failed = checks.filter((c) => c.ok === false).length;
  return { ok: failed === 0, liveReady: liveReady(), checks };
}


/**
 * Try each map service on its own and report which ones actually return a
 * usable map from this machine. Networks, VPNs and provider policies differ,
 * so the only reliable answer is an empirical one.
 */
export async function testMapProviders() {
  resetBlockedProviders();
  const args = { lat: TEST.lat, lng: TEST.lng, width: 384, height: 384, zoomFrac: 13.5 };
  const names = [...Object.keys(TILE_PROVIDERS), ...(config.mapboxToken ? ['mapbox'] : [])];
  const results = await Promise.all(names.map(async (name) => {
    const p = TILE_PROVIDERS[name];
    const started = Date.now();
    try {
      await renderWithProvider(name, args);
      return { name, label: p?.label || 'Mapbox', ok: true, detail: 'Returned a usable map', ms: Date.now() - started, manualOnly: !!p?.manualOnly };
    } catch (err) {
      return { name, label: p?.label || 'Mapbox', ok: false, detail: err.message, ms: Date.now() - started, manualOnly: !!p?.manualOnly };
    }
  }));
  if (!config.mapboxToken) {
    results.push({ name: 'mapbox', label: 'Mapbox', ok: null, detail: 'No token saved. Its free tier covers about 50,000 report images a month and its terms cover commercial use.' });
  }
  return { current: config.mapProvider, results };
}
