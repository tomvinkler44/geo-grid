import 'dotenv/config';

const env = (k, d = '') => (process.env[k] ?? d).toString().trim();

export const config = {
  port: Number(env('PORT', '3000')),
  agencyName: env('AGENCY_NAME', ''),
  agencyUrl: env('AGENCY_URL', ''),
  /** mock | dataforseo | serpapi */
  rankProvider: env('RANK_PROVIDER', 'mock').toLowerCase(),
  /** osm | carto | mapbox | none */
  mapProvider: env('MAP_PROVIDER', 'carto').toLowerCase(),
  mapboxToken: env('MAPBOX_TOKEN'),
  mapboxStyle: env('MAPBOX_STYLE', 'mapbox/light-v11'),
  googlePlacesKey: env('GOOGLE_PLACES_API_KEY'),
  dataforseo: { login: env('DATAFORSEO_LOGIN'), password: env('DATAFORSEO_PASSWORD') },
  serpapiKey: env('SERPAPI_KEY'),
  userAgent: env('HTTP_USER_AGENT', 'geo-grid-report/0.1 (+https://github.com/tomvinkler44/geo-grid)'),
  outputDir: env('OUTPUT_DIR', 'output'),
  /** Concurrency for rank lookups against paid APIs. */
  rankConcurrency: Number(env('RANK_CONCURRENCY', '4')),
};
