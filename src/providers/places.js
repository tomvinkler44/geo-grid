/**
 * Google Places API (New) – Text Search. Used only for GBP resolution when
 * GOOGLE_PLACES_API_KEY is set; it is the most reliable way to get the exact
 * listing title, coordinates and Place ID.
 */
import { config } from '../config.js';
import { fetchJson } from './http.js';
import { pickBestCandidate } from './match.js';

export async function resolveWithPlaces({ name, location }) {
  const json = await fetchJson('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': config.googlePlacesKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount',
    },
    body: { textQuery: `${name}, ${location}`, maxResultCount: 5 },
  });
  const candidates = (json.places ?? []).map((p) => ({
    name: p.displayName?.text,
    placeId: p.id,
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    address: p.formattedAddress,
    rating: p.rating,
    reviews: p.userRatingCount,
  }));
  const best = pickBestCandidate(candidates, name);
  if (!best) throw new Error(`Google Places could not find "${name}" in ${location}`);
  return { ...best, city: location, source: 'google-places' };
}
