/**
 * A/B test tally (data/abtest.json). For each offer version it keeps the
 * audits made, the audits whose checkout page was opened, and the ones where
 * the start button was clicked. Each is a set of audit ids, so reopening a
 * page never counts twice. Paid sign-ups live in Stripe: every payment
 * carries "<audit id>_<version>" as its client reference.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './settings.js';
import { VARIANTS } from './guarantee.js';

export const EVENTS = ['made', 'viewed', 'clicked'];
const file = () => path.join(DATA_DIR, 'abtest.json');

const empty = () => Object.fromEntries(VARIANTS.map((v) => [v, Object.fromEntries(EVENTS.map((e) => [e, []]))]));

async function load() {
  try {
    const data = JSON.parse(await fs.readFile(file(), 'utf8'));
    const out = empty();
    for (const v of VARIANTS) for (const e of EVENTS) if (Array.isArray(data?.[v]?.[e])) out[v][e] = data[v][e];
    return out;
  } catch {
    return empty();
  }
}

// Writes are chained so two quick events cannot overwrite each other.
let queue = Promise.resolve();

export function recordEvent(slug, variant, event) {
  if (!VARIANTS.includes(variant) || !EVENTS.includes(event) || !slug) return Promise.resolve(false);
  const job = queue.then(async () => {
    const data = await load();
    const list = data[variant][event];
    if (list.includes(slug)) return false;
    list.push(slug);
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(file(), JSON.stringify(data, null, 2));
    return true;
  });
  queue = job.catch(() => {});
  return job;
}

/** Counts and rates per version, for the Settings page. */
export async function abStats() {
  await queue;
  const data = await load();
  const rate = (n, d) => (d ? n / d : null);
  return Object.fromEntries(VARIANTS.map((v) => {
    const made = data[v].made.length;
    const viewed = data[v].viewed.length;
    const clicked = data[v].clicked.length;
    return [v, { made, viewed, clicked, viewRate: rate(viewed, made), clickRate: rate(clicked, viewed) }];
  }));
}
