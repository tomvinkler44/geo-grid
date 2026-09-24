/**
 * Public audit summaries, keyed by slug, so the printed fallback link
 * (promoflix.ai/audit/<slug>) works without query parameters.
 *
 * Only the handful of fields the checkout page shows are stored here. The full
 * report, with competitor data and raw grids, never leaves the admin side.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './settings.js';

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,60}$/;

const dir = () => path.join(DATA_DIR, 'audits');

export async function saveAuditSummary(summary) {
  if (!SLUG_RE.test(summary.slug)) throw new Error(`bad slug ${summary.slug}`);
  await fs.mkdir(dir(), { recursive: true });
  await fs.writeFile(path.join(dir(), `${summary.slug}.json`), JSON.stringify(summary, null, 2));
}

export async function loadAuditSummary(slug) {
  if (!SLUG_RE.test(String(slug || ''))) return null;
  try {
    return JSON.parse(await fs.readFile(path.join(dir(), `${slug}.json`), 'utf8'));
  } catch {
    return null;
  }
}
