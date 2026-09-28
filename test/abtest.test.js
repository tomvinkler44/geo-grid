import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// The tally file lives in DATA_DIR, read when settings.js loads, so point it
// at a scratch folder before anything imports it.
const TMP = await fs.mkdtemp(path.join(os.tmpdir(), 'abtest-'));
process.env.DATA_DIR = TMP;

const { mapGoal, goalPhrase, pickVariant } = await import('../src/guarantee.js');
const { recordEvent, abStats } = await import('../src/abtest.js');
const { pickCheckSpot, spotSentence } = await import('../src/spot.js');
const { buildOutreachEmail, buildReportEmail } = await import('../src/executive.js');
const { resolvedOffer } = await import('../src/offer.js');
const { auditLinks } = await import('../src/offer.js');

const ranks = (green, amber, red) => [
  ...Array(green).fill(2), ...Array(amber).fill(7), ...Array(red).fill(null),
];

test('Day 90 target: a third of the red pins, between 2 and 5', () => {
  assert.deepEqual(mapGoal(ranks(4, 7, 14)), { metric: 'top10', count: 5, today: 11, points: 25 });
  assert.equal(mapGoal(ranks(4, 12, 9)).count, 3);
  assert.equal(mapGoal(ranks(10, 9, 6)).count, 2, 'never below 2');
  assert.equal(mapGoal(ranks(0, 0, 25)).count, 5, 'never above 5');
});

test('Day 90 target moves to the top 3 when there is little red left', () => {
  const g = mapGoal(ranks(8, 13, 4));
  assert.deepEqual(g, { metric: 'top3', count: 4, today: 8, points: 25 });
  assert.equal(goalPhrase(g), 'in Google’s top 3 in at least 4 more neighborhoods');
  const full = mapGoal(ranks(22, 2, 1));
  assert.equal(full.metric, null);
  assert.equal(goalPhrase(full), 'in more neighborhoods than your Day 1 map');
});

test('the A/B split is stable per audit, about 50/50, and can be pinned', () => {
  assert.equal(pickVariant('oak-ash-1a2b3'), pickVariant('oak-ash-1a2b3'), 'same audit, same version');
  let b = 0;
  for (let i = 0; i < 1000; i++) if (pickVariant(`audit-${i}`) === 'b') b++;
  assert.ok(b > 430 && b < 570, `split was ${b}/1000`);
  assert.equal(pickVariant('x', 'a'), 'a', 'settings can show one version only');
  assert.equal(pickVariant('x', 'ab', 'b'), 'b', 'the composer can pin a version');
});

test('the tally counts each audit once per step', async () => {
  await recordEvent('oak-ash-1a2b3', 'b', 'made');
  await recordEvent('oak-ash-1a2b3', 'b', 'viewed');
  await recordEvent('oak-ash-1a2b3', 'b', 'viewed');
  await recordEvent('pine-9f8e7', 'a', 'made');
  assert.equal(await recordEvent('pine-9f8e7', 'c', 'made'), false, 'unknown versions are ignored');
  const s = await abStats();
  assert.deepEqual(s.b, { made: 1, viewed: 1, clicked: 0, viewRate: 1, clickRate: 0 });
  assert.equal(s.a.made, 1);
  assert.equal(s.a.viewRate, 0);
});

test('audit links carry the version and the Day 90 target', () => {
  const u = new URL(auditLinks('oak-ash-1a2b3', { biz: 'Oak', v: 'b', g: 4, m: 10, t: 11 }).activate);
  assert.equal(u.searchParams.get('v'), 'b');
  assert.equal(u.searchParams.get('g'), '4');
});

/* ------------------------ the check-it-yourself spot ------------------------ */

const pt = (distanceMi, bearing, rank, extra = {}) => ({
  distanceMi, bearing, lat: 32.8, lng: -96.8, isCenter: false, rank,
  results: [{ title: 'Summit Tree' }, { title: 'ABC Tree' }, { title: 'Oak & Sons' }], ...extra,
});

