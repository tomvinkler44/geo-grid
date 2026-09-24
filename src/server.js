import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { generateReport, generateExecutive } from './report.js';
import { SPACING_OPTIONS, scanGrid, MAX_COMPETITORS } from './audit.js';
import { recommendCompetitors, ARCHETYPES } from './candidates.js';
import { saveScan, loadScan, pruneScans } from './scanstore.js';
import { loadSettings, readSettings, saveSettings, liveReady } from './settings.js';
import { runHealthCheck, testMapProviders } from './healthcheck.js';
import { resolvedOffer, resolvedSender } from './offer.js';
import { publicNiches, detectNiche, getNiche, DEFAULT_NICHE } from './niches.js';
import { buildOutreachEmail } from './executive.js';
import { loadAuditSummary, SLUG_RE } from './auditstore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
await loadSettings();
await pruneScans();

const app = express();
app.disable('x-powered-by');

/**
 * Pages a prospect opens from the audit. They must never hit the admin
 * password prompt, so they are exempt from the gate below. Everything they can
 * read is the short public summary; the full reports stay behind the gate.
 */
const PUBLIC_PATHS = [
  /^\/checkout(\.html|\.js)?$/,
  /^\/audit\/[a-z0-9-]+(\/activate)?\/?$/,
  /^\/api\/audit-summary\/[a-z0-9-]+$/,
  /^\/api\/checkout-config$/,
  /^\/tailwind\.css$/,
  /^\/fonts\/[\w.-]+$/,
];
const isPublic = (p) => PUBLIC_PATHS.some((re) => re.test(p));

// Optional password gate for hosted deployments (APP_PASSWORD in the env).
const appPassword = (process.env.APP_PASSWORD || '').trim();
if (appPassword) {
  app.use((req, res, next) => {
    if (isPublic(req.path)) return next();
    const header = req.headers.authorization || '';
    const [scheme, encoded] = header.split(' ');
    const given = scheme === 'Basic' && encoded ? Buffer.from(encoded, 'base64').toString().split(':').slice(1).join(':') : '';
    if (given === appPassword) return next();
    res.set('WWW-Authenticate', 'Basic realm="Geo-Grid", charset="UTF-8"');
    res.status(401).send('Password required. Any username works.');
  });
}

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const outDir = path.resolve(config.outputDir);
app.use('/reports', express.static(outDir, { index: false, dotfiles: 'deny' }));

app.get('/api/config', (_req, res) => {
  res.json({
    rankProvider: config.rankProvider,
    liveReady: liveReady(),
    mapProvider: config.mapProvider,
    placesReady: !!config.googlePlacesKey,
    agencyName: config.agencyName,
    agencyUrl: config.agencyUrl,
    spacingOptions: SPACING_OPTIONS,
    offer: resolvedOffer(),
    sender: resolvedSender(),
    niches: publicNiches(),
    defaultNiche: DEFAULT_NICHE,
    publicBaseUrl: config.publicBaseUrl,
    stripeReady: Boolean(config.stripeCheckoutUrl),
    maxCompetitors: MAX_COMPETITORS,
  });
});

