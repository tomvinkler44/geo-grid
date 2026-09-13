/**
 * Basemap rendering.
 *
 * Stitches slippy-map tiles, or fetches a single Mapbox static image, mutes
 * the result so the coloured badges stay legible, and returns a canvas plus a
 * projector that maps lat/lng -> pixel.
 *
 * Two things this has to survive:
 *
 *  - A tile server that refuses the request but answers HTTP 200 with a
 *    placeholder image saying so. OpenStreetMap does exactly this when an app
 *    trips its tile usage policy, which silently produced reports covered in
 *    "Access blocked" text. `validateTiles` catches it by noticing that every
 *    tile in the view came back byte-identical.
 *  - A provider being unreachable. Providers are tried in turn and the
 *    procedural offline basemap is the last resort, so a report always renders.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { config } from './config.js';
import { lngToX, latToY, zoomForSpan, TILE_SIZE } from './mercator.js';
import { mapLimit } from './providers/http.js';

/** Resolved per call so the cache location can be changed at runtime. */
function cacheDir() {
  return process.env.TILE_CACHE_DIR || path.join(process.cwd(), '.cache', 'tiles');
}

/** Forget which providers refused us (used by tests and the setup check). */
export function resetBlockedProviders() { blocked.clear(); }

export const TILE_PROVIDERS = {
  carto: {
    label: 'CARTO Positron',
    url: (z, x, y) => `https://basemaps.cartocdn.com/light_all/${z}/${x}/${y}@2x.png`,
    attribution: '© OpenStreetMap contributors © CARTO',
    maxZoom: 20,
    hires: true,
    mute: { saturation: false, lighten: 0.08 },
  },
  esri: {
    label: 'Esri Light Gray Canvas',
    // Note the z/y/x ordering, which is not the usual z/x/y.
    url: (z, x, y) => `https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/${z}/${y}/${x}`,
    attribution: 'Esri, HERE, Garmin, © OpenStreetMap contributors',
    maxZoom: 16,
    hires: false,
    mute: { saturation: false, lighten: 0 },
  },
  osm: {
    label: 'OpenStreetMap standard',
    url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
    hires: false,
    mute: { saturation: true, lighten: 0.28 },
    // Volunteer-run servers. Their tile usage policy does not cover bulk or
    // commercial use, and they block apps that ignore it, so this is never
    // chosen automatically - only when the operator picks it explicitly.
    manualOnly: true,
  },
};

/** Keyless providers tried, in order, when the configured one fails. */
const FALLBACK_ORDER = ['carto', 'esri'];

/**
 * Providers that refused us this run. A server that blocks an app keeps
 * blocking it, so there is no point paying the round trip on every report.
 */
const blocked = new Map();
export function blockedProviders() { return Object.fromEntries(blocked); }

function tileCacheFile(url) {
  return path.join(cacheDir(), url.replace(/[^a-z0-9]+/gi, '_'));
}

