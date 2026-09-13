import { config } from '../config.js';

/** Small fetch wrapper with timeout, JSON parsing and useful errors. */
export async function fetchJson(url, { method = 'GET', headers = {}, body, timeoutMs = 30000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: { 'User-Agent': config.userAgent, Accept: 'application/json', ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = null; }
    if (!res.ok) {
      const detail = json?.error?.message || json?.status_message || json?.error || text.slice(0, 300);
      throw new Error(`HTTP ${res.status} from ${new URL(url).host}: ${detail}`);
    }
    if (json === null) throw new Error(`Non-JSON response from ${new URL(url).host}`);
    return json;
  } finally {
    clearTimeout(t);
  }
}

/** Run async tasks with bounded concurrency, preserving order. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}