app.get('/api/settings', (_req, res) => res.json(readSettings()));
app.post('/api/settings', async (req, res) => {
  try {
    res.json(await saveSettings(req.body || {}));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/health-check', async (_req, res) => {
  try {
    res.json(await runHealthCheck());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/map-test', async (_req, res) => {
  try {
    res.json(await testMapProviders());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Step 2 - scan the grid once and recommend two rivals.
 * The scan is stored so approving them in step 3 does not pay for a second one.
 */
app.post('/api/candidates', async (req, res) => {
  const { business, location, address, keyword, spacingMi, mock, coordinates, niche, ownerName } = req.body || {};
  const started = Date.now();
  try {
    const useMock = mock !== false || !liveReady();
    const scan = await scanGrid({
      business, location, address, keyword,
      spacingMi: Number(spacingMi ?? 0.5),
      mock: useMock, coordinates,
      onProgress: (m) => console.log(`[scan] ${m}`),
    });
    const { dominator, peer, candidates, reasons, weakPeer } = recommendCompetitors(scan.points, scan.lead);
    const scanId = await saveScan(scan);

    const toCard = (c, archetype) => (c ? {
      name: c.name,
      placeId: c.placeId,
      cid: c.cid,
      rating: c.rating ?? null,
      reviews: c.reviews ?? null,
      distanceMi: c.distanceMi == null ? null : +c.distanceMi.toFixed(2),
      top3Share: c.top3Share,
      archetype: ARCHETYPES[archetype].label,
      archetypeKey: archetype,
      blurb: ARCHETYPES[archetype].blurb,
      reason: reasons[archetype],
      warning: archetype === 'peer' ? (reasons.peerWarning || '') : '',
    } : null);

    res.json({
      scanId,
      elapsedMs: Date.now() - started,
      mock: scan.mock,
      provider: scan.provider,
      business: {
        name: scan.lead.name,
        address: scan.lead.address || '',
        rating: scan.lead.rating ?? null,
        reviews: scan.lead.reviews ?? null,
        category: scan.lead.category || '',
        approximate: !!scan.lead.approximate,
      },
      keyword: scan.keyword,
      spacingMi: scan.spacingMi,
      recommendations: [toCard(dominator, 'dominator'), toCard(peer, 'peer')].filter(Boolean),
      niche: getNiche(niche).key,
      suggestedNiche: detectNiche(scan.keyword),
      // The first-touch email only needs the scan, so it is ready before any
      // report is generated: ask permission first, send the audit second.
      outreachEmail: buildOutreachEmail({
        lead: scan.lead,
        rivals: [dominator, peer].filter(Boolean),
        location: scan.location,
        ownerName,
        niche: getNiche(niche).key,
        sender: resolvedSender(),
      }),
      candidateCount: candidates.length,
      weakPeer: !!weakPeer,
      alternatives: candidates
        .slice()
        .sort((a, b) => b.top3Share - a.top3Share)
        .slice(0, 12)
        .map((c) => ({ name: c.name, placeId: c.placeId, reviews: c.reviews ?? null, rating: c.rating ?? null, top3Share: c.top3Share })),
    });
  } catch (err) {
    console.error('[candidates] failed:', err);
    res.status(400).json({ error: err.message });
  }
});

/** Step 3 - approve the rivals and build the executive deliverable. */
app.post('/api/generate', async (req, res) => {
  const { scanId, competitors, scale, niche, ownerName } = req.body || {};
  const started = Date.now();
  try {
    const scan = await loadScan(scanId);
    if (!scan) {
      res.status(410).json({ error: 'That scan has expired. Run the competitor scan again.' });
      return;
    }
    const chosen = (Array.isArray(competitors) ? competitors : [])
      .filter((c) => c && String(c.name || '').trim())
      .slice(0, MAX_COMPETITORS)
      .map((c) => ({
        name: String(c.name).trim(),
        placeId: c.placeId || null,
        cid: c.cid || null,
        archetype: c.archetype || null,
        autoSelected: !!c.autoSelected,
      }));

    const result = await generateExecutive(scan, chosen, {
      niche,
      ownerName,
      scale: scale === 1 ? 1 : 2,
      competitorSource: chosen.every((c) => c.autoSelected) ? 'auto' : chosen.some((c) => c.autoSelected) ? 'mixed' : 'manual',
      onProgress: (m) => console.log(`[generate] ${m}`),
    });

    res.json({
      id: result.id,
      slug: result.slug,
      elapsedMs: Date.now() - started,
      panelUrls: result.files.panels.map((f) => `/reports/${path.basename(f)}`),
      jsonUrl: `/reports/${path.basename(result.files.json)}`,
      panelSize: result.panelSize,
      report: result.report,
      executive: result.executive,
      signals: result.signals,
      agency: { name: config.agencyName, url: config.agencyUrl },
    });
  } catch (err) {
    console.error('[generate] failed:', err);
    res.status(400).json({ error: err.message });
  }
});

/* ---------------------------- public checkout ---------------------------- */

const checkoutPage = path.join(__dirname, '..', 'public', 'checkout.html');
app.get('/checkout', (_req, res) => res.sendFile(checkoutPage));
app.get('/audit/:slug/activate', (req, res) => {
  if (!SLUG_RE.test(req.params.slug)) return res.status(404).send('Not found');
  res.sendFile(checkoutPage);
});
// The short link printed on the audit.
app.get('/audit/:slug', (req, res) => {
  if (!SLUG_RE.test(req.params.slug)) return res.status(404).send('Not found');
  res.redirect(302, `/audit/${req.params.slug}/activate`);
});

app.get('/api/audit-summary/:slug', async (req, res) => {
  const summary = await loadAuditSummary(req.params.slug);
  if (!summary) return res.status(404).json({ error: 'not found' });
  res.set('Cache-Control', 'no-store').json(summary);
});

app.get('/api/checkout-config', (_req, res) => {
  const sender = resolvedSender();
  res.json({
    offer: resolvedOffer(),
    // The prospect sees the brand, not the admin's CAN-SPAM readiness flags.
    sender: { company: sender.company, name: sender.name, cityState: sender.cityState, postalAddress: sender.postalAddress, email: sender.email, phone: sender.phone },
    niches: publicNiches(),
    defaultNiche: DEFAULT_NICHE,
    stripeCheckoutUrl: config.stripeCheckoutUrl || '',
  });
});

app.post('/api/audit', async (req, res) => {
  const { business, location, address, keyword, spacingMi, mock, coordinates, scale, competitor1, competitor2 } = req.body || {};
  const started = Date.now();
  try {
    const useMock = mock !== false || !liveReady();
    const result = await generateReport(
      {
        business,
        location,
        address,
        keyword,
        spacingMi: Number(spacingMi ?? 0.5),
        competitors: [competitor1, competitor2],
        mock: useMock,
        coordinates,
        onProgress: (m) => console.log(`[audit] ${m}`),
      },
      { scale: scale === 1 ? 1 : 2 },
    );
    const { id, report, takeaway, files } = result;
    res.json({
      id,
      elapsedMs: Date.now() - started,
      imageUrl: `/reports/${path.basename(files.png)}`,
      detailImageUrl: `/reports/${path.basename(files.detailPng)}`,
      pdfUrl: files.pdf ? `/reports/${path.basename(files.pdf)}` : null,
      jsonUrl: `/reports/${path.basename(files.json)}`,
      report,
      takeaway,
    });
  } catch (err) {
    console.error('[audit] failed:', err);
    res.status(400).json({ error: err.message });
  }
});

const host = process.env.HOST || '0.0.0.0';
app.listen(config.port, host, () => {
  console.log(`geo-grid running at http://localhost:${config.port}`);
  console.log(`  rank provider: ${config.rankProvider}   map: ${config.mapProvider}   output: ${outDir}${appPassword ? '   password: on' : ''}`);
});
