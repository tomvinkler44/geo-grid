/**
 * Step 2: recommend two rivals from a completed grid scan.
 *
 * The two are deliberately different arguments, not just "the top two":
 *
 *  - The Market Dominator: the regional leader. Broad coverage across the
 *    whole grid plus the review authority that earns it. Answers "who owns
 *    this market".
 *  - The Direct Peer: a business round the corner, at a similar size, that is
 *    still ahead on reviews. Answers "this is not about being a big chain,
 *    your neighbour is beating you".
 */
import { haversineMi } from './geometry.js';
import { nameSimilarity, findBusinessRank } from './providers/match.js';
import { inTop3 } from './ranks.js';

const UNRANKED = 21;
const rankValue = (r) => (r == null || r > 20 ? UNRANKED : r);

/**
 * Every business seen anywhere in the scan, with the stats needed to judge it.
 * `exclude` drops the lead so it cannot be recommended against itself.
 */
export function collectCandidates(points, lead) {
  const seen = new Map();
  for (const p of points) {
    for (const r of p.results || []) {
      if (!r.title) continue;
      const key = r.placeId || r.title.toLowerCase();
      let e = seen.get(key);
      if (!e) {
        e = {
          name: r.title,
          placeId: r.placeId ?? null,
          cid: r.cid ?? null,
          lat: r.lat ?? null,
          lng: r.lng ?? null,
          rating: r.rating ?? null,
          reviews: r.reviews ?? null,
          category: r.category ?? '',
          website: r.website ?? '',
          top3Count: 0,
          firstCount: 0,
          appearances: 0,
          rankSum: 0,
        };
        seen.set(key, e);
      }
      const rank = rankValue(r.position);
      e.appearances++;
      e.rankSum += rank;
      if (rank <= 3) e.top3Count++;
      if (rank === 1) e.firstCount++;
      if (e.reviews == null && r.reviews != null) e.reviews = r.reviews;
      if (e.rating == null && r.rating != null) e.rating = r.rating;
    }
  }

  const isLead = (e) =>
    (lead.placeId && e.placeId && lead.placeId === e.placeId) ||
    (lead.cid && e.cid && lead.cid === e.cid) ||
    nameSimilarity(lead.name, e.name) >= 0.8;

  const n = points.length;
  return [...seen.values()]
    .filter((e) => !isLead(e))
    .map((e) => ({
      ...e,
      top3Share: e.top3Count / n,
      averageRank: +(((e.rankSum + (n - e.appearances) * UNRANKED) / n).toFixed(2)),
      distanceMi: e.lat != null && lead.lat != null ? haversineMi(lead.lat, lead.lng, e.lat, e.lng) : null,
    }));
}

/**
 * Pick the two archetypes.
 * @returns {{dominator, peer, candidates, reasons}}
 */
/**
 * The lead's own top-3 share, read from the stored local packs.
 *
 * At scan time points carry only `results`; `rank`/`ranks` are added later by
 * finalizeAudit. Reading those fields here returned 0 for every scan, which
 * let a peer "beat" a prospect it was actually losing to.
 */
function leadTop3Share(points, lead) {
  const hits = points.filter((p) => {
    const r = Array.isArray(p.ranks) ? p.ranks[0] : findBusinessRank(p.results || [], lead).rank;
    return inTop3(r);
  }).length;
  return hits / points.length;
}

export function recommendCompetitors(points, lead) {
  const candidates = collectCandidates(points, lead);
  if (!candidates.length) return { dominator: null, peer: null, candidates: [], reasons: {} };

  const reviewsOf = (c) => c.reviews ?? 0;

  // Dominator: "the regional leader with the highest review count and wide
  // area coverage". Both conditions, in that order of operations - take every
  // business whose reach is near the top, then pick the most reviewed of them.
  // Scoring the two together lets a well-reviewed narrow business win, which
  // is not what a market dominator is.
  const maxCoverage = Math.max(...candidates.map((c) => c.top3Share));
  const BAND = 0.15; // coverage within 15 points of the widest still counts as wide
  const wide = candidates.filter((c) => c.top3Share >= maxCoverage - BAND);
  const dominator = wide.slice().sort((a, b) =>
    (b.reviews ?? 0) - (a.reviews ?? 0) || b.top3Share - a.top3Share)[0] || null;

  // Peer: the nearest rival that still out-reviews the prospect. It must not
  // out-cover the dominator, or the two panels contradict their own labels -
  // a "direct peer" showing more green than the "market dominator" reads as a
  // mistake to the person being pitched.
  const leadReviews = lead.reviews ?? 0;
  const leadCoverage = leadTop3Share(points, lead);
  const byDistance = (a, b) => (a.distanceMi ?? Infinity) - (b.distanceMi ?? Infinity);
  // The peer must out-rank the prospect. A nearby business doing *worse*
  // proves nothing to the person being pitched and undercuts the sheet, so
  // when no second rival beats them there is no peer panel at all.
  const beating = candidates.filter((c) => c !== dominator && c.top3Share > leadCoverage);
  // Winning by a single pin is noise, not a story. Prefer a rival clearly
  // ahead - about four pins on a 25-point grid - before settling for any.
  const CLEAR_MARGIN = 0.15;
  const clearly = beating.filter((c) => c.top3Share >= leadCoverage + CLEAR_MARGIN);
  // The sweet spot for a peer is roughly 35-50% coverage: plainly ahead of the
  // prospect, but not so dominant it reads as a second market leader.
  const PEER_BAND = [0.35, 0.5];
  const inBand = clearly.filter((c) => c.top3Share >= PEER_BAND[0] && c.top3Share <= PEER_BAND[1]);
  const peer =
    inBand.filter((c) => c.distanceMi != null).sort(byDistance)[0] ||
    clearly.filter((c) => reviewsOf(c) > leadReviews && c.distanceMi != null).sort(byDistance)[0] ||
    clearly.filter((c) => c.distanceMi != null).sort(byDistance)[0] ||
    beating.filter((c) => reviewsOf(c) > leadReviews && c.distanceMi != null).sort(byDistance)[0] ||
    beating.sort((a, b) => b.top3Share - a.top3Share)[0] ||
    null;

  const pct = (x) => `${Math.round(x * 100)}%`;
  const reasons = {
    dominator: dominator
      ? `Holds the Map Pack across ${pct(dominator.top3Share)} of the area${dominator.reviews ? ` on ${dominator.reviews.toLocaleString('en-US')} reviews` : ''}.`
      : '',
    peer: peer
      ? [
          peer.distanceMi != null ? `${peer.distanceMi.toFixed(1)} mi away` : 'Nearby',
          peer.reviews != null && peer.reviews > leadReviews ? `${peer.reviews.toLocaleString('en-US')} reviews against your ${leadReviews.toLocaleString('en-US')}` : null,
          `top 3 at ${pct(peer.top3Share)} of the grid`,
        ].filter(Boolean).join(' · ')
      : '',
  };

  // Said plainly in the composer when the market has one clear winner and
  // nobody else ahead of the prospect, instead of padding with a weak panel.
  const weakPeer = !peer;
  if (!peer) {
    reasons.peerWarning = 'No second rival out-ranks this business, so the report shows the market dominator only. You can name a competitor yourself.';
  }

  return { dominator, peer, candidates, reasons, weakPeer };
}

export const ARCHETYPES = {
  dominator: { key: 'dominator', label: 'Market Dominator', blurb: 'The regional leader: widest coverage and the review authority behind it.' },
  peer: { key: 'peer', label: 'Nearby Direct Peer', blurb: 'A rival round the corner, similar size, still ahead on reviews.' },
};
