import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, unmeasured, WINDOW_DAYS } from '../src/providers/reviews.js';
import { recommendCompetitors, collectCandidates } from '../src/candidates.js';
import { buildSignals, buildNarrative, buildHeadline, buildOutreachEmail, formatLocation, keywordCoverage, possessive } from '../src/executive.js';
import { scanGrid, finalizeAudit } from '../src/audit.js';

const OFFER = { name: 'Local Review Engine & Geo-Expansion', price: '$297/mo', cta: 'Start 60-Day Review Engine — $297/mo' };
const BASE = {
  business: 'Pacific Coast Assisted Living',
  location: 'Sunnyvale, CA',
  keyword: 'assisted living sunnyvale',
  spacingMi: 0.5,
  mock: true,
  coordinates: '37.3688,-122.0363',
};

/* ------------------------------ review signals ------------------------------ */

test('review velocity counts only the last 30 days', () => {
  const now = Date.parse('2026-09-24T00:00:00Z');
  const day = 86400000;
  const s = summarize([
    { time: now - 2 * day, hasOwnerReply: true },
    { time: now - 29 * day, hasOwnerReply: false },
    { time: now - 31 * day, hasOwnerReply: false },
    { time: now - 400 * day, hasOwnerReply: false },
  ], { totalReviews: 201, source: 'serpapi', sampleIsComplete: false, now });
  assert.equal(s.recentCount, 2, 'the 31- and 400-day-old reviews are outside the window');
  assert.equal(s.windowDays, WINDOW_DAYS);
  assert.equal(s.ownerReplies, 1);
  assert.equal(s.ownerReplyRate, 0.25);
});

test('a sample that is entirely inside the window is reported as a floor', () => {
  const now = Date.now();
  const s = summarize([{ time: now - 1000, hasOwnerReply: false }, { time: now - 2000, hasOwnerReply: false }],
    { totalReviews: 900, source: 'serpapi', sampleIsComplete: false, now });
  assert.equal(s.atLeast, true, 'we only saw the newest few, so the real rate may be higher');
  assert.match(s.note, /may be higher/);
});

test('an unmeasured signal is never reported as zero', () => {
  const u = unmeasured(201);
  assert.equal(u.measured, false);
  assert.equal(u.velocityPerMonth, null, 'null, not 0 - we did not look');
  assert.equal(u.ownerReplyRate, null);
  assert.equal(u.totalReviews, 201, 'the total we do know is kept');
});

test('cards for unmeasured signals say so instead of asserting a number', () => {
  const businesses = [
    { name: 'Lead', reviews: 121, metrics: {} },
    { name: 'Rival', reviews: 640, metrics: {} },
  ];
  const cards = buildSignals({ businesses, signals: [unmeasured(121), unmeasured(640)] });
  assert.equal(cards.velocity.prospect, 'not measured');
  assert.equal(cards.reply.prospect, 'not measured');
  assert.equal(cards.velocity.measured, false);
  assert.match(cards.reply.verdict, /reviews data source/i);
  // The review-count card only needs the SERP, so it still works.
  assert.equal(cards.reviews.measured, true);
  assert.equal(cards.reviews.prospect, '121');
});

/* ------------------------------- archetypes -------------------------------- */

test('the dominator is the most reviewed of the widest-reaching rivals', async () => {
  const scan = await scanGrid(BASE);
  const { dominator, peer, candidates } = recommendCompetitors(scan.points, scan.lead);
  assert.ok(candidates.length > 2);
  assert.ok(dominator && peer, 'both archetypes should be found');
  assert.notEqual(dominator.name, peer.name, 'the same business must not fill both slots');

  const maxCoverage = Math.max(...candidates.map((c) => c.top3Share));
  assert.ok(dominator.top3Share >= maxCoverage - 0.15, 'the dominator must have wide reach');
  const wide = candidates.filter((c) => c.top3Share >= maxCoverage - 0.15);
  assert.equal(dominator.reviews, Math.max(...wide.map((c) => c.reviews ?? 0)), 'and the most reviews among them');
});

