import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { generateReport } from './report.js';
import { SPACING_OPTIONS } from './audit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const outDir = path.resolve(config.outputDir);
app.use('/reports', express.static(outDir, { index: false, dotfiles: 'deny' }));

app.get('/api/config', (_req, res) => {
  const hasLiveProvider =
    (config.rankProvider === 'dataforseo' && !!config.dataforseo.login) ||
    (config.rankProvider === 'serpapi' && !!config.serpapiKey);
  res.json({
    rankProvider: config.rankProvider,
    liveReady: hasLiveProvider,
    mapProvider: config.mapProvider,
    placesReady: !!config.googlePlacesKey,
    agencyName: config.agencyName,
    spacingOptions: SPACING_OPTIONS,
  });
});

app.post('/api/audit', async (req, res) => {
  const { business, location, keyword, spacingMi, mock, coordinates, scale } = req.body || {};
  const started = Date.now();
  try {
    const result = await generateReport(
      { business, location, keyword, spacingMi: Number(spacingMi ?? 0.5), mock: mock !== false, coordinates, onProgress: (m) => console.log(`[audit] ${m}`) },
      { scale: scale === 1 ? 1 : 2 },
    );
    const { id, report, takeaway, files } = result;
    res.json({
      id,
      elapsedMs: Date.now() - started,
      imageUrl: `/reports/${path.basename(files.png)}`,
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

app.listen(config.port, () => {
  console.log(`geo-grid running at http://localhost:${config.port}`);
  console.log(`  rank provider: ${config.rankProvider}   map: ${config.mapProvider}   output: ${outDir}`);
});
