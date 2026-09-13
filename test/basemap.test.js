import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';

process.env.TILE_CACHE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tile-cache-'));
const { renderBasemap, renderWithProvider, resetBlockedProviders } = await import('../src/basemap.js');

/** A real PNG, so the image decoder is exercised like it is in production. */
function pngTile(text) {
  const c = createCanvas(256, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#eee';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#333';
  ctx.font = '20px sans-serif';
  ctx.fillText(text, 10, 40);
  return c.toBuffer('image/png');
}

/** The single placeholder image a server sends when it is refusing an app. */
const BLOCKED = pngTile('Access blocked');

function stubTiles(handler) {
  const hosts = [];
  globalThis.fetch = async (url) => {
    hosts.push(new URL(url).host);
    const out = handler(url);
    if (out instanceof Error) throw out;
    if (typeof out === 'number') {
      return { ok: false, status: out, headers: new Map(), text: async () => 'nope' };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: (k) => (k.toLowerCase() === 'content-type' ? out.type || 'image/png' : null) },
      arrayBuffer: async () => out.body,
    };
  };
  return hosts;
}

const realFetch = globalThis.fetch;
const VIEW = { lat: 37.3382, lng: -121.8863, width: 512, height: 512, spanMeters: 3000 };

test.beforeEach(() => {
  process.env.TILE_CACHE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tile-cache-'));
  resetBlockedProviders();
});
test.afterEach(() => { globalThis.fetch = realFetch; });

test('a server answering every tile with one placeholder image is rejected', async () => {
  stubTiles(() => ({ body: BLOCKED }));
  await assert.rejects(
    () => renderWithProvider('osm', { ...VIEW, zoomFrac: 14 }),
    /refusing this app/,
    'identical tiles across the whole view must not be accepted as a map',
  );
});

test('genuinely different tiles are accepted', async () => {
  stubTiles((url) => ({ body: pngTile(url.slice(-12)) }));
  const out = await renderWithProvider('carto', { ...VIEW, zoomFrac: 14 });
  assert.ok(out.canvas, 'a canvas should be produced');
  assert.match(out.attribution, /CARTO/);
});

test('a non-image response is rejected rather than drawn', async () => {
  stubTiles(() => ({ body: Buffer.from('<html>rate limited</html>'), type: 'text/html' }));
  await assert.rejects(() => renderWithProvider('carto', { ...VIEW, zoomFrac: 14 }), /instead of an image/);
});

test('a blocked provider falls back to a working one automatically', async () => {
  const hosts = stubTiles((url) =>
    url.includes('openstreetmap.org') ? { body: BLOCKED } : { body: pngTile(url.slice(-12)) },
  );
  const out = await renderBasemap({ ...VIEW, provider: 'osm' });
  assert.equal(out.provider, 'carto', 'should have fallen back to CARTO');
  assert.equal(out.fellBack, true);
  assert.equal(out.requestedProvider, 'osm');
  assert.match(out.error, /refusing this app/);
  assert.ok(hosts.some((h) => h.includes('cartocdn')), 'CARTO should have been contacted');
  assert.ok(!out.offline, 'it should not have given up and drawn the pattern');
});

test('a provider that refused us once is not retried on the next report', async () => {
  stubTiles((url) => (url.includes('openstreetmap.org') ? { body: BLOCKED } : { body: pngTile(url.slice(-12)) }));
  await renderBasemap({ ...VIEW, provider: 'osm' });
  const hosts = stubTiles((url) =>
    url.includes('openstreetmap.org') ? { body: BLOCKED } : { body: pngTile(url.slice(-12)) },
  );
  const out = await renderBasemap({ ...VIEW, provider: 'osm' });
  assert.equal(out.provider, 'carto');
  assert.ok(!hosts.some((h) => h.includes('openstreetmap')), 'the blocked server should not be contacted again');
});

test('when every map service fails the offline pattern is used and reported', async () => {
  stubTiles(() => 403);
  const out = await renderBasemap({ ...VIEW, provider: 'carto' });
  assert.equal(out.offline, true);
  assert.equal(out.provider, 'none');
  assert.match(out.error, /403/);
  assert.ok(out.canvas, 'a report must still render');
});

test('the projector places the centre point at the middle of the canvas', async () => {
  stubTiles((url) => ({ body: pngTile(url.slice(-12)) }));
  const out = await renderBasemap({ ...VIEW, provider: 'carto' });
  const p = out.project(VIEW.lat, VIEW.lng);
  assert.ok(Math.abs(p.x - VIEW.width / 2) < 0.01, `x was ${p.x}`);
  assert.ok(Math.abs(p.y - VIEW.height / 2) < 0.01, `y was ${p.y}`);
  // North is up: a point further north must project higher on the canvas.
  assert.ok(out.project(VIEW.lat + 0.01, VIEW.lng).y < p.y);
});
