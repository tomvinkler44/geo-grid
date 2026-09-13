#!/usr/bin/env node
/**
 * Standalone CLI. Example:
 *   node src/cli.js --business "Pacific Coast Assisted Living" --location "Sunnyvale, CA" \
 *     --keyword "assisted living sunnyvale" --spacing 0.5 --mock
 */
import { parseArgs } from 'node:util';
import { generateReport } from './report.js';
import { config } from './config.js';

const { values } = parseArgs({
  options: {
    business: { type: 'string', short: 'b' },
    location: { type: 'string', short: 'l' },
    address: { type: 'string', short: 'a' },
    keyword: { type: 'string', short: 'k' },
    competitor: { type: 'string', multiple: true, default: [] },
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

Produces a three-panel comparison sheet (you vs two rivals) and a detailed
single grid, from one scan of 25 points.

Options:
  -b, --business      Business name, as it appears on Google
  -l, --location      "City, ST", zip code, or "lat,lng"
  -a, --address       Street address; pins the right listing when names collide
  -k, --keyword       Search keyword, e.g. "assisted living sunnyvale"
      --competitor    Rival to compare against. Repeat for a second one.
                      Omit to auto-pick the two strongest rivals found.
  -s, --spacing       Grid spacing in miles: 0.5 | 1 | 2 (default 0.5)
  -c, --coordinates   Override the listing's "lat,lng" (skips resolution)
      --mock          Use the mock ranker (default unless --live)
      --live          Use RANK_PROVIDER from .env (${config.rankProvider})
      --map           Basemap: carto | esri | mapbox | osm | none (default ${config.mapProvider})
      --scale         Output scale, 1 or 2 (default 2)
  -o, --out           Output directory (default ${config.outputDir})
      --no-pdf        Skip the PDF
`);
  process.exit(values.help ? 0 : 1);
}

const result = await generateReport(
  {
    business: values.business,
    location: values.location,
    address: values.address,
    keyword: values.keyword,
    spacingMi: Number(values.spacing),
    competitors: values.competitor,
    coordinates: values.coordinates,
    mock: !values.live,
    onProgress: (m) => console.error(m),
  },
  { scale: Number(values.scale) === 1 ? 1 : 2, mapProvider: values.map, outputDir: values.out, pdf: !values['no-pdf'] },
);

const { report, takeaway, files } = result;
console.error('');
console.error(`${report.business.name}  ·  "${report.keyword}"  ·  ${report.spacingMi} mi grid  ·  provider: ${report.provider}`);
console.error(`Competitors: ${report.competitorSource === 'auto' ? 'auto-selected from the results' : report.competitorSource}`);
console.error('');
for (const b of report.businesses) {
  const m = b.metrics;
  console.error(
    `  ${(b.role === 'lead' ? 'YOU' : 'RIVAL').padEnd(6)} ${b.name.slice(0, 34).padEnd(35)}` +
    ` avg ${m.averageRank.toFixed(1).padStart(4)}   top-3 ${String(m.top3Count).padStart(2)}/25   invisible ${String(m.invisibleCount).padStart(2)}/25`,
  );
}
console.error('');
console.error(gridAscii(report.points));
console.error('');
console.error(`Comparison sheet: ${files.png}`);
console.error(`Detail grid:      ${files.detailPng}`);
if (files.pdf) console.error(`PDF:              ${files.pdf}`);
console.error(`Email text:       ${files.txt}`);
console.error('');
console.log(takeaway.email);

function gridAscii(points) {
  const rows = [];
  for (let r = 0; r < 5; r++) {
    rows.push(points.slice(r * 5, r * 5 + 5)
      .map((p) => (p.rank == null || p.rank > 20 ? '20+' : String(p.rank)).padStart(4)).join(''));
  }
  return `Your rank at each point:\n${rows.join('\n')}`;
}
