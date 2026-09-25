/**
 * Builds the executive deliverable's view model: the headline visibility
 * share, the three conversion signals, and the five plain-English sentences.
 *
 * Every sentence is written from data we actually have. Where a signal was not
 * measured the sentence says so and leans on what was, rather than asserting
 * something unverified about a real business.
 */
import { normalizeName } from './providers/match.js';
import { haversineMi } from './geometry.js';
import { inTop3, isInvisible, BAND_LABELS } from './ranks.js';
import { getNiche } from './niches.js';

const pct = (x) => `${Math.round(x * 100)}%`;
const num = (n) => (n == null ? null : n.toLocaleString('en-US'));
const fmtMi = (mi) => Number(mi.toFixed(1)).toString();

function bearingPhrase(label) {
  return String(label || '').replace('-', ' ').toLowerCase();
}

/** Largest distance from center at which every point is still top 3. */
function safeRadiusMi(points, index = 0) {
  const sorted = [...points].sort((a, b) => a.distanceMi - b.distanceMi);
  let radius = 0;
  for (const p of sorted) {
    const r = p.ranks ? p.ranks[index] : p.rank;
    if (inTop3(r)) radius = p.distanceMi;
    else break;
  }
  return radius;
}

/** Nearest point where the business is effectively invisible. */
function firstBlindSpot(points, index = 0) {
  return [...points]
    .filter((p) => {
      const r = p.ranks ? p.ranks[index] : p.rank;
      return isInvisible(r);
    })
    .sort((a, b) => a.distanceMi - b.distanceMi)[0] || null;
}

/**
 * Does the listing carry the words people actually search? Compares the
 * keyword's head terms (minus the place name) against the business name and
 * its primary category.
 */
export function keywordCoverage(keyword, location, business) {
  const placeWords = new Set(normalizeName(location).split(' ').filter(Boolean));
  const terms = normalizeName(keyword).split(' ').filter((w) => w && !placeWords.has(w));
  if (!terms.length) return { checked: false, matched: null, missing: [] };
  const haystack = normalizeName(`${business.name || ''} ${business.category || ''}`);
  const missing = terms.filter((t) => !haystack.includes(t));
  return { checked: true, matched: missing.length === 0, missing, terms };
}

/** One conversion-signal card. */
function card({ label, prospect, benchmark, verdict, measured, note }) {
  return { label, prospect, benchmark, verdict, measured, note: note || '' };
}

/**
 * The three metric cards. Each compares the prospect with Competitor A, the
 * market dominator named in the headline, so the page benchmarks against one
 * business throughout. The subtext is the consequence when the prospect is
 * behind; when they are level or ahead it says so instead of implying a gap.
 */
export function buildSignals({ businesses, signals }) {
  const lead = businesses[0];
  const a = businesses[1] || null;
  const ls = signals[0] || {};
  const as = signals[1] || {};
  const measuredRate = (s, f) => s && s.measured && s[f] != null;

  // --- Total Google reviews: always present in the local pack --------------
  const lr = lead.reviews ?? null;
  const ar = a ? a.reviews ?? null : null;
  const reviews = card({
    label: 'Total Google Reviews',
    prospect: lr == null ? '—' : num(lr),
    benchmark: ar == null ? '—' : `${num(ar)} leader`,
    measured: lr != null && ar != null,
    verdict: lr == null || ar == null ? 'Review counts were not available for both businesses.'
      : lr < ar ? 'Causes searcher hesitation' : 'You lead on review volume',
  });

  // --- 30-day velocity: needs a reviews endpoint ----------------------------
  const lv = measuredRate(ls, 'velocityPerMonth') ? ls.velocityPerMonth : null;
  const av = measuredRate(as, 'velocityPerMonth') ? as.velocityPerMonth : null;
  const velocity = card({
    label: '30-Day Review Velocity',
    prospect: lv == null ? 'not measured' : `${ls.atLeast ? '≥' : ''}${lv}/mo`,
    benchmark: av == null ? '—' : `${as.atLeast ? '≥' : ''}${av}/mo leader`,
    measured: lv != null,
    note: ls.note,
    verdict: lv == null ? 'Needs a reviews data source (Settings, section 1)'
      : av == null || lv < av ? 'Signals listing freshness to Google' : 'Keeping pace with the leader',
  });

  // --- Owner reply rate: needs a reviews endpoint, never from Places -------
  const lp = measuredRate(ls, 'ownerReplyRate') ? ls.ownerReplyRate : null;
  const ap = measuredRate(as, 'ownerReplyRate') ? as.ownerReplyRate : null;
  const reply = card({
    label: 'Owner Reply Rate',
    prospect: lp == null ? 'not measured' : pct(lp),
    benchmark: ap == null ? '—' : `${pct(ap)} leader`,
    measured: lp != null,
    note: ls.note,
    verdict: lp == null ? 'Needs a reviews data source (Settings, section 1)'
      : ap == null || lp < ap ? 'Missed keyword & activity signals' : 'Replying as actively as the leader',
  });

  return { reviews, velocity, reply };
}

