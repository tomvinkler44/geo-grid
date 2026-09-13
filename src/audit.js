/**
 * Orchestrates one geo-grid audit.
 *
 * The important economy here: a single local-pack lookup at a grid point
 * returns the whole pack, so the lead business and its two rivals are all read
 * out of the *same* 25 calls. A three-panel comparison costs exactly what a
 * one-panel audit costs.
 */
import { buildGrid } from './geometry.js';
import { getProvider, resolveBusiness } from './providers/index.js';
import { findBusinessRank, nameSimilarity } from './providers/match.js';
import { mapLimit } from './providers/http.js';
import { parseCoordinates } from './providers/geocode.js';
import { config } from './config.js';

export const SPACING_OPTIONS = [0.5, 1, 2];
export const MAX_COMPETITORS = 2;
/** Results kept per grid point: the local pack plus enough depth to rank rivals. */
const RESULT_DEPTH = 20;

const UNRANKED = 21;
const rankValue = (r) => (r == null || r > 20 ? UNRANKED : r);

/** Metrics for one business, given each point's rank for that business. */
export function metricsFromRanks(ranks, points) {
  const vals = ranks.map(rankValue);
  const n = vals.length;
  const top3Count = ranks.filter((r) => r != null && r <= 3).length;
  const visibleCount = ranks.filter((r) => r != null && r <= 9).length;
  const firstCount = ranks.filter((r) => r === 1).length;
  return {
    averageRank: +(vals.reduce((a, b) => a + b, 0) / n).toFixed(2),
    top3Count,
    top3Share: top3Count / n,
    visibleCount,
    visibleShare: visibleCount / n,
    invisibleCount: n - visibleCount,
    firstCount,
    notTop3Count: n - top3Count,
    bestRank: Math.min(...vals),
    worstRank: Math.max(...vals),
    points: n,
    centerRank: points ? ranks[points.findIndex((p) => p.isCenter)] : null,
  };
}

/** Back-compatible metrics for the lead business, plus its competitor tally. */
export function computeMetrics(points) {
  const ranks = points.map((p) => p.rank);
  const base = metricsFromRanks(ranks, points);

  const notTop3 = points.filter((p) => !(p.rank != null && p.rank <= 3));
  const tally = new Map();
  for (const p of notTop3) {
    const top = p.results?.[0];
    if (!top?.title) continue;
    const t = tally.get(top.title) || { name: top.title, placeId: top.placeId, wins: 0 };
    t.wins++;
    tally.set(top.title, t);
  }
  const competitors = [...tally.values()].sort((a, b) => b.wins - a.wins);

  const allTop = new Map();
  for (const p of points) {
    const top = p.results?.[0];
    if (top?.title) allTop.set(top.title, (allTop.get(top.title) || 0) + 1);
  }

  return {
    ...base,
    topCompetitor: competitors[0] || null,
    competitors: competitors.slice(0, 5),
    overallLeaders: [...allTop.entries()]
      .map(([name, wins]) => ({ name, wins }))
      .sort((a, b) => b.wins - a.wins)
      .slice(0, 5),
  };
}

/**
 * Rank every distinct business seen across the grid by how much of the map it
 * owns, so the two strongest rivals can be picked automatically.
 * Score is the sum of (21 - rank), which rewards ranking well *and* often.
 */
export function rankRivals(points, exclude = []) {
  const seen = new Map();
  for (const p of points) {
    for (const r of p.results || []) {
      if (!r.title) continue;
      const key = r.placeId || r.title.toLowerCase();
      const e = seen.get(key) || { name: r.title, placeId: r.placeId, cid: r.cid, lat: r.lat, lng: r.lng, rating: r.rating, reviews: r.reviews, category: r.category, website: r.website, score: 0, appearances: 0, firsts: 0 };
      e.score += UNRANKED - rankValue(r.position);
      e.appearances++;
      if (r.position === 1) e.firsts++;
      seen.set(key, e);
    }
  }
  const isExcluded = (e) =>
    exclude.some((x) =>
      (x.placeId && e.placeId && x.placeId === e.placeId) ||
      (x.cid && e.cid && x.cid === e.cid) ||
      nameSimilarity(x.name, e.name) >= 0.8);
  return [...seen.values()].filter((e) => !isExcluded(e)).sort((a, b) => b.score - a.score);
}

/**
 * @param {object} input
 * @param {string} input.business    lead business name
 * @param {string} input.location    "City, ST", zip, or "lat,lng"
 * @param {string} [input.address]   street address, used to pin the right listing
 * @param {string} input.keyword
 * @param {number} [input.spacingMi=0.5]
 * @param {string[]} [input.competitors]  up to two rival names; blank entries
 *                                        mean "pick the strongest automatically"
 * @param {boolean} [input.mock]
 * @param {string} [input.coordinates]    "lat,lng" override for the lead
 * @param {(msg:string)=>void} [input.onProgress]
 */
