#!/usr/bin/env node
/**
 * Standalone CLI. Example:
 *   node src/cli.js --business "Pacific Coast Heating & AC" --location "San Jose, CA" \
 *     --keyword "furnace repair near me" --spacing 0.5 --mock
 */
import { parseArgs } from 'node:util';
import { generateReport } from './report.js';
import { config } from './config.js';

const { values } = parseArgs({
  options: {
    business: { type: 'string', short: 'b' },
    location: { type: 'string', short: 'l' },
    keyword: { type: 'string', short: 'k' },
    spacing: { type: 'string', short: 's', default: '0.5' },
    coordinates: { type: 'string', short: 'c' },
    mock: { type: 'boolean', default: false },
    live: { type: 'boolean', default: false },
    scale: { type: 'string', default: '2' },
    map: { type: 'string' },
    out: { type: 'string', short: 'o' },
    'no-pdf': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help || !values.business || !values.location || !values.keyword) {
  console.log(`Usage: node src/cli.js --business "Name" --location "City, ST" --keyword "service near me" [options]

Options:
  -b, --business      Business name (as it appears on Google)
  -l, --location      "City, ST", zip code, or "lat,lng"
  -k, --keyword       Search keyword, e.g. "furnace repair near me"
  -s, --spacing       Grid spacing in miles: 0.5 | 1 | 2 (default 0.5)
  -c, --coordinates   Override the listing's "lat,lng" (skips GBP resolution)
      --mock          Use the mock ranker (default unless --live)
      --live          Use RANK_PROVIDER from .env (${config.rankProvider})
      --map           Basemap: osm | carto | mapbox | none (default ${config.mapProvider})
      --scale         Output scale, 1 or 2 (default 2 => 2400px wide)
  -o, --out           Output directory (default ${config.outputDir})
      --no-pdf        Skip the PDF
`);
  process.exit(values.help ? 0 : 1);
}

const result = await generateReport(
  {
    business: values.business,
    location: values.location,
    keyword: values.keyword,
    spacingMi: Number(values.spacing),
    coordinates: values.coordinates,
    mock: !values.live,
    onProgress: (m) => console.error(m),
  },
  { scale: Number(values.scale) === 1 ? 1 : 2, mapProvider: values.map, outputDir: values.out, pdf: !values['no-pdf'] },
);

const { report, takeaway, files } = result;
const m = report.metrics;
console.error('');
console.error(`${report.business.name}  ·  "${report.keyword}"  ·  ${report.spacingMi} mi grid  ·  provider: ${report.provider}`);
console.error(`Average rank ${m.averageRank}  ·  Top-3 share ${Math.round(m.top3Share * 100)}%  ·  Invisible at ${m.invisibleCount}/25`);
if (m.topCompetitor) console.error(`Top competitor: ${m.topCompetitor.name} (#1 at ${m.topCompetitor.wins} points)`);
console.error('');
console.error(gridAscii(report.points));
console.error('');
console.error(`PNG:  ${files.png}`);
if (files.pdf) console.error(`PDF:  ${files.pdf}`);
console.error(`TXT:  ${files.txt}`);
console.error('');
console.log(takeaway.email);

function gridAscii(points) {
  const rows = [];
  for (let r = 0; r < 5; r++) {
    rows.push(points.slice(r * 5, r * 5 + 5).map((p) => (p.rank == null || p.rank > 20 ? '20+' : String(p.rank)).padStart(4)).join(''));
  }
  return rows.join('\n');
}