/**
 * The five numbered sentences.
 * @returns {Array<{n:number,title:string,text:string,measured:boolean}>}
 */

/* ------------------------------------------------------------------------ */
/* Location, leader and headline                                            */
/* ------------------------------------------------------------------------ */

const US_STATE = /^[A-Za-z]{2}$/;

/**
 * "sunnyvale,  ca" -> "Sunnyvale, CA". A bare zip falls back to whatever city
 * the resolver found. Never carries resolver notes like "(approximate ...)".
 */
export function formatLocation(location = '', lead = {}) {
  const raw = String(location).trim();
  if (/^\d{5}(-\d{4})?$/.test(raw)) {
    const city = String(lead.city || '').split(',')[0].trim();
    return city ? `${city} ${raw}` : raw;
  }
  const parts = raw.split(',').map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return '';
  const titled = (w) => w.replace(/\S+/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase());
  const city = titled(parts[0]);
  const state = parts[1] ? (US_STATE.test(parts[1]) ? parts[1].toUpperCase() : titled(parts[1])) : '';
  return state ? `${city}, ${state}` : city;
}

export function cityOf(location, lead) {
  return formatLocation(location, lead).split(',')[0].replace(/\s\d{5}.*/, '').trim();
}

/** The rival holding the most Map Pack spots. The headline names this one. */
export function marketLeader(businesses) {
  return businesses.slice(1).reduce((best, b) =>
    (!best || b.metrics.top3Count > best.metrics.top3Count ? b : best), null);
}

/** The rival with the most reviews. The risk-gap line names this one. */
function mostReviewed(businesses) {
  return businesses.slice(1).reduce((best, b) =>
    ((b.reviews ?? -1) > (best?.reviews ?? -1) ? b : best), null);
}

/**
 * "[Business] captures [X]% of local searches in [City]. [Competitor A]
 * captures [Y]%." X and Y are each business's top-3 share across the 25 grid
 * points; the context strip under the headline says exactly that.
 */
export function buildHeadline(report) {
  const { businesses, points, location, keyword, generatedAt } = report;
  const lead = businesses[0];
  const a = businesses[1] || null;
  const city = cityOf(location, report.business) || 'your area';
  // The grid is (spacing x 4) miles *across*: 2 mi at the default spacing,
  // i.e. a 1-mile radius. Saying "radius" here would double the claim.
  const area = `${Number((report.spacingMi * 4).toFixed(1))}-mile area`;
  const first = `${lead.name} captures ${pct(lead.metrics.top3Share)} of local searches across a ${area}.`;
  const date = new Date(generatedAt || Date.now()).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  return {
    text: a ? `${first} ${a.name} captures ${pct(a.metrics.top3Share)}.` : first,
    leadPct: pct(lead.metrics.top3Share),
    rivalPct: a ? pct(a.metrics.top3Share) : null,
    context: `Search Term: “${keyword}” · Area Tested: ${points.length} Neighborhood Coordinates · Date: ${date}`,
    leader: a,
    city,
    area,
  };
}

/** The compact legend printed directly under the maps. */
export function legendText(spacingMi) {
  return `● ${BAND_LABELS.visible} (Green)  ● ${BAND_LABELS.weak} (Amber)  ● ${BAND_LABELS.invisible} (Red)  |  Circled pin = Your Address  |  ${spacingMi} mi grid spacing`;
}

/** Real services for the vertical, named in the action plan's replies line. */
export function serviceTokens(_keyword, _location, niche) {
  return (niche.services || []).slice(0, 3);
}

/**
 * Two columns. The diagnosis says how they rank today; the action plan says
 * what moves the pins. Every sentence is assembled from measured values, and
 * each principle has a fallback so no sentence contradicts the map printed
 * beside it (for instance, never "you rank high at your door" when you don't).
 */
