import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { generateReport } from './report.js';
import { SPACING_OPTIONS } from './audit.js';
import { loadSettings, readSettings, saveSettings, liveReady } from './settings.js';
import { runHealthCheck, testMapProviders } from './healthcheck.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
await loadSettings();

const app = express();
app.disable('x-powered-by');

// Optional password gate for hosted deployments (APP_PASSWORD in the env).
const appPassword = (process.env.APP_PASSWORD || '').trim();
if (appPassword) {
  app.use((req, res, next) => {
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
    spacingOptions: SPACING_OPTIONS,
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