test('the lead is never recommended as its own competitor', async () => {
  const scan = await scanGrid(BASE);
  const candidates = collectCandidates(scan.points, scan.lead);
  assert.ok(!candidates.some((c) => c.name === scan.lead.name));
});

/* --------------------- the four findings and the fix ---------------------- */

async function mockReport() {
  const scan = await scanGrid(BASE);
  const { dominator, peer } = recommendCompetitors(scan.points, scan.lead);
  return finalizeAudit(scan, [dominator, peer].filter(Boolean));
}

const measuredSignals = (report) => report.businesses.map((b, i) => summarize(
  [{ time: Date.now() - 5 * 86400000, hasOwnerReply: i > 0 }, { time: Date.now() - 9 * 86400000, hasOwnerReply: i > 0 }],
  { totalReviews: b.reviews, source: 'mock', sampleIsComplete: false },
));

test('the narrative is two columns of three: diagnosis and action plan', async () => {
  const report = await mockReport();
  const { diagnosis, plan } = buildNarrative({ report, signals: measuredSignals(report), offer: OFFER, niche: 'assisted-living' });
  assert.deepEqual(diagnosis.map((d) => d.key), ['proximity', 'perimeter', 'proof']);
  assert.deepEqual(plan.map((d) => d.key), ['recency', 'keywords', 'automation']);
  for (const x of [...diagnosis, ...plan]) assert.ok(x.title && x.text.length > 40, x.key);
  assert.match(plan[2].text, /100% of real customers/);
  assert.match(plan[2].text, /family tour or intake consultation/, 'assisted living vocabulary');
  assert.match(plan[1].text, /“assisted living suites”, “memory care”, “respite care”/, 'names the vertical\'s real services');
});

test('tree services and contractors get job-completion wording', async () => {
  const report = await mockReport();
  const { plan } = buildNarrative({ report, signals: measuredSignals(report), offer: OFFER, niche: 'tree-services' });
  assert.match(plan[2].text, /after each completed job,/);
  assert.match(plan[1].text, /“tree removal”, “stump grinding”, “emergency storm work”/);
  const plumbing = buildNarrative({ report, signals: measuredSignals(report), offer: OFFER, niche: 'plumbing' });
  assert.match(plumbing.plan[2].text, /after each completed service call,/);
  assert.match(plumbing.plan[1].text, /“water heater repair”, “drain clearing”, “leak detection”/);
  const generic = buildNarrative({ report, signals: measuredSignals(report), offer: OFFER, niche: 'generic' });
  assert.match(generic.plan[2].text, /after each completed service call,/);
});

test('no internal shorthand leaks into the report copy', async () => {
  const report = await mockReport();
  for (const niche of ['tree-services', 'assisted-living', 'plumbing', 'generic']) {
    const { diagnosis, plan } = buildNarrative({ report, signals: measuredSignals(report), offer: OFFER, niche });
    const text = [...diagnosis, ...plan].map((x) => x.text).join(' ');
    assert.ok(!/high-margin projects|emergency calls|completed customer service/.test(text), `${niche}: ${text}`);
  }
});

