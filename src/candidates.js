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
import { nameSimilarity } from './providers/match.js';

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
/** The lead's own top-3 share, read from the same stored results. */
function leadTop3Share(points) {
  const hits = points.filter((p) => {
    const r = p.ranks ? p.ranks[0] : p.rank;
    return r != null && r <= 3;
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
  const leadCoverage = leadTop3Share(points);
  const byDistance = (a, b) => (a.distanceMi ?? Infinity) - (b.distanceMi ?? Infinity);
  const rest = candidates.filter((c) => c !== dominator);
  // Preference order. A peer that is itself invisible proves nothing to the
  // prospect, so a nearby rival actually beating them comes first.
  //
  // Deliberately no cap against the dominator's coverage: the dominator is the
  // regional name, and on a two-mile grid a business round the corner really
  // can hold more of it. Forcing an order here picked worse peers than it
  // fixed, and each panel's label already says why it was chosen.
  const peer =
    rest.filter((c) => reviewsOf(c) > leadReviews && c.top3Share >= leadCoverage && c.distanceMi != null).sort(byDistance)[0] ||
    rest.filter((c) => c.top3Share >= leadCoverage && c.distanceMi != null).sort(byDistance)[0] ||
    rest.filter((c) => reviewsOf(c) > leadReviews && c.distanceMi != null).sort(byDistance)[0] ||
    rest.sort((a, b) => b.top3Share - a.top3Share)[0] ||
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

  // Flagged so the composer can say plainly that this market has one clear
  // winner and no strong second, rather than quietly showing a weak panel.
  const weakPeer = Boolean(peer && peer.top3Share < leadCoverage);
  if (weakPeer) {
    reasons.peerWarning = 'No nearby rival is clearly beating this business except the dominator, so this panel is a weaker comparison. Consider naming one yourself.';
  }

  return { dominator, peer, candidates, reasons, weakPeer };
}

export const ARCHETYPES = {
  dominator: { key: 'dominator', label: 'Market Dominator', blurb: 'The regional leader: widest coverage and the review authority behind it.' },
  peer: { key: 'peer', label: 'Nearby Direct Peer', blurb: 'A rival round the corner, similar size, still ahead on reviews.' },
};
