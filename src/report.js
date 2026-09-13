/** End-to-end: audit -> render -> takeaway -> files on disk. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { runAudit } from './audit.js';
import { renderReport } from './render.js';
import { generateTakeaway } from './takeaway.js';
import { buildPdf } from './pdf.js';
import { config } from './config.js';

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'report';
}

export async function generateReport(input, opts = {}) {
  const log = input.onProgress || (() => {});
  const report = await runAudit(input);
  const takeaway = generateTakeaway(report);

  log('Rendering report card…');
  const { png, width, height, basemap } = await renderReport(report, {
    scale: opts.scale ?? 2,
    agencyName: config.agencyName,
    agencyUrl: config.agencyUrl,
    mapProvider: opts.mapProvider,
  });
  report.basemap = basemap;

  const outDir = path.resolve(opts.outputDir ?? config.outputDir);
  await fs.mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const id = `${slug(report.business.name)}_${slug(report.keyword)}_${stamp}`;
  const files = { png: path.join(outDir, `${id}.png`), json: path.join(outDir, `${id}.json`), txt: path.join(outDir, `${id}.txt`) };
  await fs.writeFile(files.png, png);
  await fs.writeFile(files.txt, takeaway.email);
  if (opts.pdf !== false) {
    log('Building PDF…');
    files.pdf = path.join(outDir, `${id}.pdf`);
    await fs.writeFile(files.pdf, await buildPdf({ png, width, height, report, takeaway }));
  }
  await fs.writeFile(files.json, JSON.stringify({ id, report, takeaway }, null, 2));
  return { id, report, takeaway, files, png, width, height };
}
