/**
 * Basemap rendering. Stitches slippy-map tiles (OSM / CARTO) or fetches a
 * Mapbox Static image, mutes it, and returns a canvas plus a projector that
 * maps lat/lng -> pixel. Falls back to a procedural "offline" basemap if the
 * provider is `none` or tiles cannot be fetched, so mock runs always work.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { config } from './config.js';
import { lngToX, latToY, zoomForSpan, TILE_SIZE } from './mercator.js';
import { mapLimit } from './providers/http.js';

const CACHE_DIR = path.join(process.cwd(), '.cache', 'tiles');

const TILE_PROVIDERS = {
  osm: {
    url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
    hires: false,
    mute: { saturation: true, lighten: 0.28 },
  },
  carto: {
    url: (z, x, y) => `https://basemaps.cartocdn.com/light_all/${z}/${x}/${y}@2x.png`,
    attribution: '© OpenStreetMap contributors © CARTO',
    maxZoom: 20,
    hires: true,
    mute: { saturation: false, lighten: 0.08 },
  },
};

async function fetchTile(url) {
  const key = url.replace(/[^a-z0-9]+/gi, '_');
  const file = path.join(CACHE_DIR, key);
  try {
    return await fs.readFile(file);
  } catch { /* cache miss */ }
  const res = await fetch(url, { headers: { 'User-Agent': config.userAgent } });
  if (!res.ok) throw new Error(`Tile ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(file, buf).catch(() => {});
  return buf;
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
  const tilePx = p.hires ? TILE_SIZE * 2 : TILE_SIZE; // pixels in the fetched image
  const cx = lngToX(lng, zInt);
  const cy = latToY(lat, zInt);
  // Region in zInt pixel space that covers the canvas
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
  if (jobs.length > 400) throw new Error(`Refusing to fetch ${jobs.length} tiles; reduce map size`);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#eef0f2';
  ctx.fillRect(0, 0, width, height);

  const tiles = await mapLimit(jobs, 6, async ({ tx, ty }) => {
    const wrappedX = ((tx % n) + n) % n;
    if (ty < 0 || ty >= n) return null;
    const buf = await fetchTile(p.url(zInt, wrappedX, ty));
    return { tx, ty, img: await loadImage(buf) };
  });

  for (const t of tiles) {
    if (!t) continue;
    const dx = (t.tx * TILE_SIZE - cx) * scale + width / 2;
    const dy = (t.ty * TILE_SIZE - cy) * scale + height / 2;
    const size = TILE_SIZE * scale;
    ctx.drawImage(t.img, 0, 0, tilePx, tilePx, dx, dy, size + 0.5, size + 0.5);
  }
  mute(ctx, width, height, p.mute);
  return { canvas, attribution: p.attribution, zoom: zoomFrac, tileCount: jobs.length };
}

async function renderMapbox({ lat, lng, width, height, zoomFrac }) {
  if (!config.mapboxToken) throw new Error('MAPBOX_TOKEN is not set');
  // Static API caps at 1280x1280 (@2x => 2560). Request @2x and scale to fit.
  const reqW = Math.min(1280, Math.ceil(width / 2));
  const reqH = Math.min(1280, Math.ceil(height / 2));
  const zoom = Math.max(0, Math.min(22, zoomFrac - 1)); // @2x doubles pixels per tile
  const url = `https://api.mapbox.com/styles/v1/${config.mapboxStyle}/static/${lng},${lat},${zoom.toFixed(3)},0/${reqW}x${reqH}@2x?attribution=false&logo=false&access_token=${config.mapboxToken}`;
  const res = await fetch(url, { headers: { 'User-Agent': config.userAgent } });
  if (!res.ok) throw new Error(`Mapbox static ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const img = await loadImage(Buffer.from(await res.arrayBuffer()));
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  mute(ctx, width, height, { saturation: false, lighten: 0.05 });
  return { canvas, attribution: '© Mapbox © OpenStreetMap', zoom: zoomFrac, tileCount: 1 };
}

/** Procedural street-like pattern for offline / keyless runs. */
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
  // Minor streets
  ctx.lineWidth = Math.max(2, width / 600);
  for (let x = blockPx / 2; x < width; x += blockPx) {
    const wobble = (rand() - 0.5) * blockPx * 0.3;
    ctx.beginPath(); ctx.moveTo(x + wobble, 0); ctx.lineTo(x - wobble, height); ctx.stroke();
  }
  for (let y = blockPx / 2; y < height; y += blockPx) {
    const wobble = (rand() - 0.5) * blockPx * 0.3;
    ctx.beginPath(); ctx.moveTo(0, y + wobble); ctx.lineTo(width, y - wobble); ctx.stroke();
  }
  // Arterials
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
  // A "park" and a "water" body for texture
  ctx.fillStyle = 'rgba(187, 226, 196, 0.55)';
  ctx.beginPath(); ctx.ellipse(width * (0.15 + rand() * 0.7), height * (0.15 + rand() * 0.7), blockPx * 2.2, blockPx * 1.6, rand(), 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(190, 214, 240, 0.6)';
  ctx.beginPath(); ctx.ellipse(width * (0.1 + rand() * 0.8), height * (0.1 + rand() * 0.8), blockPx * 1.4, blockPx * 3, rand(), 0, Math.PI * 2); ctx.fill();
  return { canvas, attribution: 'Illustrative basemap (offline mode)', zoom: null, tileCount: 0, offline: true };
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
  let result;
  try {
    if (provider === 'none') result = renderOffline(args);
    else if (provider === 'mapbox') result = await renderMapbox(args);
    else if (TILE_PROVIDERS[provider]) result = await renderTiles({ provider, ...args });
    else throw new Error(`Unknown MAP_PROVIDER "${provider}" (osm | carto | mapbox | none)`);
  } catch (err) {
    console.warn(`[basemap] ${err.message} – using offline basemap`);
    result = { ...renderOffline(args), error: err.message };
  }
  return { ...result, project, provider: result.offline ? 'none' : provider };
}
