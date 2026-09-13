import { fetchJson } from './http.js';

const COORD_RE = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

/** Accepts "lat,lng" strings typed directly into the location field. */
export function parseCoordinates(s) {
  const m = COORD_RE.exec(s || '');
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** Geocode a free-text place with OpenStreetMap Nominatim (no key required). */
export async function geocode(query) {
  const direct = parseCoordinates(query);
  if (direct) return { ...direct, displayName: query, source: 'coordinates' };
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '1');
  const rows = await fetchJson(url.toString());
  if (!rows.length) throw new Error(`Could not geocode "${query}". Try "City, ST" or "lat,lng".`);
  const r = rows[0];
  return {
    lat: Number(r.lat),
    lng: Number(r.lon),
    displayName: r.display_name,
    city: r.address?.city || r.address?.town || r.address?.village || r.address?.county || '',
    state: r.address?.state || '',
    source: 'nominatim',
  };
}
