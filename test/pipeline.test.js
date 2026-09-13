import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { generateReport } from '../src/report.js';

test('mock audit renders a PNG, PDF and takeaway offline', async () => {
  const dir = await fs.mkdtemp('/tmp/geo-grid-test-');
  const r = await generateReport(
    { business: 'Test Heating & AC', location: 'San Jose, CA', keyword: 'furnace repair near me', spacingMi: 0.5, mock: true, coordinates: '37.3382,-121.8863' },
    { scale: 1, mapProvider: 'none', outputDir: dir },
  );
  assert.equal(r.report.points.length, 25);
  assert.ok(r.report.points[12].rank <= 3, 'centre should be green in mock mode');
  assert.equal(r.width, 1200);
  assert.ok(r.png.length > 10000);
  assert.ok(r.takeaway.email.includes('Subject:'));
  assert.ok(r.takeaway.good && r.takeaway.leak && r.takeaway.context);
  const files = await fs.readdir(dir);
  assert.ok(files.some((f) => f.endsWith('.png')) && files.some((f) => f.endsWith('.pdf')));
  await fs.rm(dir, { recursive: true, force: true });
});