test('the spot is the nearest place they are out of the top 10', () => {
  const points = [
    pt(0, 'Center', 1, { isCenter: true }),
    pt(0.5, 'North', 5),
    pt(1, 'East', null),
    pt(2, 'South', 14),
  ];
  const s = pickCheckSpot(points, (p) => p.rank);
  assert.equal(s.bearing, 'East');
  assert.deepEqual(s.top3, ['Summit Tree', 'ABC Tree', 'Oak & Sons']);
  const weakOnly = pickCheckSpot([pt(1, 'North', 6), pt(2, 'South', 2)], (p) => p.rank);
  assert.equal(weakOnly.rank, 6, 'falls back to a place just outside the top 3');
  assert.equal(pickCheckSpot([pt(1, 'North', 2)], (p) => p.rank), null, 'nothing to show when they win everywhere');
});

test('the spot sentence names the place, the top 3 and how to check', () => {
  const spot = { distanceMi: 2, bearing: 'North-East', rank: null, top3: ['Summit Tree', 'ABC Tree', 'Oak & Sons'], place: { name: 'Lake Highlands', city: 'Dallas' } };
  assert.equal(spotSentence(spot, 'tree removal', 'Dallas'),
    'When someone around Lake Highlands, about 2 miles northeast of you, searches “tree removal”, Google’s top 3 are Summit Tree, ABC Tree and Oak & Sons. You don’t show up in the top 20 there. You can check it on your phone next time you’re over that way.');
  const plain = spotSentence({ ...spot, place: null, rank: 6, distanceMi: 0.5, bearing: 'South' }, 'tree removal', 'Dallas');
  assert.match(plain, /^When someone half a mile south of you searches/);
  assert.match(plain, /You’re #6 there, below the three most people call\./);
  const sameCity = spotSentence({ ...spot, place: { name: '', city: 'Dallas' } }, 'tree removal', 'Dallas');
  assert.ok(!/around Dallas/.test(sameCity), 'naming their own city adds nothing');
});

/* ---------------------------------- emails ---------------------------------- */

const SENDER = {
  company: 'Promoflix', name: 'Tom Vinkler', cityState: 'Santa Clara, CA', postalAddress: '',
  email: 'hello@promoflix.ai', phone: '(408) 462-5198', canSpamAddressReady: false,
};

test('the first email says who is writing, gives a checkable fact, and never pitches', () => {
  const e = buildOutreachEmail({
    lead: { name: 'Oak & Ash Tree Co', reviews: 20 }, rivals: [{ name: 'Summit Tree', reviews: 300 }],
    location: 'Dallas, TX', niche: 'tree-services', sender: SENDER, keyword: 'tree removal',
    spot: { distanceMi: 1, bearing: 'North', rank: null, top3: ['Summit Tree', 'ABC Tree', 'Oak & Sons'], place: null },
  });
  assert.match(e.body, /I'm Tom Vinkler, based in Santa Clara\. I help a few local tree service companies/);
  assert.match(e.body, /about 1 mile north of you searches “tree removal”/);
  assert.ok(!/\$|free|guarantee|30 days/i.test(e.body.replace('No charge', '')), 'no price or offer in the first touch');
  const generic = buildOutreachEmail({ lead: { name: 'A' }, rivals: [], location: 'Dallas, TX', niche: 'generic', sender: SENDER });
  assert.ok(!/local local/.test(generic.body));
});

test('the report email carries this audit’s version and the ownership promise', () => {
  const report = { businesses: [{ name: 'Oak & Ash Tree Co' }] };
  const args = {
    report, narrative: { diagnosis: [], plan: [] }, headline: { text: 'Headline.' },
    sender: SENDER, links: { activate: 'https://promoflix.ai/audit/x/activate' }, ownerName: 'Maria',
  };
  const a = buildReportEmail({ ...args, offer: resolvedOffer('a') });
  assert.match(a, /First 30 days free\. Try everything for 30 days/);
  const b = buildReportEmail({ ...args, offer: resolvedOffer('b', { metric: 'top10', count: 3, today: 12 }) });
  assert.match(b, /We work free until you get results\. If your Day 90 map doesn’t show you in Google’s top 10 in at least 3 more neighborhoods/);
  assert.match(b, /You stay the owner of your Google profile/);
});
