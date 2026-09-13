import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Each run gets its own cache directory so results never leak between tests.
process.env.GEO_CACHE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'geo-cache-'));

const { geocode, geocodeBusiness, parseCoordinates, splitCityState, resetGeocodeCache } =
  await import('../src/providers/geocode.js');

/** Recorded response shapes from each service's public documentation. */
const FIXTURES = {
  zippopotam: {
    'post code': '95126',
    country: 'United States',
    places: [{ 'place name': 'San Jose', longitude: '-121.9107', state: 'California', 'state abbreviation': 'CA', latitude: '37.3252' }],
  },
  photon: {
    features: [{
      geometry: { coordinates: [-121.8853, 37.3394], type: 'Point' },
      properties: { name: 'San Jose', state: 'California', country: 'United States', city: 'San Jose' },
    }],
  },
  openMeteo: {
    results: [
      { name: 'San Jose', latitude: 9.9333, longitude: -84.0833, country_code: 'CR', admin1: 'San José', country: 'Costa Rica' },
      { name: 'San Jose', latitude: 37.33939, longitude: -121.89496, country_code: 'US', admin1: 'California', country: 'United States' },
    ],
  },
  nominatim: [{ lat: '37.3394', lon: '-121.8950', display_name: 'San Jose, CA, USA', address: { city: 'San Jose', state: 'California' } }],
};

/** Replace fetch with a router that answers, or fails, per host. */
function stubFetch(handlers) {
  const calls = [];
  globalThis.fetch = async (url) => {
    const host = new URL(url).host;
    calls.push(host);
    const h = handlers[host];
    if (!h) throw new Error(`unexpected host ${host}`);
    if (h instanceof Error) throw h;
    if (typeof h === 'number') return { ok: false, status: h, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => h };
  };
  return calls;
}

const realFetch = globalThis.fetch;

// A fresh cache directory per test, so one test's cached answer can never
// satisfy the next one's lookup.
test.beforeEach(() => {
  process.env.GEO_CACHE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'geo-cache-'));
  resetGeocodeCache();
});
test.afterEach(() => { globalThis.fetch = realFetch; resetGeocodeCache(); });

test('coordinates typed directly skip the network entirely', async () => {
  stubFetch({});
  const g = await geocode('37.3382, -121.8863');
  assert.equal(g.source, 'coordinates');
  assert.equal(g.lat, 37.3382);
  assert.equal(g.lng, -121.8863);
});

test('a zip code is resolved by the postal-code service', async () => {
  const calls = stubFetch({ 'api.zippopotam.us': FIXTURES.zippopotam });
  const g = await geocode('95126');
  assert.equal(g.source, 'zippopotam');
  assert.equal(g.lat, 37.3252);
  assert.equal(g.lng, -121.9107);
  assert.equal(g.city, 'San Jose');
  assert.deepEqual(calls, ['api.zippopotam.us']);
});

test('photon GeoJSON is read as [lng, lat], not [lat, lng]', async () => {
  stubFetch({ 'photon.komoot.io': FIXTURES.photon });
  const g = await geocode('San Jose, CA');
  assert.equal(g.source, 'photon');
  assert.ok(g.lat > 37 && g.lat < 38, `latitude looks wrong: ${g.lat}`);
  assert.ok(g.lng < -121 && g.lng > -122, `longitude looks wrong: ${g.lng}`);
});

test('failover: a blocked service is skipped and the next one answers', async () => {
  const calls = stubFetch({
    'photon.komoot.io': 403,
    'geocoding-api.open-meteo.com': FIXTURES.openMeteo,
  });
  const g = await geocode('San Jose, CA');
  assert.equal(g.source, 'open-meteo');
  // The California row must win over the Costa Rica row of the same name.
  assert.equal(g.lat, 37.33939);
  assert.deepEqual(calls, ['photon.komoot.io', 'geocoding-api.open-meteo.com']);
});

test('failover reaches nominatim only as a last resort', async () => {
  const calls = stubFetch({
    'photon.komoot.io': 403,
    'geocoding-api.open-meteo.com': new Error('network down'),
    'nominatim.openstreetmap.org': FIXTURES.nominatim,
  });
  const g = await geocode('San Jose, CA');
  assert.equal(g.source, 'nominatim');
  assert.equal(calls.at(-1), 'nominatim.openstreetmap.org');
});

test('when every service fails the error says how to fix it', async () => {
  stubFetch({
    'photon.komoot.io': 403,
    'geocoding-api.open-meteo.com': 500,
    'nominatim.openstreetmap.org': 403,
  });
  await assert.rejects(
    () => geocode('Nowhere, ZZ'),
    (err) => {
      assert.equal(err.code, 'GEOCODE_FAILED');
      assert.match(err.message, /Advanced → Listing coordinates/);
      assert.equal(err.failures.length, 3);
      return true;
    },
  );
});

test('a business hit far from the city is rejected rather than used', async () => {
  // Photon returns a same-named place on another continent.
  stubFetch({
    'photon.komoot.io': { features: [{ geometry: { coordinates: [2.3522, 48.8566] }, properties: { name: 'Elsewhere' } }] },
    'nominatim.openstreetmap.org': [],
  });
  const near = { lat: 37.3382, lng: -121.8863 };
  assert.equal(await geocodeBusiness("John's Plumbing", 'San Jose, CA', near), null);
});

test('a business hit near the city is accepted', async () => {
  stubFetch({ 'photon.komoot.io': FIXTURES.photon });
  const near = { lat: 37.3382, lng: -121.8863 };
  const hit = await geocodeBusiness("John's Plumbing", 'San Jose, CA', near);
  assert.ok(hit && Math.abs(hit.lat - 37.3394) < 0.001);
});

test('results are cached so a repeat lookup makes no second request', async () => {
  const calls = stubFetch({ 'photon.komoot.io': FIXTURES.photon });
  await geocode('Cached City, CA');
  await geocode('Cached City, CA');
  assert.equal(calls.length, 1);
});

test('city/state parsing handles abbreviations and full names', () => {
  assert.deepEqual(splitCityState('San Jose, CA'), { city: 'San Jose', state: 'CA', stateName: 'California' });
  assert.equal(splitCityState('Austin, Texas').stateName, 'Texas');
  assert.equal(parseCoordinates('95126'), null, 'a zip must not be read as coordinates');
});
