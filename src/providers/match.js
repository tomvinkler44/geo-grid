const STOP = new Set(['inc', 'llc', 'co', 'corp', 'ltd', 'the', 'and', '&', 'of']);

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

/** Pick the best-matching candidate from a resolver search. */
export function pickBestCandidate(candidates, name) {
  let best = null;
  for (const c of candidates) {
    const score = nameSimilarity(c.name, name);
    if (!best || score > best.score) best = { score, c };
  }
  return best && best.score >= 0.34 ? best.c : candidates[0] || null;
}
