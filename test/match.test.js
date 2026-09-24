import test from 'node:test';
import assert from 'node:assert/strict';
import { nameSimilarity, findBusinessRank, pickBestCandidate } from '../src/providers/match.js';
import { computeMetrics } from '../src/audit.js';
import { rankColor, rankLabel } from '../src/render.js';
import { rankTextColor } from '../src/draw.js';

test('name similarity tolerates punctuation and suffixes', () => {
  assert.equal(nameSimilarity('Pacific Coast Heating & AC', 'Pacific Coast Heating and AC, Inc.'), 1);
  assert.ok(nameSimilarity('Pacific Coast Heating & AC', 'Pacific Coast Heating') >= 0.9);
  assert.ok(nameSimilarity('Pacific Coast Heating & AC', 'Valley Plumbing') < 0.2);
});

test('findBusinessRank prefers place id, then fuzzy name', () => {
  const results = [
    { position: 1, title: 'Other Co', placeId: 'x' },
    { position: 4, title: 'Pacific Coast Heating', placeId: 'y' },
    { position: 7, title: 'Pacific Coast Heating & AC', placeId: 'z' },
  ];
  assert.equal(findBusinessRank(results, { name: 'Pacific Coast Heating & AC', placeId: 'z' }).rank, 7);
  assert.equal(findBusinessRank(results, { name: 'Pacific Coast Heating & AC' }).rank, 7);
  assert.equal(findBusinessRank(results, { name: 'Nope Plumbing' }).rank, null);
  assert.equal(pickBestCandidate([{ name: 'A Plumbing' }, { name: 'Pacific Coast Heating' }], 'Pacific Coast Heating & AC').name, 'Pacific Coast Heating');
});

test('metrics: average, top-3 share and competitor tally', () => {
  const pts = [
    { rank: 1, results: [{ title: 'Me' }] },
    { rank: 5, results: [{ title: 'Rival' }] },
    { rank: null, results: [{ title: 'Rival' }] },
    { rank: 12, results: [{ title: 'Other' }] },
  ];
  const m = computeMetrics(pts);
  assert.equal(m.averageRank, (1 + 5 + 21 + 12) / 4);
  assert.equal(m.top3Count, 1);
  assert.equal(m.invisibleCount, 2);
  assert.equal(m.topCompetitor.name, 'Rival');
  assert.equal(m.topCompetitor.wins, 2);
});

test('rank colours follow the bands: 1-3 green, 4-10 amber, 11+ red', () => {
  assert.equal(rankColor(1), '#22c55e'); assert.equal(rankColor(3), '#22c55e');
  assert.equal(rankColor(4), '#f59e0b'); assert.equal(rankColor(10), '#f59e0b');
  assert.equal(rankColor(11), '#ef4444'); assert.equal(rankColor(null), '#ef4444');
  assert.equal(rankLabel(null), '20+'); assert.equal(rankLabel(21), '20+'); assert.equal(rankLabel(7), '7');
});

test('amber pins get dark numerals; green and red keep white', () => {
  assert.equal(rankTextColor(5), '#0f172a');
  assert.equal(rankTextColor(10), '#0f172a');
  assert.equal(rankTextColor(2), '#ffffff');
  assert.equal(rankTextColor(15), '#ffffff');
});
