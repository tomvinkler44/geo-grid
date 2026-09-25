/** End-to-end: audit -> render -> takeaway -> files on disk. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { runAudit, finalizeAudit } from './audit.js';
import { renderPanels } from './render-panel.js';
import { reviewSignals } from './providers/reviews.js';
import { buildExecutive } from './executive.js';
import { resolvedOffer, resolvedSender, auditLinks } from './offer.js';
import { getNiche } from './niches.js';
import { saveAuditSummary } from './auditstore.js';
import { createHash } from 'node:crypto';
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


/** Short, stable, unguessable-enough id for an audit's public URL. */
export function auditSlug(name, keyword, when = new Date().toISOString()) {
  const hash = createHash('sha1').update(`${name}|${keyword}|${when}`).digest('hex').slice(0, 5);
  return `${slug(name).slice(0, 36)}-${hash}`;
}

/** What the checkout page needs, and nothing else - it is served publicly. */
export function checkoutSummary({ report, executive, niche, slugId }) {
  const lead = report.businesses[0];
  const leader = executive.headline.leader;
  return {
    slug: slugId,
    business: lead.name,
    city: executive.location,
    keyword: report.keyword,
    niche,
    currPins: lead.metrics.top3Count,
    totalPins: report.points.length,
    leader: leader ? leader.name : null,
    leaderPins: leader ? leader.metrics.top3Count : null,
    generatedAt: report.generatedAt,
  };
}

/**
 * The executive deliverable: finalize a scan against the chosen rivals, gather
 * review signals, render the map panels, and build the one-page view model the
 * browser renders and prints. The grid scan already happened in step 2.
 */
export async function generateExecutive(scan, competitors, opts = {}) {
  const log = opts.onProgress || (() => {});
  const niche = getNiche(opts.niche).key;
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

  const slugId = auditSlug(report.business.name, report.keyword, report.generatedAt);
  const offer = resolvedOffer();
  const sender = resolvedSender();

  // Built once without links to learn the leader, then the links go in.
  const draft = buildExecutive({ report, signals, offer, sender, niche, links: { activate: '', short: '' }, ownerName: opts.ownerName });
  const summary = checkoutSummary({ report, executive: draft, niche, slugId });
  // Kept short so it survives email clients and fits on the printed page.
  // Niche, city and totals come from the saved summary behind the slug.
  const links = auditLinks(slugId, {
    biz: summary.business,
    pins: summary.currPins,
    lead: summary.leader,
  });
  const executive = buildExecutive({ report, signals, offer, sender, niche, links, ownerName: opts.ownerName });

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
  await fs.writeFile(files.txt, `${executive.outreachEmail.text}\n\n----------\n\n${executive.reportEmail}`);
  await fs.writeFile(files.json, JSON.stringify({ id, slug: slugId, report, executive, signals }, null, 2));
  await saveAuditSummary(summary);

  return { id, slug: slugId, report, executive, signals, files, summary, panelSize: { width: rendered.width, height: rendered.height } };
}
