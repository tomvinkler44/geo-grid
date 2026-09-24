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

export function buildSignals({ businesses, signals }) {
  const [lead, ...rivals] = businesses;
  const leadSig = signals[0];
  const rivalSigs = signals.slice(1);
  const best = (pick) => {
    const vals = rivals.map((r, i) => pick(r, rivalSigs[i])).filter((v) => v != null);
    return vals.length ? Math.max(...vals) : null;
  };

  // --- Total reviews (always available from the SERP) ---------------------
  const leadReviews = lead.reviews ?? null;
  const rivalBest = best((r) => r.reviews);
  const reviews = card({
    label: 'Total Google reviews',
    prospect: leadReviews == null ? '—' : num(leadReviews),
    benchmark: rivalBest == null ? '—' : `${num(rivalBest)} best rival`,
    measured: leadReviews != null && rivalBest != null,
    verdict:
      leadReviews == null || rivalBest == null
        ? 'Review counts were not available for every business.'
        : leadReviews >= rivalBest
          ? 'You hold the review lead in this market.'
          : `Roughly ${(rivalBest / Math.max(1, leadReviews)).toFixed(1)}× fewer than the leader — you read as the riskier choice.`,
  });

  // --- Recent review velocity -------------------------------------------
  const rivalVelocity = best((_r, s) => s?.velocityPerMonth);
  const velocity = card({
    label: `Reviews in the last ${leadSig.windowDays} days`,
    prospect: leadSig.measured && leadSig.velocityPerMonth != null
      ? `${leadSig.atLeast ? '≥' : ''}${leadSig.velocityPerMonth}/mo`
      : 'not measured',
    benchmark: rivalVelocity == null ? '—' : `${rivalVelocity}/mo best rival`,
    measured: leadSig.measured && leadSig.velocityPerMonth != null,
    note: leadSig.note,
    verdict:
      !leadSig.measured || leadSig.velocityPerMonth == null
        ? 'A reviews endpoint is needed to measure recency. Add SerpApi or DataForSEO credentials.'
        : leadSig.velocityPerMonth === 0
          ? 'No new reviews this month — the profile reads as dormant.'
          : rivalVelocity != null && leadSig.velocityPerMonth < rivalVelocity
            ? 'Fewer fresh reviews than the rivals, so the profile looks less current.'
            : 'Healthy recent review flow.',
  });

  // --- Owner reply rate ---------------------------------------------------
  const rivalReply = best((_r, s) => s?.ownerReplyRate);
  const reply = card({
    label: 'Owner reply rate',
    prospect: leadSig.measured && leadSig.ownerReplyRate != null
      ? `${pct(leadSig.ownerReplyRate)} (${leadSig.ownerReplies} of ${leadSig.replySampleSize})`
      : 'not measured',
    benchmark: rivalReply == null ? '—' : `${pct(rivalReply)} best rival`,
    measured: leadSig.measured && leadSig.ownerReplyRate != null,
    note: leadSig.note,
    verdict:
      !leadSig.measured || leadSig.ownerReplyRate == null
        ? 'Owner replies need a reviews endpoint. Google Places does not expose them.'
        : leadSig.ownerReplyRate === 0
          ? 'Not one review answered — Google reads that as an inactive profile.'
          : leadSig.ownerReplyRate < 0.5
            ? 'Most reviews go unanswered.'
            : 'Replies are being handled well.',
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

export function buildHeadline(report) {
  const { businesses, points } = report;
  const lead = businesses[0];
  const n = points.length;
  const mine = lead.metrics.top3Count;
  const leader = marketLeader(businesses);
  const first = `You're in Google's top 3 for ${mine} of ${n} nearby searches.`;
  if (!leader) {
    return { text: first, sub: `${pct(mine / n)} your coverage`, leader: null };
  }
  if (leader.metrics.top3Count <= mine) {
    return {
      text: `${first} No competitor we found is in more.`,
      sub: `${pct(mine / n)} your coverage vs. ${pct(leader.metrics.top3Share)} nearest rival`,
      leader,
    };
  }
  return {
    text: `${first} ${leader.name} is in ${leader.metrics.top3Count}.`,
    sub: `${pct(mine / n)} your coverage vs. ${pct(leader.metrics.top3Share)} market leader`,
    leader,
  };
}

export function legendText(spacingMi) {
  return `● ${BAND_LABELS.visible} (Green)  ● ${BAND_LABELS.weak} (Amber)  ● ${BAND_LABELS.invisible} (Red)  |  ${spacingMi} mi grid spacing`;
}

/* ------------------------------------------------------------------------ */
/* The narrative: four findings and the fix                                 */
/* ------------------------------------------------------------------------ */

/**
 * Each point is a bold one-liner plus one explanatory sentence. Every claim is
 * drawn from something measured; where a planned finding was not measurable
 * the slot is filled with a different finding that was, rather than an
 * assertion nobody checked.
 */
export function buildNarrative({ report, signals, offer, niche: nicheKey }) {
  const niche = getNiche(nicheKey);
  const { points, keyword, location, businesses } = report;
  const lead = businesses[0];
  const leadSig = signals[0] || {};
  const n = points.length;
  const centre = points.find((p) => p.isCenter);
  const doorRank = centre ? centre.ranks[0] : null;
  const doorText = doorRank == null ? 'outside the top 20' : `#${doorRank}`;
  const radius = safeRadiusMi(points, 0);
  const blind = firstBlindSpot(points, 0);
  const leader = marketLeader(businesses);
  const biggest = mostReviewed(businesses);

  // 1 - Profile basics
  // Only fields a resolver actually confirmed. Without Google Places there is
  // nothing to confirm, and the sentence falls back to what the scan proves.
  const verified = ['address', 'phone', 'hours'].filter((f) => (report.business.verifiedFields || []).includes(f));
  const basicsList = verified.length === 3 ? 'Address, phone, and hours'
    : verified.length === 2 ? `${cap(verified[0])} and ${verified[1]}`
      : verified.length === 1 ? cap(verified[0]) : null;
  const one = {
    title: 'Profile Basics',
    text: basicsList
      ? `${basicsList} ${verified.length === 1 ? 'is' : 'are'} properly verified; you rank ${doorText} directly at your doorstep.`
      : `Your listing is live and indexed for “${keyword}”; you rank ${doorText} directly at your doorstep.`,
  };

  // 2 - The distance drop
  const rival = leader ? ` to ${leader.name}` : '';
  let dropText;
  if (radius > 0 && blind) {
    dropText = `You hold the top 3 within ${fmtMi(radius)} ${radius === 1 ? 'mile' : 'miles'}, but drop off the map past ${fmtMi(blind.distanceMi)} ${blind.distanceMi === 1 ? 'mile' : 'miles'}, losing calls across town${rival}.`;
  } else if (radius > 0) {
    dropText = `You hold the top 3 within ${fmtMi(radius)} ${radius === 1 ? 'mile' : 'miles'}, then slide below the fold where few searchers scroll, losing calls${rival}.`;
  } else if (blind) {
    dropText = `You are outside the top 3 even near your door, and off the map entirely by ${fmtMi(blind.distanceMi)} ${blind.distanceMi === 1 ? 'mile' : 'miles'}, losing calls${rival}.`;
  } else {
    dropText = `You reach the top 3 in only ${lead.metrics.top3Count} of ${n} nearby searches, losing calls${rival}.`;
  }
  const two = { title: 'The Distance Drop', text: dropText };

  // 3 - The risk gap
  let three;
  if (biggest && lead.reviews != null && biggest.reviews != null && biggest.reviews > lead.reviews) {
    three = {
      title: 'The Risk Gap',
      text: `You have ${num(lead.reviews)} reviews while ${biggest.name} has ${num(biggest.reviews)}. Most people don't look further; the longer list looks like the safer choice.`,
    };
  } else if (leader && lead.reviews != null) {
    three = {
      title: 'The Visibility Gap',
      text: `You have ${num(lead.reviews)} reviews, yet ${leader.name} is shown ahead of you in ${leader.metrics.top3Count - lead.metrics.top3Count} more nearby searches. Reviews alone are not closing the gap.`,
    };
  } else {
    three = {
      title: 'The Risk Gap',
      text: `Your review count is the first thing a searcher compares, and it decides which of the three names in the Map Pack gets the call.`,
    };
  }

  // 4 - Unanswered reviews, or the strongest measured substitute
  const kw = keywordCoverage(keyword, location, lead);
  const invisible = lead.metrics.invisibleCount;
  let four;
  if (leadSig.measured && leadSig.ownerReplyRate != null) {
    four = {
      title: 'Unanswered Reviews & Inactivity',
      text: leadSig.ownerReplyRate === 0
        ? `None of your last ${leadSig.replySampleSize} reviews has an owner reply. Unreplied reviews signal dormancy to Google and searchers.`
        : `Only ${pct(leadSig.ownerReplyRate)} of recent reviews have an owner reply. Unreplied reviews signal dormancy to Google and searchers.`,
    };
  } else if (leadSig.measured && leadSig.velocityPerMonth === 0) {
    four = {
      title: 'Review Inactivity',
      text: `No new review has landed in ${leadSig.windowDays} days. A quiet profile signals dormancy to Google and searchers.`,
    };
  } else if (kw.checked && !kw.matched) {
    four = {
      title: 'Missing Service Keywords',
      text: `Your listing name and category never use “${kw.missing.join(' ')}”, the words people actually search. Google can't rank you for terms your profile doesn't carry.`,
    };
  } else {
    four = {
      title: 'Invisible Across Town',
      text: `In ${invisible} of ${n} nearby searches you are not on the first screen at all. Each of those is a customer who never learns you exist.`,
    };
  }

  // The fix
  const fix = {
    title: 'The Turnkey Fix',
    text: `Our Review Engine requests feedback from every customer upon each ${niche.transactionEvent}, automatically posts keyword-rich replies, and expands your green pins for ${offer.price}.`,
  };

  return {
    findings: [one, two, three, four].map((f, i) => ({ n: i + 1, ...f })),
    fix,
  };
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
  const lines = [
    `Subject: ${lead.name} — your local Google visibility report`,
    ``,
    `Hi ${String(ownerName || '').trim() || 'there'},`,
    ``,
    `Here's the report I mentioned. ${headline.text}`,
    ``,
    ...narrative.findings.map((f) => `${f.n}. ${f.title}: ${f.text}`),
    ``,
    `${narrative.fix.title}: ${narrative.fix.text}`,
    ``,
    `${offer.guarantee}`,
    ``,
    `If you'd like to start: ${links.activate}`,
    ``,
    ...signature(sender),
    ``,
    `Not relevant? Just reply "no" and I won't follow up.`,
  ];
  return lines.join('\n');
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