export async function runAudit(input) {
  const business = (input.business || '').trim();
  const location = (input.location || '').trim();
  const address = (input.address || '').trim();
  const keyword = (input.keyword || '').trim();
  const spacingMi = Number(input.spacingMi ?? 0.5);
  const log = input.onProgress || (() => {});
  if (!business) throw new Error('Business name is required');
  if (!location) throw new Error('City/State (or zip) is required');
  if (!keyword) throw new Error('Keyword is required');
  if (!SPACING_OPTIONS.includes(spacingMi)) throw new Error(`Spacing must be one of ${SPACING_OPTIONS.join(', ')} miles`);

  const wanted = (input.competitors || []).map((c) => (c || '').trim()).filter(Boolean).slice(0, MAX_COMPETITORS);
  const provider = getProvider(input.mock ? 'mock' : config.rankProvider);
  const isMock = provider.name === 'mock';

  // ---- Step 1: resolve the lead listing --------------------------------
  log(`Resolving "${business}" in ${location} (${provider.name})…`);
  const coords = input.coordinates ? parseCoordinates(input.coordinates) : null;
  let lead;
  if (coords) {
    lead = { name: business, ...coords, placeId: null, cid: null, city: location, address, source: 'manual' };
  } else {
    lead = await resolveBusiness(provider, { name: business, location, address });
  }
  if (!lead.name) lead.name = business;

  // ---- Step 2: resolve named rivals ------------------------------------
  // Mock mode deliberately ignores typed rivals: it invents a market, so a
  // real competitor's name on invented numbers would be misleading.
  const useNamedRivals = wanted.length > 0 && !isMock;
  let named = [];
  if (useNamedRivals) {
    log(`Resolving ${wanted.length} named competitor${wanted.length > 1 ? 's' : ''}…`);
    named = await Promise.all(wanted.map(async (name) => {
      try {
        const r = await resolveBusiness(provider, { name, location });
        return { ...r, name: r.name || name, requestedName: name };
      } catch (err) {
        log(`  could not resolve "${name}": ${err.message} — matching by name only`);
        return { name, placeId: null, cid: null, unresolved: true, requestedName: name };
      }
    }));
  }

  // ---- Step 3: one scan of the grid ------------------------------------
  const points = buildGrid(lead.lat, lead.lng, spacingMi);
  const rankAt = provider.createRanker({ business: lead, keyword, spacingMi, competitors: named });

  log(`Checking ${points.length} points for "${keyword}"…`);
  let done = 0;
  const scanned = await mapLimit(points, isMock ? 25 : config.rankConcurrency, async (p) => {
    const results = (await rankAt(p)).slice(0, RESULT_DEPTH);
    done++;
    if (done % 5 === 0) log(`  ${done}/${points.length} points checked`);
    return { ...p, results };
  });

  // ---- Step 4: choose the two rivals to show ---------------------------
  let competitors = named;
  let competitorSource = useNamedRivals ? 'manual' : 'auto';
  if (competitors.length < MAX_COMPETITORS) {
    const auto = rankRivals(scanned, [lead, ...competitors]).slice(0, MAX_COMPETITORS - competitors.length);
    competitors = [...competitors, ...auto.map((a) => ({ ...a, autoSelected: true }))];
    if (named.length === 0) competitorSource = 'auto';
    else competitorSource = 'mixed';
  }
  if (!competitors.length) competitorSource = 'none';

  // ---- Step 5: read every business out of the same results -------------
  const businesses = [lead, ...competitors];
  const ranked = scanned.map((p) => {
    const ranks = businesses.map((b) => findBusinessRank(p.results, b).rank);
    return { ...p, rank: ranks[0], ranks, matchedTitle: findBusinessRank(p.results, lead).match?.title ?? null };
  });

  // Ratings, categories and websites sometimes only appear in the SERP rows,
  // so backfill anything the resolver did not already give us.
  const fromResults = new Map();
  for (const p of scanned) {
    for (const r of p.results || []) {
      const key = r.placeId || (r.title || '').toLowerCase();
      if (key && !fromResults.has(key)) fromResults.set(key, r);
    }
  }
  for (const b of businesses) {
    const hit = fromResults.get(b.placeId) || fromResults.get((b.name || '').toLowerCase());
    if (!hit) continue;
    for (const f of ['rating', 'reviews', 'category', 'website']) {
      if (b[f] == null || b[f] === '') b[f] = hit[f] ?? b[f];
    }
  }

  const metrics = computeMetrics(ranked);
  const profiles = businesses.map((b, i) => ({
    role: i === 0 ? 'lead' : 'competitor',
    index: i,
    name: b.name,
    placeId: b.placeId ?? null,
    cid: b.cid ?? null,
    lat: b.lat ?? null,
    lng: b.lng ?? null,
    address: b.address ?? '',
    website: b.website ?? '',
    category: b.category ?? '',
    rating: b.rating ?? null,
    reviews: b.reviews ?? null,
    autoSelected: !!b.autoSelected,
    unresolved: !!b.unresolved,
    metrics: metricsFromRanks(ranked.map((p) => p.ranks[i]), ranked),
  }));

  return {
    generatedAt: new Date().toISOString(),
    provider: provider.name,
    business: lead,
    inputBusinessName: business,
    location,
    address,
    keyword,
    spacingMi,
    competitorSource,
    businesses: profiles,
    points: ranked,
    metrics,
  };
}
