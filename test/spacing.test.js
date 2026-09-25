import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendSpacing, classifyMarket, coveragePhrase, radiusMi, widthMi } from '../src/spacing.js';
import { SPACING_OPTIONS, scanGrid } from '../src/audit.js';
import { recommendCompetitors } from '../src/candidates.js';
import { finalizeAudit } from '../src/audit.js';
import { buildNarrative, legendText } from '../src/executive.js';

test('radius is spacing x 2 and width is spacing x 4', () => {
  assert.deepEqual([0.5, 1, 1.5, 2].map(radiusMi), [1, 2, 3, 4]);
  assert.deepEqual([0.5, 1, 1.5, 2].map(widthMi), [2, 4, 6, 8]);
});

test('coverage wording for every spacing on offer', () => {
  assert.equal(coveragePhrase(0.5, 'Santa Clara'), 'within 1 mile of your location');
  assert.equal(coveragePhrase(1, 'Santa Clara'), 'across a 4-mile territory in Santa Clara');
  assert.equal(coveragePhrase(1.5, 'Santa Clara'), 'across a 6-mile territory in Santa Clara');
  assert.equal(coveragePhrase(2, 'Santa Clara'), 'across an 8-mile territory in Santa Clara');
  assert.deepEqual(SPACING_OPTIONS, [0.5, 1, 1.5, 2], 'the composer offers 1.5 mi for sprawling facility markets');
});

test('recommendation table: density x business model', () => {
  const r = (location, niche, population = null) => recommendSpacing({ location, niche, population });
  assert.equal(r('San Francisco, CA', 'plumbing').spacingMi, 0.5);
  assert.equal(r('New York, NY', 'assisted-living').spacingMi, 0.5);
  assert.equal(r('Santa Clara, CA', 'tree-services').spacingMi, 1, 'suburban contractor');
  assert.equal(r('Santa Clara, CA', 'plumbing').spacingMi, 1);
  assert.equal(r('Sunnyvale, CA', 'assisted-living').spacingMi, 0.5, 'suburban facility');
  assert.equal(r('Houston, TX', 'plumbing').spacingMi, 2, 'sprawling contractor');
  assert.equal(r('Phoenix, AZ', 'assisted-living').spacingMi, 1.5, 'sprawling facility');
  assert.equal(r('Marfa, TX', 'tree-services', 1800).spacingMi, 2, 'rural by population');
});

test('the badge names the city, the market and the footprint', () => {
  const r = recommendSpacing({ location: 'santa clara, ca', niche: 'tree-services' });
  assert.equal(r.badge, 'Recommended: 1.0 mi spacing based on Santa Clara suburban contractor footprint');
  assert.equal(r.reason, 'Suburban service area; standard 4-mile customer dispatch territory.');
  assert.match(r.note, /assumed/, 'says when density is a guess');
  const sf = recommendSpacing({ location: 'San Francisco, CA', niche: 'plumbing' });
  assert.equal(sf.badge, 'Recommended: 0.5 mi spacing based on San Francisco urban-core contractor footprint');
  assert.equal(sf.reason, 'High-density urban market; proximity drop-off happens within blocks.');
  assert.equal(sf.note, '');
  const houston = recommendSpacing({ location: 'Houston, TX', niche: 'plumbing' });
  assert.equal(houston.reason, 'Sprawling commercial territory; covers extended driving & service zones.');
  const rural = recommendSpacing({ location: 'Marfa, TX', niche: 'plumbing', population: 1800 });
  assert.equal(rural.reason, 'Low-density territory; search catchment spans multiple zip codes.');
});

test('state matters for ambiguous city names', () => {
  assert.equal(classifyMarket('Arlington, TX').density, 'sprawl');
  assert.equal(classifyMarket('Arlington, VA').density, 'standard');
  assert.equal(classifyMarket('Glendale, AZ').density, 'sprawl');
  assert.equal(classifyMarket('Glendale, CA').density, 'standard');
});

test('perimeter line and legend scale with the spacing and never contradict the map', async () => {
  for (const spacingMi of [0.5, 1, 1.5, 2]) {
    const scan = await scanGrid({ business: 'Oak & Ash Tree Co', location: 'Santa Clara, CA', keyword: 'tree service', spacingMi, mock: true, coordinates: '37.3541,-121.9552' });
    const rec = recommendCompetitors(scan.points, scan.lead);
    const report = await finalizeAudit(scan, [rec.dominator, rec.peer].filter(Boolean));
    const { diagnosis } = buildNarrative({ report, signals: [{}, {}, {}], offer: { price: '$297/mo' }, niche: 'tree-services' });
    const R = radiusMi(spacingMi);
    const text = diagnosis[1].text;
    assert.ok(text.includes(`${R}-mile radius`), `${spacingMi}: ${text}`);
    const m = text.match(/^Beyond ([\d.]+) miles?/);
    if (m) assert.ok(Number(m[1]) < R, 'a "beyond" distance must lie inside the grid');
    assert.match(legendText(spacingMi), new RegExp(`\\|\\s+${spacingMi} mi grid spacing$`));
  }
});
