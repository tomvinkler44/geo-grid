import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { generateReport } from '../src/report.js';
import { runAudit, rankRivals, metricsFromRanks } from '../src/audit.js';
import { SCENARIO_A } from '../src/providers/mock.js';

const BASE = {
  business: 'Pacific Coast Assisted Living',
  location: 'Sunnyvale, CA',
  keyword: 'assisted living sunnyvale',
  spacingMi: 0.5,
  mock: true,
  coordinates: '37.3688,-122.0363',
};

test('a mock audit produces a comparison sheet, a detail grid, a PDF and a takeaway', async () => {
  const dir = await fs.mkdtemp('/tmp/geo-grid-test-');
  const r = await generateReport(BASE, { scale: 1, mapProvider: 'none', outputDir: dir });

  assert.equal(r.report.points.length, 25);
  assert.equal(r.report.businesses.length, 3, 'the lead plus two rivals');
  assert.equal(r.report.businesses[0].role, 'lead');
  assert.equal(r.report.competitorSource, 'auto');

  assert.equal(r.comparison.width, 1600, 'comparison sheet is landscape at scale 1');
  assert.ok(r.detail.width === 1200, 'detail grid keeps its own width');
  assert.ok(r.comparison.png.length > 10000 && r.detail.png.length > 10000);

  assert.ok(r.takeaway.email.includes('Subject:'));
  assert.ok(r.takeaway.compare.good && r.takeaway.compare.leak && r.takeaway.compare.context);

  const files = await fs.readdir(dir);
  assert.ok(files.some((f) => f.endsWith('_comparison.png')), 'comparison png written');
  assert.ok(files.some((f) => f.endsWith('_grid.png')), 'detail png written');
  assert.ok(files.some((f) => f.endsWith('.pdf')));
  await fs.rm(dir, { recursive: true, force: true });
});

test('every point carries a rank for all three businesses', async () => {
  const r = await runAudit(BASE);
  for (const p of r.points) {
    assert.equal(p.ranks.length, 3, 'one rank per panel');
    assert.equal(p.rank, p.ranks[0], 'the top-level rank stays the lead, for compatibility');
  }
  // The panels must be readable off the same scan, not separate lookups.
  assert.ok(r.points.every((p) => p.results.length > 3), 'the full local pack is kept per point');
});

test('mock mode lands on the Scenario A shape it is calibrated for', async () => {
  const r = await runAudit(BASE);
  const [lead, a, b] = r.businesses;
  assert.ok(Math.abs(lead.metrics.top3Count - SCENARIO_A.lead) <= 2, `lead had ${lead.metrics.top3Count} green pins`);
  assert.ok(Math.abs(a.metrics.top3Count - SCENARIO_A.rivalA) <= 2, `rival A had ${a.metrics.top3Count} green pins`);
  assert.ok(Math.abs(b.metrics.top3Count - SCENARIO_A.rivalB) <= 2, `rival B had ${b.metrics.top3Count} green pins`);
  assert.ok(a.metrics.top3Count > b.metrics.top3Count, 'rival A should lead rival B');
  assert.ok(lead.metrics.top3Count < b.metrics.top3Count, 'the lead should be behind both rivals');
  assert.ok(lead.metrics.averageRank > a.metrics.averageRank, 'the lead should rank worse on average');
});

test('mock mode ignores typed competitor names rather than labelling invented data', async () => {
  const r = await runAudit({ ...BASE, competitors: ['Sunrise Senior Living', 'The Terraces of Los Altos'] });
  const names = r.businesses.slice(1).map((b) => b.name);
  assert.ok(!names.includes('Sunrise Senior Living'), 'a real name must not be attached to invented numbers');
  assert.equal(r.competitorSource, 'auto');
});

test('the comparison table has real values to show, not blanks', async () => {
  const r = await runAudit(BASE);
  for (const b of r.businesses) {
    assert.ok(b.rating > 0, `${b.name} should have a rating`);
    assert.ok(b.reviews > 0, `${b.name} should have a review count`);
    assert.ok(b.category, `${b.name} should have a category`);
  }
});

test('rivals are ranked by how much of the map they hold, and the lead is excluded', () => {
  const points = [
    { results: [{ title: 'Me', placeId: 'me', position: 1 }, { title: 'Strong', placeId: 's', position: 2 }, { title: 'Weak', placeId: 'w', position: 9 }] },
    { results: [{ title: 'Strong', placeId: 's', position: 1 }, { title: 'Me', placeId: 'me', position: 4 }, { title: 'Weak', placeId: 'w', position: 12 }] },
  ];
  const rivals = rankRivals(points, [{ name: 'Me', placeId: 'me' }]);
  assert.deepEqual(rivals.map((r) => r.name), ['Strong', 'Weak']);
  assert.equal(rivals[0].firsts, 1);
});

test('metrics count an unranked point as 21 and never as zero', () => {
  const m = metricsFromRanks([1, 3, null, 12], null);
  assert.equal(m.averageRank, (1 + 3 + 21 + 12) / 4);
  assert.equal(m.top3Count, 2);
  assert.equal(m.invisibleCount, 2);
  assert.equal(m.firstCount, 1);
});
