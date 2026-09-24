import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvedOffer, resolvedSender, auditLinks } from '../src/offer.js';
import { getNiche, detectNiche, NICHES, DEFAULT_NICHE } from '../src/niches.js';
import { recommendCompetitors } from '../src/candidates.js';
import { scanGrid } from '../src/audit.js';
import { findBusinessRank } from '../src/providers/match.js';
import { band } from '../src/ranks.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('one offer definition: the button and micro-copy carry the price', () => {
  const o = resolvedOffer();
  assert.equal(o.name, 'Local Review Engine & Geo-Expansion');
  assert.equal(o.cta, 'Start 60-Day Review Engine — $297/mo');
  assert.equal(o.microcopy, '$297/mo flat · No contracts · 60-day guarantee · 15-min setup');
  assert.match(o.guarantee, /^60-Day Momentum Guarantee: More reviews and more green pins/);
  const changed = resolvedOffer({ ...o, price: '$349/mo', cta: 'Start 60-Day Review Engine — {price}', microcopy: '{price} flat' });
  assert.equal(changed.cta, 'Start 60-Day Review Engine — $349/mo', 'a price change reaches the button');
});

test('retired names do not appear anywhere customer-facing', async () => {
  const files = ['public/index.html', 'public/app.js', 'public/checkout.html', 'public/checkout.js',
    'src/executive.js', 'src/config.js', 'src/offer.js'];
  for (const f of files) {
    const text = await fs.readFile(path.join(ROOT, f), 'utf8');
    assert.ok(!/Geo-Sprint/i.test(text), `${f} still says Geo-Sprint`);
    assert.ok(!/Automated Review Engine/.test(text), `${f} still uses the old service name`);
    assert.ok(!/city centre|\(approximate —/.test(text), `${f} still has the approximate/centre header`);
  }
});

test('the sender flags a fictional phone number and a missing postal address', () => {
  const s = resolvedSender({ company: 'Promoflix', name: 'Tom', cityState: 'Santa Clara, CA', postalAddress: '', email: 'a@b.c', phone: '(408) 555-0199' });
  assert.equal(s.phoneIsFictional, true);
  assert.equal(s.canSpamAddressReady, false);
  const ok = resolvedSender({ company: 'P', name: 'T', cityState: 'Santa Clara, CA', postalAddress: '2200 Mission College Blvd, Santa Clara, CA 95054', email: 'a@b.c', phone: '(408) 555-8123' });
  assert.equal(ok.phoneIsFictional, false);
  assert.equal(ok.canSpamAddressReady, true);
});

test('audit links point at the public site with the audit data attached', () => {
  const l = auditLinks('pacific-coast-4f2a1', { business: 'Pacific Coast', currPins: 4, leader: 'Summit', niche: 'assisted-living', empty: '' });
  const u = new URL(l.activate);
  assert.equal(u.pathname, '/audit/pacific-coast-4f2a1/activate');
  assert.equal(u.searchParams.get('business'), 'Pacific Coast');
  assert.equal(u.searchParams.get('currPins'), '4');
  assert.equal(u.searchParams.get('leader'), 'Summit');
  assert.ok(!u.searchParams.has('empty'), 'blank values are left out');
  assert.equal(l.short, 'promoflix.ai/audit/pacific-coast-4f2a1');
  assert.ok(!/localhost/.test(l.activate));
});

test('niches: tree services is the default and unknown keys fall back to it', () => {
  assert.equal(DEFAULT_NICHE, 'tree-services');
  assert.equal(getNiche('nonsense').key, 'tree-services');
  assert.equal(getNiche('assisted-living').transactionEvent, 'family tour or intake consultation');
  assert.equal(getNiche('tree-services').highTicket, 'crane takedowns, power lines, emergency removals');
  assert.equal(detectNiche('assisted living sunnyvale'), 'assisted-living');
  assert.equal(detectNiche('tree removal dallas'), 'tree-services');
  assert.equal(detectNiche('plumber near me'), null);
  for (const n of Object.values(NICHES)) {
    for (const f of ['highTicket', 'transactionEvent', 'software', 'marketNoun']) assert.ok(n[f], `${n.key}.${f}`);
  }
});

test('rank bands: 1-3 visible, 4-10 weak, 11+ invisible', () => {
  assert.deepEqual([1, 3, 4, 10, 11, 20, null].map(band),
    ['visible', 'visible', 'weak', 'weak', 'invisible', 'invisible', 'invisible']);
});

test('Competitor B always out-ranks the prospect, or is left out entirely', async () => {
  for (const kw of ['assisted living sunnyvale', 'tree service dallas', 'plumbing', 'roof repair', 'dentist']) {
    const scan = await scanGrid({ business: 'Test Business', location: 'Sunnyvale, CA', keyword: kw, spacingMi: 0.5, mock: true, coordinates: '37.3688,-122.0363' });
    const lead = scan.points.filter((p) => { const r = findBusinessRank(p.results, scan.lead).rank; return r != null && r <= 3; }).length / 25;
    const { peer, weakPeer } = recommendCompetitors(scan.points, scan.lead);
    if (peer) assert.ok(peer.top3Share > lead, `${kw}: peer ${peer.top3Share} must beat lead ${lead}`);
    else assert.equal(weakPeer, true);
  }
});
