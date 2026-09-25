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
import { inTop3, isVisible } from './ranks.js';

export const SPACING_OPTIONS = [0.5, 1, 1.5, 2];
export const MAX_COMPETITORS = 2;
/** Results kept per grid point: the local pack plus enough depth to rank rivals. */
const RESULT_DEPTH = 20;

const UNRANKED = 21;
const rankValue = (r) => (r == null || r > 20 ? UNRANKED : r);

/** Metrics for one business, given each point's rank for that business. */
export function metricsFromRanks(ranks, points) {
  const vals = ranks.map(rankValue);
  const n = vals.length;
  const top3Count = ranks.filter(inTop3).length;
  const visibleCount = ranks.filter(isVisible).length;
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
function validate(input) {
  const business = (input.business || '').trim();
  const location = (input.location || '').trim();
  const address = (input.address || '').trim();
  const keyword = (input.keyword || '').trim();
  const spacingMi = Number(input.spacingMi ?? 0.5);
  if (!business) throw new Error('Business name is required');
  if (!location) throw new Error('City/State (or zip) is required');
  if (!keyword) throw new Error('Keyword is required');
  if (!SPACING_OPTIONS.includes(spacingMi)) throw new Error(`Spacing must be one of ${SPACING_OPTIONS.join(', ')} miles`);
  return { business, location, address, keyword, spacingMi };
}

/**
 * Step one of the two-step flow: resolve the lead and scan the grid once.
 *
 * The scan is the only thing that costs money, and the whole local pack is
 * kept at every point, so competitors can be chosen *after* it and scored
 * without paying again.
 */
export async function scanGrid(input) {
  const { business, location, address, keyword, spacingMi } = validate(input);
  const log = input.onProgress || (() => {});
  const provider = getProvider(input.mock ? 'mock' : config.rankProvider);
  const isMock = provider.name === 'mock';

  log(`Resolving "${business}" in ${location} (${provider.name})…`);
  const coords = input.coordinates ? parseCoordinates(input.coordinates) : null;
  let lead;
  if (coords) {
    lead = { name: business, ...coords, placeId: null, cid: null, city: location, address, source: 'manual' };
    if (isMock) lead.verifiedFields = ['address', 'phone', 'hours'];
  } else {
    lead = await resolveBusiness(provider, { name: business, location, address });
  }
  if (!lead.name) lead.name = business;

  const points = buildGrid(lead.lat, lead.lng, spacingMi);
  const rankAt = provider.createRanker({ business: lead, keyword, spacingMi });

  log(`Checking ${points.length} points for "${keyword}"…`);
  let done = 0;
  const scanned = await mapLimit(points, isMock ? 25 : config.rankConcurrency, async (p) => {
    const results = (await rankAt(p)).slice(0, RESULT_DEPTH);
    done++;
    if (done % 5 === 0) log(`  ${done}/${points.length} points checked`);
    return { ...p, results };
  });

  // Backfill anything the resolver did not give us but the results reveal.
  backfill([lead], scanned);

  return {
    scannedAt: new Date().toISOString(),
    provider: provider.name,
    mock: isMock,
    lead,
    inputBusinessName: business,
    location,
    address,
    keyword,
    spacingMi,
    points: scanned,
  };
}

/** Fill blank profile fields from whatever the SERP rows revealed. */
function backfill(businesses, points) {
  const byKey = new Map();
  for (const p of points) {
    for (const r of p.results || []) {
      const key = r.placeId || (r.title || '').toLowerCase();
      if (key && !byKey.has(key)) byKey.set(key, r);
    }
  }
  for (const b of businesses) {
    const hit = byKey.get(b.placeId) || byKey.get((b.name || '').toLowerCase());
    if (!hit) continue;
    for (const f of ['rating', 'reviews', 'category', 'website']) {
      if (b[f] == null || b[f] === '') b[f] = hit[f] ?? b[f];
    }
  }
}

/**
 * Step two: given a finished scan and the chosen rivals, read every business
 * out of the stored results and build the report. Costs nothing extra.
 *
 * @param {object} scan          output of scanGrid
 * @param {object[]} competitors up to two rivals, each {name, placeId?, cid?, ...}
 */
export async function finalizeAudit(scan, competitors = [], opts = {}) {
  const log = opts.onProgress || (() => {});
  const lead = scan.lead;
  const chosen = competitors.filter(Boolean).slice(0, MAX_COMPETITORS);

  // A rival named by hand that we have no id for is resolved so it can be
  // matched by Place ID rather than by a fuzzy title alone.
  const provider = getProvider(scan.mock ? 'mock' : config.rankProvider);
  const resolved = await Promise.all(chosen.map(async (c) => {
    if (c.placeId || c.cid || scan.mock) return c;
    try {
      const r = await resolveBusiness(provider, { name: c.name, location: scan.location });
      return { ...r, ...c, placeId: r.placeId ?? null, cid: r.cid ?? null, name: c.name };
    } catch (err) {
      log(`  could not resolve "${c.name}": ${err.message} — matching by name only`);
      return { ...c, unresolved: true };
    }
  }));

  backfill(resolved, scan.points);
  const businesses = [lead, ...resolved];
  const ranked = scan.points.map((p) => {
    const ranks = businesses.map((b) => findBusinessRank(p.results, b).rank);
    return { ...p, rank: ranks[0], ranks, matchedTitle: findBusinessRank(p.results, lead).match?.title ?? null };
  });

  const metrics = computeMetrics(ranked);
  const profiles = businesses.map((b, i) => ({
    role: i === 0 ? 'lead' : 'competitor',
    index: i,
    archetype: b.archetype ?? null,
    name: b.name,
    placeId: b.placeId ?? null,
    cid: b.cid ?? null,
    lat: b.lat ?? null,
    lng: b.lng ?? null,
    address: b.address ?? '',
    website: b.website ?? '',
    category: b.category ?? '',
    phone: b.phone ?? '',
    rating: b.rating ?? null,
    reviews: b.reviews ?? null,
    autoSelected: !!b.autoSelected,
    unresolved: !!b.unresolved,
    metrics: metricsFromRanks(ranked.map((p) => p.ranks[i]), ranked),
  }));

  return {
    generatedAt: new Date().toISOString(),
    provider: scan.provider,
    business: lead,
    inputBusinessName: scan.inputBusinessName,
    location: scan.location,
    address: scan.address,
    keyword: scan.keyword,
    spacingMi: scan.spacingMi,
    competitorSource: opts.competitorSource || (resolved.every((c) => c.autoSelected) ? 'auto' : 'manual'),
    businesses: profiles,
    points: ranked,
    metrics,
  };
}

/**
 * One-shot audit: scan, pick the two strongest rivals automatically (or use
 * the names given), and build the report. Used by the CLI.
 */
export async function runAudit(input) {
  const scan = await scanGrid(input);
  const wanted = (input.competitors || []).map((c) => (c || '').trim()).filter(Boolean).slice(0, MAX_COMPETITORS);
  // Mock mode invents the market, so a real rival's name must not be attached
  // to invented numbers.
  const named = scan.mock ? [] : wanted.map((name) => ({ name }));
  let competitors = named;
  let source = named.length ? 'manual' : 'auto';
  if (competitors.length < MAX_COMPETITORS) {
    const auto = rankRivals(scan.points, [scan.lead, ...competitors])
      .slice(0, MAX_COMPETITORS - competitors.length)
      .map((a) => ({ ...a, autoSelected: true }));
    competitors = [...competitors, ...auto];
    if (named.length) source = 'mixed';
  }
  if (!competitors.length) source = 'none';
  return finalizeAudit(scan, competitors, { competitorSource: source, onProgress: input.onProgress });
}