async function fetchTile(url) {
  const file = tileCacheFile(url);
  try {
    return { buf: await fs.readFile(file), cached: true };
  } catch { /* cache miss */ }

  const res = await fetch(url, { headers: { 'User-Agent': config.userAgent } });
  if (!res.ok) throw new Error(`tile server replied ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (!/^image\//i.test(type)) throw new Error(`tile server returned ${type || 'no content type'} instead of an image`);

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) throw new Error('tile server returned an empty image');
  await fs.mkdir(cacheDir(), { recursive: true });
  await fs.writeFile(file, buf).catch(() => {});
  return { buf, cached: false };
}

/**
 * A server that is refusing us answers every tile request with the same
 * placeholder image. Real map tiles covering a business are never all
 * identical, so identical bytes across the whole view means the map is not a
 * map. Returns an error message, or null when the tiles look genuine.
 */
function validateTiles(tiles) {
  const real = tiles.filter(Boolean);
  if (real.length < 2) return null;
  const first = real[0].hash;
  if (real.some((t) => t.hash !== first)) return null;
  return 'every tile came back as the same placeholder image, so the server is refusing this app';
}

/** Throw away tiles we have decided are not real, so a retry re-fetches. */
async function purgeTiles(urls) {
  await Promise.all(urls.map((u) => fs.rm(tileCacheFile(u), { force: true }).catch(() => {})));
}

function makeProjector(lat, lng, zoom, width, height) {
  const cx = lngToX(lng, zoom);
  const cy = latToY(lat, zoom);
  return (plat, plng) => ({
    x: lngToX(plng, zoom) - cx + width / 2,
    y: latToY(plat, zoom) - cy + height / 2,
  });
}

/** Desaturate / lighten so coloured badges pop against the streets. */
function mute(ctx, width, height, { saturation, lighten }) {
  if (saturation) {
    ctx.save();
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
  if (lighten > 0) {
    ctx.save();
    ctx.fillStyle = `rgba(255,255,255,${lighten})`;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}

async function renderTiles({ provider, lat, lng, width, height, zoomFrac }) {
  const p = TILE_PROVIDERS[provider];
  // Serve tiles at the next integer zoom and scale down: crisp, never blurry.
  const zInt = Math.min(p.maxZoom, Math.ceil(zoomFrac));
  const scale = 2 ** (zoomFrac - zInt); // <= 1
  const tilePx = p.hires ? TILE_SIZE * 2 : TILE_SIZE;
  const cx = lngToX(lng, zInt);
  const cy = latToY(lat, zInt);
  const halfW = width / 2 / scale;
  const halfH = height / 2 / scale;
  const x0 = Math.floor((cx - halfW) / TILE_SIZE);
  const x1 = Math.floor((cx + halfW) / TILE_SIZE);
  const y0 = Math.floor((cy - halfH) / TILE_SIZE);
  const y1 = Math.floor((cy + halfH) / TILE_SIZE);
  const n = 2 ** zInt;

  const jobs = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) jobs.push({ tx, ty });
  }
  if (jobs.length > 400) throw new Error(`refusing to fetch ${jobs.length} tiles; reduce the map size`);

  const urls = [];
  const tiles = await mapLimit(jobs, 6, async ({ tx, ty }) => {
    const wrappedX = ((tx % n) + n) % n;
    if (ty < 0 || ty >= n) return null;
    const url = p.url(zInt, wrappedX, ty);
    urls.push(url);
    const { buf } = await fetchTile(url);
    return { tx, ty, buf, hash: createHash('sha1').update(buf).digest('hex') };
  });

  const problem = validateTiles(tiles);
  if (problem) {
    await purgeTiles(urls);
    throw new Error(problem);
  }

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#eef0f2';
  ctx.fillRect(0, 0, width, height);

  for (const t of tiles) {
    if (!t) continue;
    const img = await loadImage(t.buf);
    const dx = (t.tx * TILE_SIZE - cx) * scale + width / 2;
    const dy = (t.ty * TILE_SIZE - cy) * scale + height / 2;
    const size = TILE_SIZE * scale;
    ctx.drawImage(img, 0, 0, tilePx, tilePx, dx, dy, size + 0.5, size + 0.5);
  }
  mute(ctx, width, height, p.mute);
  return { canvas, attribution: p.attribution, zoom: zoomFrac, tileCount: jobs.length };
}

async function renderMapbox({ lat, lng, width, height, zoomFrac }) {
  if (!config.mapboxToken) throw new Error('Mapbox is selected but no token is saved');
  // Static API caps at 1280x1280 (@2x => 2560). Request @2x and scale to fit.
  const reqW = Math.min(1280, Math.ceil(width / 2));
  const reqH = Math.min(1280, Math.ceil(height / 2));
  const zoom = Math.max(0, Math.min(22, zoomFrac - 1)); // @2x doubles pixels per tile
  const url = `https://api.mapbox.com/styles/v1/${config.mapboxStyle}/static/${lng},${lat},${zoom.toFixed(3)},0/${reqW}x${reqH}@2x?attribution=false&logo=false&access_token=${config.mapboxToken}`;
  const res = await fetch(url, { headers: { 'User-Agent': config.userAgent } });
  if (!res.ok) throw new Error(`Mapbox replied ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const img = await loadImage(Buffer.from(await res.arrayBuffer()));
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  mute(ctx, width, height, { saturation: false, lighten: 0.05 });
  return { canvas, attribution: '© Mapbox © OpenStreetMap', zoom: zoomFrac, tileCount: 1 };
}

/** Procedural street-like pattern for offline / blocked runs. */
function renderOffline({ lat, lng, width, height }) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#eef0f3';
  ctx.fillRect(0, 0, width, height);
  let s = Math.floor(Math.abs(lat * 1e4 + lng * 1e3)) >>> 0 || 7;
  const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const blockPx = width / 22;
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, width / 600);
  for (let x = blockPx / 2; x < width; x += blockPx) {
    const wobble = (rand() - 0.5) * blockPx * 0.3;
    ctx.beginPath(); ctx.moveTo(x + wobble, 0); ctx.lineTo(x - wobble, height); ctx.stroke();
  }
  for (let y = blockPx / 2; y < height; y += blockPx) {
    const wobble = (rand() - 0.5) * blockPx * 0.3;
    ctx.beginPath(); ctx.moveTo(0, y + wobble); ctx.lineTo(width, y - wobble); ctx.stroke();
  }
  ctx.lineWidth = Math.max(5, width / 220);
  ctx.strokeStyle = '#f9fafb';
  for (let i = 0; i < 4; i++) {
    const vertical = i % 2 === 0;
    const pos = (0.2 + rand() * 0.6) * (vertical ? width : height);
    ctx.beginPath();
    if (vertical) { ctx.moveTo(pos, 0); ctx.lineTo(pos + (rand() - 0.5) * width * 0.2, height); }
    else { ctx.moveTo(0, pos); ctx.lineTo(width, pos + (rand() - 0.5) * height * 0.2); }
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(187, 226, 196, 0.55)';
  ctx.beginPath(); ctx.ellipse(width * (0.15 + rand() * 0.7), height * (0.15 + rand() * 0.7), blockPx * 2.2, blockPx * 1.6, rand(), 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(190, 214, 240, 0.6)';
  ctx.beginPath(); ctx.ellipse(width * (0.1 + rand() * 0.8), height * (0.1 + rand() * 0.8), blockPx * 1.4, blockPx * 3, rand(), 0, Math.PI * 2); ctx.fill();
  return { canvas, attribution: 'Illustrative basemap (no map service available)', zoom: null, tileCount: 0, offline: true };
}

/** Render with one named provider. Throws if it cannot produce a real map. */
export async function renderWithProvider(name, args) {
  if (name === 'none') return renderOffline(args);
  if (name === 'mapbox') return renderMapbox(args);
  if (TILE_PROVIDERS[name]) return renderTiles({ provider: name, ...args });
  throw new Error(`unknown map provider "${name}" (${['mapbox', ...Object.keys(TILE_PROVIDERS), 'none'].join(' | ')})`);
}

/**
 * @param {object} o
 * @param {number} o.lat  centre latitude
 * @param {number} o.lng  centre longitude
 * @param {number} o.width  canvas width in device pixels
 * @param {number} o.height canvas height in device pixels
 * @param {number} o.spanMeters distance that should occupy `spanFraction` of width
 * @param {number} [o.spanFraction=0.7]
 * @param {string} [o.provider]
 */
export async function renderBasemap({ lat, lng, width, height, spanMeters, spanFraction = 0.7, provider = config.mapProvider }) {
  const zoomFrac = zoomForSpan(lat, spanMeters, width * spanFraction);
  const project = makeProjector(lat, lng, zoomFrac, width, height);
  const args = { lat, lng, width, height, zoomFrac };

  // The configured provider first, then the keyless ones it is safe to try
  // without the operator asking, then the procedural fallback.
  const candidates = [provider];
  if (provider !== 'none') {
    for (const name of FALLBACK_ORDER) if (!candidates.includes(name)) candidates.push(name);
  }

  const notes = [];
  for (const name of candidates) {
    if (blocked.has(name)) {
      notes.push(`${TILE_PROVIDERS[name]?.label || name}: ${blocked.get(name)} (not retried)`);
      continue;
    }
    try {
      const result = await renderWithProvider(name, args);
      return {
        ...result,
        project,
        provider: result.offline ? 'none' : name,
        requestedProvider: provider,
        fellBack: name !== provider,
        error: notes.length ? notes.join('; ') : undefined,
      };
    } catch (err) {
      const label = TILE_PROVIDERS[name]?.label || name;
      notes.push(`${label}: ${err.message}`);
      if (/refusing this app|replied 4\d\d/.test(err.message)) blocked.set(name, err.message);
      console.warn(`[basemap] ${label} failed - ${err.message}`);
    }
  }

  return {
    ...renderOffline(args),
    project,
    provider: 'none',
    requestedProvider: provider,
    fellBack: provider !== 'none',
    error: notes.join('; '),
  };
}
