import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrid, haversineMi, gridExtentMi } from '../src/geometry.js';
import { lngToX, latToY } from '../src/mercator.js';

test('grid is 5x5, centred on the business, with correct spacing', () => {
  const lat = 37.3382, lng = -121.8863;
  const pts = buildGrid(lat, lng, 0.5);
  assert.equal(pts.length, 25);
  const c = pts[12];
  assert.ok(c.isCenter);
  assert.equal(c.row, 2); assert.equal(c.col, 2);
  assert.ok(Math.abs(c.lat - lat) < 1e-6 && Math.abs(c.lng - lng) < 1e-6);
  // neighbours are 0.5 mi away
  assert.ok(Math.abs(haversineMi(c.lat, c.lng, pts[13].lat, pts[13].lng) - 0.5) < 0.005);
  assert.ok(Math.abs(haversineMi(c.lat, c.lng, pts[7].lat, pts[7].lng) - 0.5) < 0.005);
  // corner is 2 mi across in each axis
  assert.ok(Math.abs(haversineMi(pts[0].lat, pts[0].lng, pts[4].lat, pts[4].lng) - 2) < 0.02);
  assert.equal(pts[0].bearing, 'North-West');
  assert.equal(pts[24].bearing, 'South-East');
  assert.equal(pts[2].bearing, 'North');
  assert.equal(gridExtentMi(1), 4);
});

test('mercator projection is monotonic and consistent', () => {
  assert.ok(lngToX(-121, 10) < lngToX(-120, 10));
  assert.ok(latToY(38, 10) < latToY(37, 10)); // north is up (smaller y)
});