export function buildNarrative({ report, signals, offer, niche: nicheKey }) {
  const niche = getNiche(nicheKey);
  const { points, keyword, location, businesses } = report;
  const lead = businesses[0];
  const a = businesses[1] || null;
  const ls = signals[0] || {};
  const as = signals[1] || {};
  const centre = points.find((p) => p.isCenter);
  const door = centre ? centre.ranks[0] : null;
  const radius = safeRadiusMi(points, 0);
  const blind = firstBlindSpot(points, 0);
  const verified = (report.business.verifiedFields || []).includes('address');
  const aName = a ? a.name : 'the market leader';
  const miles = (m) => `${fmtMi(m)} ${m === 1 ? 'mile' : 'miles'}`;

  // ---- Diagnosis ----------------------------------------------------------
  // 1. Validate proximity, without contradicting the map.
  const knows = verified ? 'Google verifies your address' : 'Google places your listing at your address';
  let proximity;
  if (inTop3(door) && radius > 0) {
    proximity = `${knows} and ranks you #${door} at your door, holding the top 3 within ${miles(radius)}.`;
  } else if (inTop3(door)) {
    proximity = `${knows} and ranks you #${door} at your door, but only at that spot.`;
  } else {
    proximity = `${knows}, yet even at your door you rank ${door == null ? 'outside the top 20' : `#${door}`}, below the three listings most people call.`;
  }

  // 2. Reveal the perimeter drop.
  let perimeter;
  if (blind) {
    perimeter = `Beyond ${miles(blind.distanceMi)}, your listing drops into the red zone outside the top 10, handing calls across town to ${aName}.`;
  } else if (radius > 0) {
    perimeter = `Beyond ${miles(radius)}, you slip to positions 4–10, below the fold, handing the first calls across town to ${aName}.`;
  } else {
    perimeter = `Across the ${points.length} points tested you reach the top 3 in only ${lead.metrics.top3Count}, so proximity alone is not winning customers across town.`;
  }

  // 3. Quantify the social-proof gap, against A, or whoever out-reviews them.
  // Competitor A first, so this line and the review card beside it compare
  // the same two businesses. Only if A does not out-review the prospect does
  // it fall to whichever rival does.
  const outReviews = (b) => b && b.reviews != null && lead.reviews != null && b.reviews > lead.reviews;
  const bigger = outReviews(a) ? a
    : businesses.slice(2).filter(outReviews).sort((x, y) => y.reviews - x.reviews)[0];
  const proof = bigger
    ? `Searchers comparing your ${num(lead.reviews)} reviews to ${possessive(bigger.name)} ${num(bigger.reviews)} will naturally pick the larger profile as the safer decision.`
    : lead.reviews != null && a
      ? `You out-review ${a.name} (${num(lead.reviews)} to ${num(a.reviews ?? 0)}), yet they still hold ${a.metrics.top3Count} more top-3 spots. Volume alone is not what is holding you back.`
      : `Your review count is the first thing a searcher compares side by side, and it decides which listing looks like the safer choice.`;

  // ---- Action plan --------------------------------------------------------
  // A. Recency outweighs historical volume.
  const lv = ls.measured ? ls.velocityPerMonth : null;
  const av = as.measured ? as.velocityPerMonth : null;
  const recency = lv != null && av != null && lv < av
    ? `You are adding ${lv} review${lv === 1 ? '' : 's'} a month to ${possessive(aName)} ${av}. Consistent monthly reviews signal fresh momentum to Google, helping you steadily overtake older, dormant listings.`
    : `Activating consistent monthly reviews signals fresh momentum to Google, helping you steadily overtake older, dormant listings.`;

  // B. Semantic keyword indexing through owner replies.
  const tokens = serviceTokens(keyword, location, niche).map((t) => `“${t}”`).join(', ');
  const lp = ls.measured ? ls.ownerReplyRate : null;
  const replies = `${lp != null && lp < 1 ? `Today ${pct(lp)} of your reviews get a reply. ` : ''}Posting owner replies to 100% of reviews that name your services (${tokens}) keeps your profile active and puts those terms in front of Google.`;

  // C. Industry-tailored automation.
  const automation = `The Review Engine asks 100% of real customers for a review right after each ${niche.transactionEvent}, with no filtering, so reviews keep coming without your team having to remember.`;

  return {
    diagnosis: [
      { key: 'proximity', title: 'Proximity', text: proximity },
      { key: 'perimeter', title: 'The perimeter drop', text: perimeter },
      { key: 'proof', title: 'The social-proof gap', text: proof },
    ],
    plan: [
      { key: 'recency', title: 'Recency beats volume', text: recency },
      { key: 'keywords', title: 'Replies that name your services', text: replies },
      { key: 'automation', title: 'Hands-off collection', text: automation },
    ],
  };
}

/** "Blue Sky Residences" -> "Blue Sky Residences'", "Summit" -> "Summit's". */
export function possessive(name) {
  const n = String(name || '').trim();
  return /s$/i.test(n) ? `${n}'` : `${n}'s`;
}

function cap(w) { return w ? w[0].toUpperCase() + w.slice(1) : w; }

/* ------------------------------------------------------------------------ */
/* Emails                                                                    */
/* ------------------------------------------------------------------------ */

/** Signature block. The postal address is what CAN-SPAM actually requires. */
function signature(sender) {
  return [
    sender.name,
    sender.company,
    sender.postalAddress || sender.cityState,
    sender.email,
  ].filter(Boolean);
}

