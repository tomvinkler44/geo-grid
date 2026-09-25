/**
 * MOCK provider – produces a realistic market without spending API credits.
 * Deterministic per business name + keyword, so re-runs match.
 *
 * Mock runs are calibrated to "Scenario A: Strategic Selection": the lead holds
 * the Map Pack only close to home while two rivals own most of the map. That is
 * the shape that makes the comparison sheet worth sending, so the layout can be
 * tested against the case it exists for.
 *
 * Typed competitor names are deliberately ignored here. The market is invented,
 * and putting a real company's name on invented numbers would be misleading.
 */
import { geocode, geocodeBusiness } from './geocode.js';
import { haversineMi, offsetLatLng, buildGrid } from '../geometry.js';
import { WEAK_MAX } from '../ranks.js';

/**
 * Scenario A targets, out of 25 points: green pins (rank 1-3) for each of the
 * three panels, plus how many points the lead should be invisible at (11+).
 * The red edge is the whole point of the sheet, so it is calibrated too.
 */
export const SCENARIO_A = { lead: 4, rivalA: 18, rivalB: 10, leadInvisible: 7 };

function seedFrom(str) {
  let h = 2166136261;
  for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let s = seed || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

const CATEGORIES = [
  { re: /assisted living|senior|memory care|retirement|nursing/i, words: ['Senior Living', 'Assisted Living', 'Senior Care', 'Retirement Community', 'Senior Residences'], category: 'Assisted living facility' },
  { re: /hvac|furnace|heat|air ?con|\bac\b|cooling/i, words: ['Heating & Air', 'Climate Control', 'Comfort Systems', 'HVAC Pros', 'Air Solutions'], category: 'HVAC contractor' },
  { re: /plumb|drain|water heater|sewer/i, words: ['Plumbing', 'Plumbing & Drain', 'Rooter', 'Pipeworks', 'Plumbing Co'], category: 'Plumber' },
  { re: /roof/i, words: ['Roofing', 'Roofing & Gutters', 'Roof Pros', 'Roofing Co'], category: 'Roofing contractor' },
  { re: /electric/i, words: ['Electric', 'Electrical Services', 'Power & Light'], category: 'Electrician' },
  { re: /dent|orthodon/i, words: ['Dental', 'Family Dentistry', 'Dental Care', 'Smiles'], category: 'Dentist' },
  { re: /law|attorney|lawyer|injury/i, words: ['Law Group', 'Legal', 'Law Offices', 'Injury Lawyers'], category: 'Law firm' },
  { re: /\btree|arborist|stump/i, words: ['Tree Service', 'Tree Care', 'Arborists', 'Tree & Stump', 'Tree Experts'], category: 'Tree service' },
  { re: /landscap|lawn/i, words: ['Landscaping', 'Lawn Care', 'Tree Service'], category: 'Landscaper' },
  { re: /pest|exterminat/i, words: ['Pest Control', 'Exterminators'], category: 'Pest control service' },
  { re: /clean|maid|janitor/i, words: ['Cleaning', 'Maids', 'Cleaning Services'], category: 'House cleaning service' },
  { re: /auto|mechanic|brake|tire|oil change/i, words: ['Auto Repair', 'Automotive', 'Auto Care'], category: 'Auto repair shop' },
];
const PREFIXES = ['Bay Area', 'Golden State', 'Valley', 'Metro', 'Precision', 'Reliable', 'Elite', 'Premier', 'Summit', 'Blue Sky', 'Family', 'Certified', 'Evergreen', 'Parkview', 'Hillcrest'];

function categoryFor(keyword) {
  return CATEGORIES.find((c) => c.re.test(keyword)) || { words: ['Services', 'Solutions', 'Group'], category: 'Local business' };
}

function competitorNames(keyword, city, rand, n) {
  const cat = categoryFor(keyword);
  const names = new Set();
  let guard = 0;
  while (names.size < n && guard++ < 500) {
    const pre = rand() < 0.3 && city ? city : PREFIXES[Math.floor(rand() * PREFIXES.length)];
    names.add(`${pre} ${cat.words[Math.floor(rand() * cat.words.length)]}`);
  }
  return [...names];
}

const DECAY_EXP = 1.6;

/** Rank everyone at one point. Jitter is fixed per (business, point). */
function rankPoint(market, point, pointIndex) {
  const scored = market.businesses.map((b, i) => {
    const d = haversineMi(point.lat, point.lng, b.lat, b.lng);
    const jitter = market.jitter[i][pointIndex];
    return { b, score: (b.strength * jitter) / (1 + d / market.decay) ** DECAY_EXP };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function countsFor(market, grid, index) {
  let green = 0;
  let invisible = 0;
  for (let p = 0; p < grid.length; p++) {
    const order = rankPoint(market, grid[p], p);
    const pos = order.findIndex((o) => o.b.index === index);
    if (pos >= 0 && pos < 3) green++;
    if (pos < 0 || pos >= WEAK_MAX) invisible++;
  }
  return { green, invisible };
}

/**
 * Nudge the three headline strengths until the green-pin counts land on the
 * scenario. A joint search, because a rank is a position among all of them.
 */
function calibrate(market, grid) {
  const span = (lo, hi, n) => Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));

  const evaluate = (sl, sa, sb) => {
    market.businesses[0].strength = sl;
    market.businesses[1].strength = sa;
    market.businesses[2].strength = sb;
    const l = countsFor(market, grid, 0);
    const a = countsFor(market, grid, 1);
    const b = countsFor(market, grid, 2);
    // Rival A must stay clearly ahead of rival B, or the panels read oddly.
    const order = a.green > b.green ? 0 : 6;
    const cost = Math.abs(l.green - SCENARIO_A.lead) + Math.abs(a.green - SCENARIO_A.rivalA) +
      Math.abs(b.green - SCENARIO_A.rivalB) + order +
      Math.abs(l.invisible - SCENARIO_A.leadInvisible) * 0.45;
    return { cost, sl, sa, sb, gl: l.green, ga: a.green, gb: b.green, li: l.invisible };
  };

  const search = (leadOpts, aOpts, bOpts, seed) => {
    let best = seed;
    for (const sl of leadOpts) {
      for (const sa of aOpts) {
        for (const sb of bOpts) {
          const r = evaluate(sl, sa, sb);
          if (!best || r.cost < best.cost) best = r;
          if (best.cost === 0) return best;
        }
      }
    }
    return best;
  };

  // Coarse sweep, then a finer sweep around whatever it found.
  let best = search(span(0.25, 1.9, 12), span(0.9, 4.2, 12), span(0.7, 3.6, 12), null);
  if (best.cost > 0) {
    const around = (v, w) => span(Math.max(0.05, v - w), v + w, 9);
    best = search(around(best.sl, 0.18), around(best.sa, 0.34), around(best.sb, 0.3), best);
  }

  market.businesses[0].strength = best.sl;
  market.businesses[1].strength = best.sa;
  market.businesses[2].strength = best.sb;
  return best;
}

function buildMarket({ business, keyword, spacingMi }) {
  const rand = rng(seedFrom(`${business.name}|${keyword}`.toLowerCase()));
  const cityShort = (business.city || '').split(',')[0].trim()
    .replace(/\S+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
  const cat = categoryFor(keyword);
  const names = competitorNames(keyword, cityShort, rand, 26);

  const businesses = [{
    index: 0,
    title: business.name,
    placeId: business.placeId,
    cid: business.cid,
    lat: business.lat,
    lng: business.lng,
    strength: 1,
    rating: +(4.1 + rand() * 0.5).toFixed(1),
    reviews: 90 + Math.floor(rand() * 150),
    category: cat.category,
    website: `https://www.${business.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}.com`,
  }];

  // Two headline rivals, placed off to one side so the lead has a clear weak
  // flank, then filler businesses scattered around.
  const weakAngle = rand() * Math.PI * 2;
  const headline = [
    { dist: spacingMi * 1.0, angle: weakAngle + 0.25 },
    { dist: spacingMi * 1.7, angle: weakAngle - 0.55 },
  ];
  headline.forEach((h, k) => {
    const p = offsetLatLng(business.lat, business.lng, Math.cos(h.angle) * h.dist, Math.sin(h.angle) * h.dist);
    businesses.push({
      index: k + 1,
      title: names[k],
      placeId: `mock_c${k}`,
      lat: p.lat,
      lng: p.lng,
      strength: 1.5,
      rating: +(4.4 + rand() * 0.5).toFixed(1),
      reviews: k === 0 ? 620 + Math.floor(rand() * 320) : 260 + Math.floor(rand() * 200),
      category: cat.category,
      website: `https://www.${names[k].toLowerCase().replace(/[^a-z0-9]+/g, '')}.com`,
    });
  });

  for (let i = 2; i < names.length; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = spacingMi * (1.2 + rand() * 2.4);
    const p = offsetLatLng(business.lat, business.lng, Math.cos(angle) * dist, Math.sin(angle) * dist);
    businesses.push({
      index: businesses.length,
      title: names[i],
      placeId: `mock_c${i}`,
      lat: p.lat,
      lng: p.lng,
      strength: 0.45 + rand() * 0.95,
      rating: +(3.8 + rand() * 0.9).toFixed(1),
      reviews: 20 + Math.floor(rand() * 260),
      category: cat.category,
      website: `https://www.${names[i].toLowerCase().replace(/[^a-z0-9]+/g, '')}.com`,
    });
  }

  // Fixed jitter per (business, point) keeps calibration stable and results
  // reproducible, while still avoiding a suspiciously perfect distance ranking.
  const jitter = businesses.map(() => Array.from({ length: 25 }, () => 0.88 + rand() * 0.24));
  return { businesses, jitter, decay: spacingMi * 0.9 };
}

export const mockProvider = {
  name: 'mock',

  async resolveBusiness({ name, location }) {
    const city = await geocode(location);
    const exact = await geocodeBusiness(name, location, city);
    const geo = exact || city;
    const seed = seedFrom(name.toLowerCase());
    const rand = rng(seed);
    return {
      name,
      lat: geo.lat,
      lng: geo.lng,
      placeId: `mock_${seed.toString(36)}`,
      cid: String(seed),
      address: exact ? geo.displayName : '',
      city: city.city || location,
      rating: +(4.0 + rand() * 0.6).toFixed(1),
      reviews: 90 + Math.floor(rand() * 150),
      website: `https://www.${name.toLowerCase().replace(/[^a-z0-9]+/g, '')}.com`,
      approximate: !exact,
      verifiedFields: ['address', 'phone', 'hours'],
      source: 'mock',
    };
  },

  createRanker({ business, keyword, spacingMi }) {
    const market = buildMarket({ business, keyword, spacingMi });
    const grid = buildGrid(business.lat, business.lng, spacingMi);
    calibrate(market, grid);

    // Map each grid coordinate back to its index so jitter stays consistent.
    const indexOf = new Map(grid.map((p, i) => [`${p.lat},${p.lng}`, i]));

    return async (point) => {
      const i = indexOf.get(`${point.lat},${point.lng}`) ?? 0;
      return rankPoint(market, point, i).slice(0, 20).map(({ b }, pos) => ({
        position: pos + 1,
        title: b.title,
        placeId: b.placeId,
        cid: b.cid,
        lat: b.lat,
        lng: b.lng,
        rating: b.rating,
        reviews: b.reviews,
        category: b.category,
        website: b.website,
      }));
    };
  },
};
