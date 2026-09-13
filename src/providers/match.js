const STOP = new Set(['inc', 'llc', 'co', 'corp', 'ltd', 'the', 'and', '&', 'of']);

const STREET_TYPES = {
  street: 'st', st: 'st', avenue: 'ave', ave: 'ave', av: 'ave', road: 'rd', rd: 'rd',
  boulevard: 'blvd', blvd: 'blvd', drive: 'dr', dr: 'dr', lane: 'ln', ln: 'ln',
  court: 'ct', ct: 'ct', place: 'pl', pl: 'pl', parkway: 'pkwy', pkwy: 'pkwy',
  highway: 'hwy', hwy: 'hwy', way: 'way', circle: 'cir', cir: 'cir', terrace: 'ter',
  north: 'n', south: 's', east: 'e', west: 'w', northeast: 'ne', northwest: 'nw',
  southeast: 'se', southwest: 'sw', suite: 'ste', ste: 'ste', apartment: 'apt', apt: 'apt',
};

export function normalizeName(s = '') {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .join(' ');
}

/** 0..1 similarity between two business names (token Jaccard + containment). */
export function nameSimilarity(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const ta = new Set(na.split(' '));
  const tb = new Set(nb.split(' '));
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/** Street address reduced to comparable tokens: "1 N Main Street" -> "1 n main st". */
export function normalizeAddress(s = '') {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => STREET_TYPES[w] || w)
    .join(' ');
}

/**
 * 0..1 address similarity. The street number is the strongest single signal,
 * so a mismatched number caps the score well below a match.
 */
export function addressSimilarity(a, b) {
  const na = normalizeAddress(a);
  const nb = normalizeAddress(b);
  if (!na || !nb) return 0;
  const ta = na.split(' ');
  const tb = nb.split(' ');
  const numA = ta.find((t) => /^\d+$/.test(t));
  const numB = tb.find((t) => /^\d+$/.test(t));
  const sa = new Set(ta);
  const sb = new Set(tb);
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  const overlap = inter / Math.min(sa.size, sb.size);
  if (numA && numB) return numA === numB ? Math.max(0.75, overlap) : Math.min(overlap, 0.4);
  return overlap;
}

/**
 * Find the target business in a list of local results.
 * Returns { rank, match } where rank is the 1-based position or null.
 */
export function findBusinessRank(results, business, { threshold = 0.5 } = {}) {
  let best = null;
  for (const r of results) {
    const idMatch = business.placeId && r.placeId && r.placeId === business.placeId;
    const cidMatch = business.cid && r.cid && r.cid === business.cid;
    const score = idMatch || cidMatch ? 1 : nameSimilarity(r.title, business.name);
    if (score >= threshold && (!best || score > best.score)) best = { score, r };
    if (score === 1) break;
  }
  return best ? { rank: best.r.position, match: best.r } : { rank: null, match: null };
}

/**
 * Pick the best-matching candidate from a resolver search.
 *
 * An exact name-plus-address match is what we want: picking the wrong listing
 * silently produces an audit for someone else's business. When an address is
 * supplied it dominates the score, because two nearby businesses often share
 * most of their name ("Sunrise Senior Living of Sunnyvale" vs "... of Cupertino").
 */
export function pickBestCandidate(candidates, name, address = '') {
  let best = null;
  for (const c of candidates) {
    const nameScore = nameSimilarity(c.name, name);
    const addrScore = address ? addressSimilarity(c.address || '', address) : 0;
    const score = address ? nameScore * 0.55 + addrScore * 0.45 : nameScore;
    if (!best || score > best.score) best = { score, c, nameScore, addrScore };
  }
  if (!best) return null;
  // Without an address, keep the old bar. With one, a confident name match is
  // still accepted so a differently formatted address cannot block resolution.
  if (address && (best.score >= 0.5 || best.nameScore >= 0.9)) return best.c;
  return best.nameScore >= 0.34 ? best.c : candidates[0] || null;
}
