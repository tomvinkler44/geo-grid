/**
 * Review signals: recent review velocity and owner reply rate.
 *
 * These do NOT come from the local-pack SERP call. The SERP returns a total
 * review count and nothing else, so velocity and reply rate need a separate
 * reviews endpoint - one extra call per business, three per report.
 *
 * Every adapter returns null rather than guessing. A signal we could not
 * measure is reported as unmeasured and rendered as "not measured", because
 * telling a prospect they never reply to reviews when we simply did not look
 * is worse than leaving the card empty.
 */
import { config } from '../config.js';
import { fetchJson } from './http.js';

export const WINDOW_DAYS = 30;
/** How many of the newest reviews to inspect when the provider allows a depth. */
export const SAMPLE_DEPTH = 20;

const DAY_MS = 86400000;

/** Shape returned for a business whose reviews we could not look at. */
export function unmeasured(totalReviews = null, reason = '') {
  return {
    measured: false,
    source: null,
    totalReviews: totalReviews ?? null,
    sampleSize: 0,
    windowDays: WINDOW_DAYS,
    recentCount: null,
    velocityPerMonth: null,
    ownerReplies: null,
    ownerReplyRate: null,
    note: reason || 'No reviews endpoint is configured, so recency and replies were not measured.',
  };
}

/**
 * Turn a list of {date, hasOwnerReply} into the signal block.
 * `sampleIsComplete` says whether we saw every review or only the newest few.
 */
export function summarize(rows, { totalReviews, source, sampleIsComplete, now = Date.now() }) {
  const dated = rows.filter((r) => Number.isFinite(r.time));
  const cutoff = now - WINDOW_DAYS * DAY_MS;
  const recentCount = dated.filter((r) => r.time >= cutoff).length;
  const withReplyInfo = rows.filter((r) => r.hasOwnerReply != null);
  const ownerReplies = withReplyInfo.filter((r) => r.hasOwnerReply).length;

  // If every row we saw is inside the window, the true count may be higher -
  // we only looked at the newest N. Say so instead of understating it.
  const capped = !sampleIsComplete && dated.length > 0 && recentCount === dated.length;
  const note = sampleIsComplete
    ? `Based on all ${rows.length} reviews.`
    : `Based on the ${rows.length} most recent review${rows.length === 1 ? '' : 's'}${capped ? ', all of which fall inside the window, so the real rate may be higher' : ''}.`;

  return {
    measured: dated.length > 0 || withReplyInfo.length > 0,
    source,
    totalReviews: totalReviews ?? null,
    sampleSize: rows.length,
    windowDays: WINDOW_DAYS,
    recentCount: dated.length ? recentCount : null,
    velocityPerMonth: dated.length ? recentCount : null,
    atLeast: capped,
    ownerReplies: withReplyInfo.length ? ownerReplies : null,
    ownerReplyRate: withReplyInfo.length ? ownerReplies / withReplyInfo.length : null,
    replySampleSize: withReplyInfo.length,
    note,
  };
}

const toTime = (v) => {
  if (!v) return NaN;
  const t = typeof v === 'number' ? v * (v < 1e12 ? 1000 : 1) : Date.parse(v);
  return Number.isFinite(t) ? t : NaN;
};

// ---------------------------------------------------------------- SerpApi
async function viaSerpApi({ placeId, cid }) {
  if (!config.serpapiKey) return null;
  if (!placeId && !cid) return null;
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google_maps_reviews');
  if (placeId) url.searchParams.set('place_id', placeId);
  else url.searchParams.set('data_id', cid);
  url.searchParams.set('sort_by', 'newestFirst');
  url.searchParams.set('hl', 'en');
  url.searchParams.set('api_key', config.serpapiKey);
  const json = await fetchJson(url.toString());
  if (json.error) throw new Error(json.error);
  const rows = (json.reviews || []).slice(0, SAMPLE_DEPTH).map((r) => ({
    time: toTime(r.iso_date || r.date),
    hasOwnerReply: Boolean(r.response),
  }));
  if (!rows.length) return null;
  return summarize(rows, {
    totalReviews: json.place_info?.reviews ?? null,
    source: 'serpapi',
    sampleIsComplete: rows.length >= (json.place_info?.reviews ?? Infinity),
  });
}

// ------------------------------------------------------------- DataForSEO
const DFS_BASE = 'https://api.dataforseo.com/v3/business_data/google/reviews';

