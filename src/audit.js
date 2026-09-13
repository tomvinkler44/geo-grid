/**
 * Orchestrates one geo-grid audit: resolve listing -> build grid -> rank each
 * point -> compute metrics. Pure data; rendering is separate.
 */
import { buildGrid } from './geometry.js';
import { getProvider, resolveBusiness } from './providers/index.js';
import { findBusinessRank } from './providers/match.js';
import { mapLimit } from './providers/http.js';
import { parseCoordinates } from './providers/geocode.js';
import { config } from './config.js';

export const SPACING_OPTIONS = [0.5, 1, 2];

export function computeMetrics(points) {
  const ranks = points.map((p) => (p.rank == null || p.rank > 20 ? 21 : p.rank));
  const averageRank = ranks.reduce((a, b) => a + b, 0) / ranks.length;
  const top3Count = points.filter((p) => p.rank != null && p.rank <= 3).length;
  const visibleCount = points.filter((p) => p.rank != null && p.rank <= 9).length;
  const invisibleCount = points.length - visibleCount;
  const notTop3 = points.filter((p) => !(p.rank != null && p.rank <= 3));

  // Who takes #1 where the target is not in the Map Pack?
  const tally = new Map();
  for (const p of notTop3) {
    const top = p.results?.[0];
    if (!top || !top.title) continue;
    const key = top.title;
    const t = tally.get(key) || { name: key, placeId: top.placeId, wins: 0 };
    t.wins++;
    tally.set(key, t);
  }
  const competitors = [...tally.values()].sort((a, b) => b.wins - a.wins);

  // Overall #1 share across all points, for context.
  const allTop = new Map();
  for (const p of points) {
    const top = p.results?.[0];
    if (top?.title) allTop.set(top.title, (allTop.get(top.title) || 0) + 1);
  }

  return {
    averageRank: +averageRank.toFixed(2),
    top3Count,
    top3Share: top3Count / points.length,
    visibleCount,
    visibleShare: visibleCount / points.length,
    invisibleCount,
    notTop3Count: notTop3.length,
    bestRank: Math.min(...ranks),
    worstRank: Math.max(...ranks),
    topCompetitor: competitors[0] || null,
    competitors: competitors.slice(0, 5),
    overallLeaders: [...allTop.entries()].map(([name, wins]) => ({ name, wins })).sort((a, b) => b.wins - a.wins).slice(0, 5),
  };
}

/**
 * @param {object} input
 * @param {string} input.business   Business name as typed
 * @param {string} input.location   "City, ST", zip, or "lat,lng"
 * @param {string} input.keyword    Search keyword
 * @param {number} [input.spacingMi=0.5]
 * @param {boolean} [input.mock]    Force the mock provider
 * @param {string}  [input.coordinates]  Optional "lat,lng" override for the listing
 * @param {(msg:string)=>void} [input.onProgress]
 */
export async function runAudit(input) {
  const business = (input.business || '').trim();
  const location = (input.location || '').trim();
  const keyword = (input.keyword || '').trim();
  const spacingMi = Number(input.spacingMi ?? 0.5);
  const log = input.onProgress || (() => {});
  if (!business) throw new Error('Business name is required');
  if (!location) throw new Error('City/State (or zip) is required');
  if (!keyword) throw new Error('Keyword is required');
  if (!SPACING_OPTIONS.includes(spacingMi)) throw new Error(`Spacing must be one of ${SPACING_OPTIONS.join(', ')} miles`);

  const providerName = input.mock ? 'mock' : config.rankProvider;
  const provider = getProvider(providerName);

  log(`Resolving "${business}" in ${location} (${provider.name})…`);
  const coords = input.coordinates ? parseCoordinates(input.coordinates) : null;
  let listing;
  if (coords) {
    listing = { name: business, ...coords, placeId: null, cid: null, city: location, source: 'manual' };
  } else {
    listing = await resolveBusiness(provider, { name: business, location });
  }
  // Keep the operator's typed name if the resolver returned something odd.
  if (!listing.name) listing.name = business;

  const points = buildGrid(listing.lat, listing.lng, spacingMi);
  const rankAt = provider.createRanker({ business: listing, keyword, spacingMi });

  log(`Checking ${points.length} points for "${keyword}"…`);
  let done = 0;
  const ranked = await mapLimit(points, provider.name === 'mock' ? 25 : config.rankConcurrency, async (p) => {
    const results = await rankAt(p);
    const { rank, match } = findBusinessRank(results, listing);
    done++;
    if (done % 5 === 0) log(`  ${done}/${points.length} points checked`);
    return {
      ...p,
      rank,
      matchedTitle: match?.title ?? null,
      results: results.slice(0, 5).map(({ position, title, placeId, cid }) => ({ position, title, placeId, cid })),
    };
  });

  const metrics = computeMetrics(ranked);
  return {
    generatedAt: new Date().toISOString(),
    provider: provider.name,
    business: listing,
    inputBusinessName: business,
    location,
    keyword,
    spacingMi,
    points: ranked,
    metrics,
  };
}
