/**
 * SerpApi – Google Maps engine.
 * Docs: https://serpapi.com/google-maps-api
 */
import { config } from '../config.js';
import { fetchJson } from './http.js';
import { geocode } from './geocode.js';
import { pickBestCandidate } from './match.js';

async function mapsSearch({ q, lat, lng, zoom = 15 }) {
  if (!config.serpapiKey) throw new Error('SERPAPI_KEY is not set');
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google_maps');
  url.searchParams.set('type', 'search');
  url.searchParams.set('q', q);
  url.searchParams.set('ll', `@${lat},${lng},${zoom}z`);
  url.searchParams.set('hl', 'en');
  url.searchParams.set('api_key', config.serpapiKey);
  const json = await fetchJson(url.toString());
  if (json.error) throw new Error(`SerpApi: ${json.error}`);
  const rows = json.local_results ?? (json.place_results ? [json.place_results] : []);
  return rows.map((r, i) => ({
    position: r.position ?? i + 1,
    title: r.title,
    placeId: r.place_id,
    cid: r.data_cid,
    lat: r.gps_coordinates?.latitude,
    lng: r.gps_coordinates?.longitude,
    rating: r.rating,
    reviews: r.reviews,
  }));
}

export const serpapiProvider = {
  name: 'serpapi',

  async resolveBusiness({ name, location }) {
    const city = await geocode(location);
    const results = await mapsSearch({ q: name, lat: city.lat, lng: city.lng, zoom: 12 });
    const best = pickBestCandidate(results.map((r) => ({ name: r.title, ...r })), name);
    if (!best) throw new Error(`SerpApi could not find "${name}" near ${location}`);
    return {
      name: best.title,
      lat: best.lat,
      lng: best.lng,
      placeId: best.placeId,
      cid: best.cid,
      rating: best.rating,
      reviews: best.reviews,
      city: city.city || location,
      source: 'serpapi',
    };
  },

  createRanker({ keyword }) {
    return (point) => mapsSearch({ q: keyword, lat: point.lat, lng: point.lng });
  },
};
