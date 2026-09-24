import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, unmeasured, WINDOW_DAYS } from '../src/providers/reviews.js';
import { recommendCompetitors, collectCandidates } from '../src/candidates.js';
import { buildSignals, buildSummary, keywordCoverage } from '../src/executive.js';
import { scanGrid, finalizeAudit } from '../src/audit.js';

const OFFER = { name: 'Review Engine', price: '$297/mo', terms: 'flat, no contract', cta: 'Start' };
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

/* --------------------------- the five sentences ---------------------------- */

test('the five sentences are numbered, titled and non-empty', async () => {
  const scan = await scanGrid(BASE);
  const { dominator, peer } = recommendCompetitors(scan.points, scan.lead);
  const report = await finalizeAudit(scan, [dominator, peer]);
  const signals = report.businesses.map((b, i) => summarize(
    [{ time: Date.now() - 5 * 86400000, hasOwnerReply: i > 0 }],
    { totalReviews: b.reviews, source: 'mock', sampleIsComplete: false },
  ));
  const summary = buildSummary({ report, signals, offer: OFFER });
  assert.equal(summary.length, 5);
  summary.forEach((s, i) => {
    assert.equal(s.n, i + 1);
    assert.ok(s.title && s.text.length > 40, `sentence ${i + 1} should be substantial`);
  });
  assert.match(summary[4].text, /Review Engine/, 'the fix names the configured offer');
});

test('sentence four does not claim a reply rate that was never measured', async () => {
  const scan = await scanGrid(BASE);
  const { dominator, peer } = recommendCompetitors(scan.points, scan.lead);
  const report = await finalizeAudit(scan, [dominator, peer]);
  const summary = buildSummary({
    report,
    signals: report.businesses.map((b) => unmeasured(b.reviews)),
    offer: OFFER,
  });
  const leak = summary[3].text;
  assert.ok(!/owner reply/i.test(leak), 'must not assert replies when none were measured');
  assert.ok(!/\b0%\b/.test(leak), 'must not report a zero it never checked');
  assert.ok(leak.length > 40, 'it should still say something useful');
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
