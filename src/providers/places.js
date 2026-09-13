/**
 * Google Places API (New) – Text Search. Used for entity resolution when
 * GOOGLE_PLACES_API_KEY is set; it is the most reliable way to get the exact
 * listing title, coordinates, Place ID, website and primary category.
 */
import { config } from '../config.js';
import { fetchJson } from './http.js';
import { pickBestCandidate } from './match.js';

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.websiteUri',
  'places.primaryTypeDisplayName',
  'places.types',
].join(',');

function toCandidate(p) {
  return {
    name: p.displayName?.text,
    placeId: p.id,
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    address: p.formattedAddress,
    rating: p.rating,
    reviews: p.userRatingCount,
    website: p.websiteUri || '',
    category: p.primaryTypeDisplayName?.text || prettyType(p.types?.[0]) || '',
  };
}

function prettyType(t) {
  return t ? t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '';
}

/**
 * @param {object} q
 * @param {string} q.name      business name as typed
 * @param {string} q.location  city/state, used to scope the search
 * @param {string} [q.address] street address; when given it drives the match
 */
export async function resolveWithPlaces({ name, location, address = '' }) {
  const textQuery = [name, address, location].filter(Boolean).join(', ');
  const json = await fetchJson('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': config.googlePlacesKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: { textQuery, maxResultCount: 8 },
  });
  const candidates = (json.places ?? []).map(toCandidate);
  const best = pickBestCandidate(candidates, name, address);
  if (!best) throw new Error(`Google Places could not find "${name}" in ${location}`);
  return { ...best, city: location, source: 'google-places' };
}
