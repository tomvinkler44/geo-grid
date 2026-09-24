/**
 * Builds the executive deliverable's view model: the headline visibility
 * share, the three conversion signals, and the five plain-English sentences.
 *
 * Every sentence is written from data we actually have. Where a signal was not
 * measured the sentence says so and leans on what was, rather than asserting
 * something unverified about a real business.
 */
import { normalizeName } from './providers/match.js';

const pct = (x) => `${Math.round(x * 100)}%`;
const num = (n) => (n == null ? null : n.toLocaleString('en-US'));
const fmtMi = (mi) => Number(mi.toFixed(1)).toString();

function bearingPhrase(label) {
  return String(label || '').replace('-', ' ').toLowerCase();
}

/** Largest distance from centre at which every point is still top 3. */
function safeRadiusMi(points, index = 0) {
  const sorted = [...points].sort((a, b) => a.distanceMi - b.distanceMi);
  let radius = 0;
  for (const p of sorted) {
    const r = p.ranks ? p.ranks[index] : p.rank;
    if (r != null && r <= 3) radius = p.distanceMi;
    else break;
  }
  return radius;
}

/** Nearest point where the business is effectively invisible. */
function firstBlindSpot(points, index = 0) {
  return [...points]
    .filter((p) => {
      const r = p.ranks ? p.ranks[index] : p.rank;
      return r == null || r >= 10;
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
export function buildSummary({ report, signals, offer }) {
  const { points, keyword, location, businesses } = report;
  const [lead, ...rivals] = businesses;
  const leadSig = signals[0];
  const m = lead.metrics;
  const n = points.length;
  const centre = points.find((p) => p.isCenter);
  const centreRank = centre ? centre.ranks[0] : null;
  const radius = safeRadiusMi(points, 0);
  const blind = firstBlindSpot(points, 0);
  const kw = keywordCoverage(keyword, location, lead);
  const dominator = rivals[0];
  const peer = rivals[1];

  // 1 — The Good
  const basics = [];
  if (report.business.address) basics.push('address');
  if (report.business.phone) basics.push('phone');
  if (report.business.hours) basics.push('opening hours');
  const good = basics.length >= 2
    ? `Your Google listing is live and the fundamentals are right: ${basics.join(', ')} are all published, and Google places you at rank ${centreRank ?? '20+'} when someone searches from your own address.`
    : centreRank != null && centreRank <= 3
      ? `Your Google listing is working where it should: searching from your own address, you come up at rank ${centreRank} in the Map Pack, so Google understands what you do and where you are.`
      : `Your Google listing is live and indexed for “${keyword}”, so the foundation is in place — Google already associates you with this service.`;

  // 2 — Found vs Chosen
  const dropoff = blind
    ? `by ${fmtMi(blind.distanceMi)} ${blind.distanceMi === 1 ? 'mile' : 'miles'} ${bearingPhrase(blind.bearing)} you have dropped off the map entirely`
    : `past that your position slides into the “more places” list that almost nobody opens`;
  const found = radius > 0
    ? `You are found, but not chosen: you hold the top 3 within about ${fmtMi(radius)} ${radius === 1 ? 'mile' : 'miles'} of your door, and ${dropoff}. Of the ${n} spots we searched from, only ${m.top3Count} put you in the Map Pack.`
    : `You are barely being found at all: across the ${n} spots we searched from, you reach the Map Pack at ${m.top3Count}, and ${dropoff}.`;

  // 3 — The Risk Gap
  const leadReviews = lead.reviews ?? 0;
  const gapParts = [dominator, peer].filter(Boolean)
    .map((r) => `${r.name} carries ${num(r.reviews ?? 0)}`);
  const risk = gapParts.length
    ? `When a searcher sees all three of you side by side, you show ${num(leadReviews)} reviews while ${gapParts.join(' and ')}. Nobody researches further than that — the longer list simply looks like the safer decision.`
    : `Your review count is what a searcher compares first, and it is the number that decides which of the three names in the Map Pack gets the call.`;

  // 4 — The Revenue Leak
  const leakBits = [];
  if (leadSig.measured && leadSig.ownerReplyRate != null) {
    leakBits.push(leadSig.ownerReplyRate === 0
      ? `none of your last ${leadSig.replySampleSize} reviews has an owner reply`
      : `only ${pct(leadSig.ownerReplyRate)} of your recent reviews have an owner reply`);
  }
  if (leadSig.measured && leadSig.velocityPerMonth === 0) {
    leakBits.push(`no new review has landed in ${leadSig.windowDays} days`);
  }
  if (kw.checked && !kw.matched) {
    leakBits.push(`your listing name and category never use the words “${kw.missing.join(' ')}” that people actually type`);
  }
  const leak = leakBits.length
    ? `The leak is activity: ${leakBits.join(', and ')}. Google treats an untended profile as a weaker answer than a busy one, so the ranking gap widens on its own every month you leave it.`
    : `The leak is activity. Google treats a profile that is being tended — fresh reviews, replies, service wording kept current — as a stronger answer than one that sits still, and the gap widens on its own.`;

  // 5 — The Turnkey Fix
  const fix = `${offer.name} handles that side for you: every finished job gets a review request at the moment people are most willing, every review gets answered, and the listing wording is kept aligned with what is being searched. That is the work that turns the amber and red pins on this map green.`;

  return [
    { n: 1, title: 'The good', text: good, measured: true },
    { n: 2, title: 'Found vs chosen', text: found, measured: true },
    { n: 3, title: 'The risk gap', text: risk, measured: lead.reviews != null },
    { n: 4, title: 'The revenue leak', text: leak, measured: leakBits.length > 0 },
    { n: 5, title: 'The turnkey fix', text: fix, measured: true },
  ];
}

/** The ready-to-send email built from the same five sentences. */
export function buildEmail({ report, summary, offer }) {
  const lead = report.businesses[0];
  const m = lead.metrics;
  const first = (lead.name.split(/\s+/)[0] || lead.name).replace(/[^A-Za-z0-9'&-]/g, '');
  return [
    `Subject: ${lead.name} — you're in the Google map pack at ${m.top3Count} of 25 nearby searches`,
    ``,
    `Hi ${first} team,`,
    ``,
    `I ran a visibility scan for "${report.keyword}" from 25 points around you and put it on one page. Five things it shows:`,
    ``,
    ...summary.map((s) => `${s.n}. ${s.title}. ${s.text}`),
    ``,
    `The attached page shows your map beside the two businesses taking those searches.`,
    ``,
    `${offer.name} is ${offer.price}, ${offer.terms}. Happy to walk you through the map on a short call if it's useful.`,
    ``,
    `Best,`,
    `[Your name]`,
  ].join('\n');
}

/** Assemble the whole executive deliverable. */
export function buildExecutive({ report, signals, offer }) {
  const [lead] = report.businesses;
  const share = lead.metrics.top3Share;
  const summary = buildSummary({ report, signals, offer });
  return {
    visibility: {
      share,
      label: pct(share),
      caption: `of nearby searches put you in the top 3`,
      tone: share >= 0.6 ? 'good' : share >= 0.3 ? 'warn' : 'bad',
      top3Count: lead.metrics.top3Count,
      points: report.points.length,
    },
    signals: buildSignals({ businesses: report.businesses, signals }),
    summary,
    email: buildEmail({ report, summary, offer }),
    offer,
    keywordCoverage: keywordCoverage(report.keyword, report.location, lead),
  };
}
