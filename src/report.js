/** End-to-end: audit -> render -> takeaway -> files on disk. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { runAudit, finalizeAudit } from './audit.js';
import { renderPanels } from './render-panel.js';
import { reviewSignals } from './providers/reviews.js';
import { buildExecutive } from './executive.js';
import { renderReport } from './render.js';
import { renderComparison } from './render-compare.js';
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

  const renderOpts = {
    scale: opts.scale ?? 2,
    agencyName: config.agencyName,
    agencyUrl: config.agencyUrl,
    mapProvider: opts.mapProvider,
  };

  // The comparison sheet is the outreach asset; the detail grid is the
  // deep-dive. Both come from the same scan, so both are free to produce.
  log('Rendering comparison sheet…');
  const comparison = await renderComparison(report, takeaway, renderOpts);
  log('Rendering detail grid…');
  const detail = await renderReport(report, renderOpts);
  report.basemap = comparison.basemap;

  const outDir = path.resolve(opts.outputDir ?? config.outputDir);
  await fs.mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const id = `${slug(report.business.name)}_${slug(report.keyword)}_${stamp}`;

  const files = {
    png: path.join(outDir, `${id}_comparison.png`),
    detailPng: path.join(outDir, `${id}_grid.png`),
    json: path.join(outDir, `${id}.json`),
    txt: path.join(outDir, `${id}.txt`),
  };
  await fs.writeFile(files.png, comparison.png);
  await fs.writeFile(files.detailPng, detail.png);
  await fs.writeFile(files.txt, takeaway.email);
  if (opts.pdf !== false) {
    log('Building PDF…');
    files.pdf = path.join(outDir, `${id}.pdf`);
    await fs.writeFile(files.pdf, await buildPdf({ pages: [comparison, detail], report, takeaway }));
  }
  await fs.writeFile(files.json, JSON.stringify({ id, report, takeaway }, null, 2));

  return {
    id,
    report,
    takeaway,
    files,
    comparison,
    detail,
    png: comparison.png,
    width: comparison.width,
    height: comparison.height,
  };
}


/**
 * The executive deliverable: finalize a scan against the chosen rivals, gather
 * review signals, render the three map panels, and build the one-page view
 * model the browser renders and prints.
 *
 * The grid scan already happened in step 2, so this adds only the review
 * lookups - one call per business, and none at all in mock mode.
 */
export async function generateExecutive(scan, competitors, opts = {}) {
  const log = opts.onProgress || (() => {});
  const report = await finalizeAudit(scan, competitors, {
    competitorSource: opts.competitorSource,
    onProgress: log,
  });

  log('Reading review signals…');
  const signals = await Promise.all(report.businesses.map((b, i) =>
    reviewSignals(b, { mock: scan.mock, isLead: i === 0 })));

  log('Rendering map panels…');
  const rendered = await renderPanels(report, { scale: opts.scale ?? 2, mapProvider: opts.mapProvider });
  report.basemap = rendered.basemap;

  const executive = buildExecutive({ report, signals, offer: config.offer });

  const outDir = path.resolve(opts.outputDir ?? config.outputDir);
  await fs.mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const id = `${slug(report.business.name)}_${slug(report.keyword)}_${stamp}`;

  const files = { panels: [], json: path.join(outDir, `${id}.json`), txt: path.join(outDir, `${id}.txt`) };
  for (const panel of rendered.panels) {
    const file = path.join(outDir, `${id}_panel${panel.index}.png`);
    await fs.writeFile(file, panel.png);
    files.panels.push(file);
  }
  await fs.writeFile(files.txt, executive.email);
  await fs.writeFile(files.json, JSON.stringify({ id, report, executive, signals }, null, 2));

  return { id, report, executive, signals, files, panelSize: { width: rendered.width, height: rendered.height } };
}
