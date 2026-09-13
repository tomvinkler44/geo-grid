/**
 * DataForSEO – Google Maps SERP (live, advanced).
 * Docs: https://docs.dataforseo.com/v3/serp/google/maps/live/advanced/
 */
import { config } from '../config.js';
import { fetchJson } from './http.js';
import { geocode } from './geocode.js';
import { pickBestCandidate } from './match.js';

const ENDPOINT = 'https://api.dataforseo.com/v3/serp/google/maps/live/advanced';

function authHeader() {
  const { login, password } = config.dataforseo;
  if (!login || !password) throw new Error('DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD are not set');
  return { Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}` };
}

async function mapsSearch({ keyword, lat, lng, zoom = 15, depth = 20 }) {
  const body = [{
    keyword,
    location_coordinate: `${lat},${lng},${zoom}z`,
    language_code: 'en',
    device: 'desktop',
    os: 'windows',
    depth,
  }];
  const json = await fetchJson(ENDPOINT, { method: 'POST', headers: { ...authHeader(), 'Content-Type': 'application/json' }, body });
  const task = json.tasks?.[0];
  if (!task || task.status_code !== 20000) {
    throw new Error(`DataForSEO error ${task?.status_code ?? json.status_code}: ${task?.status_message ?? json.status_message}`);
  }
  const items = task.result?.[0]?.items ?? [];
  return items
    .filter((it) => it.type === 'maps_search')
    .map((it) => ({
      position: it.rank_group,
      title: it.title,
      placeId: it.place_id,
      cid: it.cid,
      lat: it.latitude,
      lng: it.longitude,
      rating: it.rating?.value,
      reviews: it.rating?.votes_count,
    }));
}

export const dataforseoProvider = {
  name: 'dataforseo',

  async resolveBusiness({ name, location }) {
    const city = await geocode(location);
    const results = await mapsSearch({ keyword: name, lat: city.lat, lng: city.lng, zoom: 12, depth: 10 });
    const candidates = results.map((r) => ({ name: r.title, ...r }));
    const best = pickBestCandidate(candidates, name);
    if (!best) throw new Error(`DataForSEO could not find "${name}" near ${location}`);
    return {
      name: best.title,
      lat: best.lat,
      lng: best.lng,
      placeId: best.placeId,
      cid: best.cid,
      rating: best.rating,
      reviews: best.reviews,
      city: city.city || location,
      source: 'dataforseo',
    };
  },

  createRanker({ keyword }) {
    return (point) => mapsSearch({ keyword, lat: point.lat, lng: point.lng });
  },
};