function dfsAuth() {
  const { login, password } = config.dataforseo;
  if (!login || !password) return null;
  return { Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}` };
}

/**
 * DataForSEO's reviews endpoint is task-based: post a task, then poll. Polling
 * is bounded so a slow task degrades to "not measured" rather than hanging the
 * report.
 */
async function viaDataForSeo({ placeId, cid }, { pollMs = 2500, maxPolls = 8 } = {}) {
  const auth = dfsAuth();
  if (!auth) return null;
  if (!placeId && !cid) return null;

  const post = await fetchJson(`${DFS_BASE}/task_post`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: [{
      ...(placeId ? { place_id: placeId } : { cid }),
      language_code: 'en',
      depth: SAMPLE_DEPTH,
      sort_by: 'newest',
    }],
  });
  const task = post.tasks?.[0];
  if (!task?.id) throw new Error(post.status_message || 'reviews task was not accepted');

  for (let i = 0; i < maxPolls; i++) {
    await new Promise((r) => setTimeout(r, pollMs));
    const got = await fetchJson(`${DFS_BASE}/task_get/advanced/${task.id}`, { headers: auth });
    const t = got.tasks?.[0];
    if (t?.status_code === 20000 && t.result?.[0]) {
      const result = t.result[0];
      const rows = (result.items || []).slice(0, SAMPLE_DEPTH).map((r) => ({
        time: toTime(r.timestamp),
        hasOwnerReply: r.owner_answer != null ? Boolean(r.owner_answer) : null,
      }));
      if (!rows.length) return null;
      return summarize(rows, {
        totalReviews: result.reviews_count ?? null,
        source: 'dataforseo',
        sampleIsComplete: rows.length >= (result.reviews_count ?? Infinity),
      });
    }
  }
  throw new Error('reviews task did not finish in time');
}

// ------------------------------------------------- Google Places (partial)
/**
 * Places (New) returns at most five reviews and no owner replies, so it can
 * only ever give a floor on recency. Used when nothing better is configured.
 */
async function viaPlaces({ placeId }) {
  if (!config.googlePlacesKey || !placeId) return null;
  const json = await fetchJson(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      'X-Goog-Api-Key': config.googlePlacesKey,
      'X-Goog-FieldMask': 'reviews,userRatingCount',
    },
  });
  const rows = (json.reviews || []).map((r) => ({
    time: toTime(r.publishTime),
    hasOwnerReply: null, // Places does not expose owner replies at all.
  }));
  if (!rows.length) return null;
  const out = summarize(rows, {
    totalReviews: json.userRatingCount ?? null,
    source: 'places',
    sampleIsComplete: false,
  });
  out.note = `Based on the ${rows.length} reviews Google Places exposes. Owner replies are not available from this source.`;
  return out;
}

/** Mock signals, deterministic per business, shaped like a neglected profile. */
export function mockSignals(business, { isLead }) {
  let h = 2166136261;
  for (const ch of String(business.name || '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const rand = (() => { let s = h >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; })();
  const sample = SAMPLE_DEPTH;
  // The prospect looks dormant; rivals look active. That is the gap the
  // report exists to show.
  const recent = isLead ? Math.round(rand() * 2) : 5 + Math.floor(rand() * 7);
  const replyRate = isLead ? (rand() < 0.6 ? 0 : Math.round(rand() * 2) / sample) : 0.55 + rand() * 0.4;
  const replies = Math.round(replyRate * sample);
  return {
    measured: true,
    source: 'mock',
    totalReviews: business.reviews ?? null,
    sampleSize: sample,
    windowDays: WINDOW_DAYS,
    recentCount: recent,
    velocityPerMonth: recent,
    atLeast: false,
    ownerReplies: replies,
    ownerReplyRate: replies / sample,
    replySampleSize: sample,
    note: `Sample data. Based on ${sample} simulated recent reviews.`,
  };
}

/**
 * Fetch review signals for one business. Never throws: an unreachable or
 * unconfigured endpoint comes back as unmeasured, with the reason.
 */
export async function reviewSignals(business, { mock = false, isLead = false } = {}) {
  if (mock) return mockSignals(business, { isLead });
  const chain = [
    ['serpapi', viaSerpApi],
    ['dataforseo', viaDataForSeo],
    ['places', viaPlaces],
  ];
  const tried = [];
  for (const [name, fn] of chain) {
    try {
      const out = await fn(business);
      if (out) return out;
      tried.push(`${name}: nothing returned`);
    } catch (err) {
      tried.push(`${name}: ${err.message}`);
    }
  }
  return unmeasured(
    business.reviews ?? null,
    tried.length
      ? `Review recency and replies were not measured (${tried.join('; ')}).`
      : 'No reviews endpoint is configured, so recency and replies were not measured.',
  );
}