test('proximity never claims a strong doorstep rank the map contradicts', async () => {
  const report = await mockReport();
  const centre = report.points.find((p) => p.isCenter);
  centre.ranks[0] = 8; // the prospect is weak even at its own address
  const { diagnosis } = buildNarrative({ report, signals: measuredSignals(report), offer: OFFER });
  assert.ok(!/ranks you #\d at your door, holding the top 3/.test(diagnosis[0].text));
  assert.match(diagnosis[0].text, /even at your door you rank #8/);
});

test('"verifies your address" only when a resolver confirmed it', async () => {
  const report = await mockReport();
  report.business.verifiedFields = [];
  const a = buildNarrative({ report, signals: measuredSignals(report), offer: OFFER });
  assert.ok(!/verifies/.test(a.diagnosis[0].text));
  report.business.verifiedFields = ['address'];
  const b = buildNarrative({ report, signals: measuredSignals(report), offer: OFFER });
  assert.match(b.diagnosis[0].text, /^Google verifies your address/);
});

test('the perimeter line only mentions the red zone when there is one', async () => {
  const report = await mockReport();
  for (const p of report.points) if (p.ranks[0] == null || p.ranks[0] > 10) p.ranks[0] = 6;
  const { diagnosis } = buildNarrative({ report, signals: measuredSignals(report), offer: OFFER });
  assert.ok(!/red zone/.test(diagnosis[1].text), diagnosis[1].text);
});

test('the proof line compares with Competitor A, the same business as the review card', async () => {
  const report = await mockReport();
  const a = report.businesses[1];
  const { diagnosis } = buildNarrative({ report, signals: measuredSignals(report), offer: OFFER });
  if (a.reviews > report.businesses[0].reviews) {
    assert.ok(diagnosis[2].text.includes(possessive(a.name)), diagnosis[2].text);
  }
  const cards = buildSignals({ businesses: report.businesses, signals: measuredSignals(report) });
  assert.match(cards.reviews.benchmark, new RegExp(`^${a.reviews} leader$`));
});

test('unmeasured replies are never described as a percentage', async () => {
  const report = await mockReport();
  const { plan } = buildNarrative({ report, signals: report.businesses.map((b) => unmeasured(b.reviews)), offer: OFFER });
  assert.ok(!/Today \d+% of your reviews/.test(plan[1].text));
});

test('metric-card subtext only claims a problem when the prospect is behind', () => {
  const businesses = [{ name: 'Lead', reviews: 900, metrics: {} }, { name: 'A', reviews: 100, metrics: {} }];
  const cards = buildSignals({ businesses, signals: [unmeasured(900), unmeasured(100)] });
  assert.equal(cards.reviews.verdict, 'You lead on review volume');
  const behind = buildSignals({ businesses: [{ ...businesses[0], reviews: 50 }, businesses[1]], signals: [unmeasured(50), unmeasured(100)] });
  assert.equal(behind.reviews.verdict, 'Causes searcher hesitation');
  assert.equal(behind.reviews.prospect, '50');
  assert.equal(behind.reviews.benchmark, '100 leader');
});

test('headline: [Business] captures X% of local searches across a 2-mile area. [Competitor A] captures Y%.', async () => {
  const report = await mockReport();
  const h = buildHeadline(report);
  const [lead, a] = report.businesses;
  const x = Math.round(lead.metrics.top3Share * 100);
  const y = Math.round(a.metrics.top3Share * 100);
  assert.equal(h.text, `${lead.name} captures ${x}% of local searches across a 2-mile area. ${a.name} captures ${y}%.`);
  // The area is the grid's width, which grows with the spacing chosen.
  assert.match(buildHeadline({ ...report, spacingMi: 1 }).text, /across a 4-mile area/);
  assert.match(buildHeadline({ ...report, spacingMi: 2 }).text, /across a 8-mile area/);
  assert.match(h.context, /^Search Term: “assisted living sunnyvale” · Area Tested: 25 Neighborhood Coordinates · Date: \w+ \d{1,2}, \d{4}$/);
});

test('possessives read naturally', () => {
  assert.equal(possessive('Summit Senior Living'), "Summit Senior Living's");
  assert.equal(possessive('Blue Sky Senior Residences'), "Blue Sky Senior Residences'");
});

test('locations are formatted US-style with no resolver notes', () => {
  assert.equal(formatLocation('sunnyvale,  ca'), 'Sunnyvale, CA');
  assert.equal(formatLocation('SAN JOSE, California'), 'San Jose, California');
  assert.ok(!/approximate|centre/.test(formatLocation('Sunnyvale, CA', { address: 'x (approximate — city centre)' })));
});

/* -------------------------------- compliance -------------------------------- */

const SENDER = {
  company: 'Promoflix', name: 'Tom Vinkler', cityState: 'Santa Clara, CA', postalAddress: '',
  email: 'hello@promoflix.ai', phone: '(408) 555-0199', canSpamAddressReady: false,
};

test('the outreach email has an honest subject, the sender, and a working opt-out', () => {
  const e = buildOutreachEmail({
    lead: { name: 'Oak & Ash Tree Co', reviews: 201, lat: 32.78, lng: -96.8 },
    rivals: [{ name: 'Summit Tree Service', reviews: 753, lat: 32.79, lng: -96.81 }],
    location: 'Dallas, TX', ownerName: 'Maria', niche: 'tree-services', sender: SENDER,
  });
  assert.equal(e.subject, 'Oak & Ash Tree Co vs Summit Tree Service on Google');
  assert.match(e.body, /^Hi Maria,/);
  assert.match(e.body, /tree service companies in Dallas/);
  assert.match(e.body, /you have 201 reviews while Summit Tree Service right near you has 753/);
  assert.match(e.body, /Tom Vinkler\nPromoflix/);
  assert.match(e.body, /reply "no" and I won't follow up/, 'CAN-SPAM needs a way to opt out');
});

test('the outreach email warns until a real postal address is configured', () => {
  const args = {
    lead: { name: 'A', reviews: 10 }, rivals: [{ name: 'B', reviews: 90 }],
    location: 'Dallas, TX', niche: 'tree-services',
  };
  const without = buildOutreachEmail({ ...args, sender: SENDER });
  assert.equal(without.warnings.length, 1);
  assert.match(without.warnings[0], /postal address/);
  const withAddr = buildOutreachEmail({ ...args, sender: { ...SENDER, postalAddress: '123 Main St, Santa Clara, CA 95050', canSpamAddressReady: true } });
  assert.equal(withAddr.warnings.length, 0);
  assert.match(withAddr.body, /123 Main St, Santa Clara, CA 95050/, 'the address goes in the signature');
});

test('the outreach email never invents a review gap that is not there', () => {
  const e = buildOutreachEmail({
    lead: { name: 'Big Co', reviews: 900 }, rivals: [{ name: 'Small Co', reviews: 50 }],
    location: 'Dallas, TX', niche: 'generic', sender: SENDER,
  });
  assert.ok(!/you have 900 reviews while/.test(e.body), 'the prospect leads on reviews, so that line would be false');
  assert.match(e.body, /showing up ahead of you/);
  assert.match(e.body, /local service companies in Dallas/);
});

test('"right near you" is only claimed when the rival is actually near', () => {
  const far = buildOutreachEmail({
    lead: { name: 'A', reviews: 10, lat: 32.78, lng: -96.8 },
    rivals: [{ name: 'B', reviews: 90, lat: 33.2, lng: -97.2 }],
    location: 'Dallas, TX', niche: 'tree-services', sender: SENDER,
  });
  assert.ok(!/right near you/.test(far.body));
  assert.match(far.body, /B in Dallas has 90/);
});

test('keyword coverage ignores the place name and flags missing service words', () => {
  const matched = keywordCoverage('assisted living sunnyvale', 'Sunnyvale, CA', {
    name: 'Pacific Coast Assisted Living', category: 'Assisted living facility',
  });
  assert.equal(matched.matched, true);
  const missing = keywordCoverage('memory care sunnyvale', 'Sunnyvale, CA', {
    name: 'Pacific Coast Assisted Living', category: 'Assisted living facility',
  });
  assert.equal(missing.matched, false);
  assert.deepEqual(missing.missing, ['memory', 'care'], 'neither word appears in the name or category');
  assert.ok(!missing.missing.includes('sunnyvale'), 'the city is not a service word');
});

/* ------------------------ one scan, two-step flow -------------------------- */

test('finalizing against a stored scan costs no further lookups', async () => {
  const scan = await scanGrid(BASE);
  const before = JSON.stringify(scan.points);
  const { dominator, peer } = recommendCompetitors(scan.points, scan.lead);
  const report = await finalizeAudit(scan, [dominator, peer]);

  assert.equal(JSON.stringify(scan.points), before, 'the stored scan must not be mutated');
  assert.equal(report.businesses.length, 3);
  assert.equal(report.points.length, 25);
  for (const p of report.points) {
    assert.equal(p.ranks.length, 3, 'all three read out of the same stored results');
  }
  // Swapping a competitor re-reads the same scan rather than rescanning.
  const other = await finalizeAudit(scan, [dominator, { name: 'Somebody Else Entirely' }]);
  assert.equal(other.businesses[2].name, 'Somebody Else Entirely');
  assert.ok(other.points.every((p) => p.ranks[2] === null), 'a business absent from the pack ranks nowhere');
});