/**
 * The first-touch permission email. Short, specific, and CAN-SPAM shaped:
 * accurate subject, the sender's postal address, and a working opt-out.
 *
 * `lead` and `rivals` only need {name, reviews, lat, lng}, so this works from
 * a step-2 scan before any report exists.
 */
export function buildOutreachEmail({ lead, rivals, location, ownerName, niche: nicheKey, sender }) {
  const niche = getNiche(nicheKey);
  const city = cityOf(location, lead) || 'your area';
  const withReviews = rivals.filter((r) => r && r.reviews != null);
  const comp = withReviews.sort((a, b) => b.reviews - a.reviews)[0] || rivals.find(Boolean) || null;

  const near = comp && comp.lat != null && lead.lat != null
    && haversineMi(lead.lat, lead.lng, comp.lat, comp.lng) <= 3;
  const where = near ? 'right near you' : `in ${city}`;

  let comparison;
  if (comp && lead.reviews != null && comp.reviews != null && comp.reviews > lead.reviews) {
    comparison = `You've clearly got happy customers, but you have ${num(lead.reviews)} reviews while ${comp.name} ${where} has ${num(comp.reviews)}. When someone compares two listings, they usually pick the one that looks more established, even if the other does better work.`;
  } else if (comp) {
    comparison = `You've clearly got happy customers, but ${comp.name} ${where} is showing up ahead of you in more nearby Google searches. When someone compares two listings, they usually pick the one Google puts first, even if the other does better work.`;
  } else {
    comparison = `You've clearly got happy customers, but your listing drops out of Google's top results a short distance from your door.`;
  }

  const subject = comp ? `${lead.name} vs ${comp.name} on Google` : `${lead.name} on Google`;
  const body = [
    `Hi ${String(ownerName || '').trim() || 'there'},`,
    ``,
    `I was looking at ${niche.marketNoun} in ${city} on Google and came across your listing.`,
    ``,
    comparison,
    ``,
    `I put together a short report showing a few simple changes that could close that gap. Would it be all right if I sent it over? No charge, it's yours either way.`,
    ``,
    ...signature(sender),
    ``,
    `Not relevant? Just reply "no" and I won't follow up.`,
  ].join('\n');

  const warnings = [];
  if (!sender.canSpamAddressReady) {
    warnings.push('CAN-SPAM requires a full postal address (street, P.O. box, or private mailbox) in commercial email. Add one in Settings before sending.');
  }
  return { subject, body, text: `Subject: ${subject}\n\n${body}`, competitor: comp?.name || null, warnings };
}

/** The follow-up email that goes out with the report attached. */
export function buildReportEmail({ report, narrative, headline, offer, sender, links, ownerName }) {
  const lead = report.businesses[0];
  return [
    `Subject: ${lead.name} — your local Google visibility report`,
    ``,
    `Hi ${String(ownerName || '').trim() || 'there'},`,
    ``,
    `Here's the report I mentioned. ${headline.text}`,
    ``,
    `How you rank today:`,
    ...narrative.diagnosis.map((d) => `- ${d.text}`),
    ``,
    `What moves the pins:`,
    ...narrative.plan.map((d) => `- ${d.text}`),
    ``,
    `${offer.name}: ${offer.microcopy}.`,
    offer.guarantee,
    ``,
    `If you'd like to start: ${links.activate}`,
    ``,
    ...signature(sender),
    ``,
    `Not relevant? Just reply "no" and I won't follow up.`,
  ].join('\n');
}

/* ------------------------------------------------------------------------ */
/* Assembly                                                                  */
/* ------------------------------------------------------------------------ */

export function buildExecutive({ report, signals, offer, sender, niche, links, ownerName }) {
  const headline = buildHeadline(report);
  const narrative = buildNarrative({ report, signals, offer, niche });
  const lead = report.businesses[0];
  return {
    headline,
    legend: legendText(report.spacingMi),
    city: headline.city,
    location: formatLocation(report.location, report.business),
    visibility: {
      share: lead.metrics.top3Share,
      label: pct(lead.metrics.top3Share),
      top3Count: lead.metrics.top3Count,
      points: report.points.length,
    },
    signals: buildSignals({ businesses: report.businesses, signals }),
    narrative,
    offer,
    sender,
    links,
    niche: getNiche(niche),
    reportEmail: buildReportEmail({ report, narrative, headline, offer, sender, links, ownerName }),
    outreachEmail: buildOutreachEmail({
      lead: { ...lead, city: report.business.city },
      rivals: report.businesses.slice(1),
      location: report.location,
      ownerName,
      niche,
      sender,
    }),
    keywordCoverage: keywordCoverage(report.keyword, report.location, lead),
  };
}
