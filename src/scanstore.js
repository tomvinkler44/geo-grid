/**
 * Holds a completed grid scan between step 2 (recommend rivals) and step 3
 * (generate the report), so approving a recommendation does not pay for a
 * second scan. One scan, one charge.
 *
 * Kept on disk as well as in memory so restarting the server mid-flow does
 * not throw away work the user already paid an API bill for.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA_DIR } from './settings.js';

const TTL_MS = 6 * 60 * 60 * 1000; // six hours
const MAX_IN_MEMORY = 20;

const memory = new Map();

function dir() {
  return path.join(DATA_DIR, 'scans');
}

export async function saveScan(scan) {
  const id = randomUUID();
  const record = { id, savedAt: Date.now(), scan };
  memory.set(id, record);
  while (memory.size > MAX_IN_MEMORY) memory.delete(memory.keys().next().value);
  try {
    await fs.mkdir(dir(), { recursive: true });
    await fs.writeFile(path.join(dir(), `${id}.json`), JSON.stringify(record));
  } catch { /* disk copy is best-effort */ }
  return id;
}

export async function loadScan(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) return null;
  const hit = memory.get(id);
  if (hit && Date.now() - hit.savedAt < TTL_MS) return hit.scan;
  try {
    const raw = JSON.parse(await fs.readFile(path.join(dir(), `${id}.json`), 'utf8'));
    if (Date.now() - raw.savedAt >= TTL_MS) return null;
    memory.set(id, raw);
    return raw.scan;
  } catch {
    return null;
  }
}

/** Delete scan files older than the TTL. Called on boot, failures ignored. */
export async function pruneScans() {
  try {
    const files = await fs.readdir(dir());
    await Promise.all(files.map(async (f) => {
      const full = path.join(dir(), f);
      const st = await fs.stat(full).catch(() => null);
      if (st && Date.now() - st.mtimeMs >= TTL_MS) await fs.rm(full, { force: true }).catch(() => {});
    }));
  } catch { /* nothing to prune */ }
}
