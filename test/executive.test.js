import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, unmeasured, WINDOW_DAYS } from '../src/providers/reviews.js';
import { recommendCompetitors, collectCandidates } from '../src/candidates.js';
import { buildSignals, buildNarrative, buildHeadline, buildOutreachEmail, formatLocation, keywordCoverage } from '../src/executive.js';
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
  assert.match(cards.reply.verdict, /reviews endpoint/i);
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

test('the narrative is four numbered findings plus the fix', async () => {
  const report = await mockReport();
  const signals = report.businesses.map((b, i) => summarize(
    [{ time: Date.now() - 5 * 86400000, hasOwnerReply: i > 0 }],
    { totalReviews: b.reviews, source: 'mock', sampleIsComplete: false },
  ));
  const { findings, fix } = buildNarrative({ report, signals, offer: OFFER, niche: 'assisted-living' });
  assert.equal(findings.length, 4);
  findings.forEach((f, i) => {
    assert.equal(f.n, i + 1);
    assert.ok(f.title && f.text.length > 30, `finding ${i + 1} should be substantial`);
  });
  assert.equal(findings[0].title, 'Profile Basics');
  assert.equal(findings[1].title, 'The Distance Drop');
  assert.equal(fix.title, 'The Turnkey Fix');
  assert.match(fix.text, /family tour or intake consultation/, 'the fix uses the niche vocabulary');
  assert.match(fix.text, /\$297\/mo/);
});

test('finding four never claims a reply rate that was not measured', async () => {
  const report = await mockReport();
  const { findings } = buildNarrative({
    report, signals: report.businesses.map((b) => unmeasured(b.reviews)), offer: OFFER, niche: 'tree-services',
  });
  const four = findings[3];
  assert.notEqual(four.title, 'Unanswered Reviews & Inactivity', 'swapped for a finding that was measured');
  assert.ok(!/owner reply/i.test(four.text));
  assert.ok(!/\b0%/.test(four.text));
});

test('profile basics only claims fields a resolver confirmed', async () => {
  const report = await mockReport();
  report.business.verifiedFields = [];
  const { findings } = buildNarrative({ report, signals: report.businesses.map((b) => unmeasured(b.reviews)), offer: OFFER });
  assert.ok(!/verified/i.test(findings[0].text), 'nothing was verified, so nothing is claimed');
  report.business.verifiedFields = ['address', 'phone', 'hours'];
  const again = buildNarrative({ report, signals: report.businesses.map((b) => unmeasured(b.reviews)), offer: OFFER });
  assert.match(again.findings[0].text, /^Address, phone, and hours are properly verified/);
});

test('the headline compares the prospect with the rival holding the most top-3 spots', async () => {
  const report = await mockReport();
  const h = buildHeadline(report);
  const lead = report.businesses[0].metrics.top3Count;
  const best = Math.max(...report.businesses.slice(1).map((b) => b.metrics.top3Count));
  assert.match(h.text, new RegExp(`top 3 for ${lead} of 25 nearby searches`));
  assert.ok(h.text.includes(`is in ${best}.`), h.text);
  assert.match(h.sub, /% your coverage vs\. \d+% market leader/);
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
