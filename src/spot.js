/**
 * One place on the map the prospect can check for themselves.
 *
 * The outreach email names the nearest neighborhood where they are not in the
 * top 3, and who is. A scammer never hands you a way to verify the claim, so
 * this is the line that earns a burned owner's attention.
 */
import { inTop3, isInvisible } from './ranks.js';
import { placeNameAt } from './providers/geocode.js';

/**
 * Nearest grid point where the lead misses the top 3, preferring points where
 * they are out of the top 10 altogether.
 * @param {Array} points  scan or report points (each with `results`)
 * @param {(p:object) => number|null} rankAt  the lead's rank at a point
 */
export function pickCheckSpot(points, rankAt) {
  const misses = (points || [])
    .filter((p) => !p.isCenter && (p.results || []).filter((r) => r && r.title).length >= 3)
    .map((p) => ({ p, rank: rankAt(p) }))
    .filter((x) => !inTop3(x.rank));
  if (!misses.length) return null;
  const invisible = misses.filter((x) => isInvisible(x.rank));
  const pool = (invisible.length ? invisible : misses).sort((a, b) => a.p.distanceMi - b.p.distanceMi);
  const { p, rank } = pool[0];
  return {
    lat: p.lat,
    lng: p.lng,
    distanceMi: p.distanceMi,
    bearing: p.bearing,
    rank: rank ?? null,
    top3: p.results.filter((r) => r && r.title).slice(0, 3).map((r) => r.title),
    place: null,
  };
}

/** Adds the neighborhood name when a geocoder knows it. Never throws. */
export async function locateSpot(spot) {
  if (!spot) return null;
  try {
    return { ...spot, place: await placeNameAt(spot.lat, spot.lng) };
  } catch {
    return spot;
  }
}

function distanceWords(mi) {
  if (mi < 0.6) return 'half a mile';
  if (mi < 0.9) return 'under a mile';
  const r = Math.round(mi * 2) / 2;
  return `about ${r} ${r === 1 ? 'mile' : 'miles'}`;
}

const list = (xs) => (xs.length < 3 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

/**
 * "When someone around Willow Glen, about 2 miles north of you, searches
 * “tree removal”, Google's top 3 are A, B and C. You don't show up in the top
 * 20 there. You can check it on your phone next time you're over that way."
 */
export function spotSentence(spot, keyword, leadCity = '') {
  if (!spot || !spot.top3?.length) return '';
  const dir = String(spot.bearing || '').replace('-', '').toLowerCase();
  const far = `${distanceWords(spot.distanceMi)}${dir ? ` ${dir}` : ''} of you`;
  const place = spot.place || {};
  const area = place.name
    || (place.city && place.city.toLowerCase() !== String(leadCity).toLowerCase() ? place.city : '');
  const where = area ? `around ${area}, ${far},` : far;
  const r = spot.rank;
  const you = r == null || r > 20 ? 'You don’t show up in the top 20 there.'
    : isInvisible(r) ? `You’re #${r} there, too far down for most people to see.`
      : `You’re #${r} there, below the three most people call.`;
  return `When someone ${where} searches “${keyword}”, Google’s top 3 are ${list(spot.top3)}. ${you} You can check it on your phone next time you’re over that way.`;
}
