/**
 * MOCK provider – produces a realistic proximity drop-off without spending
 * API credits. Deterministic per business name + keyword so re-runs match.
 */
import { geocode, geocodeBusiness } from './geocode.js';
import { haversineMi, offsetLatLng } from '../geometry.js';

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
  { re: /hvac|furnace|heat|air ?con|\bac\b|cooling/i, words: ['Heating & Air', 'Climate Control', 'Comfort Systems', 'HVAC Pros', 'Air Solutions', 'Mechanical'] },
  { re: /plumb|drain|water heater|sewer/i, words: ['Plumbing', 'Plumbing & Drain', 'Rooter', 'Pipeworks', 'Plumbing Co'] },
  { re: /roof/i, words: ['Roofing', 'Roofing & Gutters', 'Roof Pros', 'Roofing Co'] },
  { re: /electric/i, words: ['Electric', 'Electrical Services', 'Power & Light', 'Electric Co'] },
  { re: /dent|orthodon/i, words: ['Dental', 'Family Dentistry', 'Dental Care', 'Smiles'] },
  { re: /law|attorney|lawyer|injury/i, words: ['Law Group', 'Legal', 'Law Offices', 'Injury Lawyers'] },
  { re: /landscap|lawn|tree/i, words: ['Landscaping', 'Lawn Care', 'Tree Service', 'Outdoor'] },
  { re: /pest|exterminat/i, words: ['Pest Control', 'Exterminators', 'Pest Solutions'] },
  { re: /clean|maid|janitor/i, words: ['Cleaning', 'Maids', 'Cleaning Services'] },
  { re: /auto|mechanic|brake|tire|oil change/i, words: ['Auto Repair', 'Automotive', 'Auto Care', 'Tire & Auto'] },
];
const PREFIXES = ['Bay Area', 'Golden State', 'Valley', 'Metro', 'Precision', 'Reliable', 'Elite', 'Premier', 'All-Star', 'Summit', 'Blue Sky', 'Family', 'Pro', 'Certified', 'Express'];

function competitorNames(keyword, city, rand, n) {
  const cat = CATEGORIES.find((c) => c.re.test(keyword));
  const words = cat ? cat.words : ['Services', 'Solutions', 'Co', 'Group'];
  const names = new Set();
  while (names.size < n) {
    const pre = rand() < 0.35 && city ? city : PREFIXES[Math.floor(rand() * PREFIXES.length)];
    names.add(`${pre} ${words[Math.floor(rand() * words.length)]}`);
  }
  return [...names];
}

export const mockProvider = {
  name: 'mock',

  async resolveBusiness({ name, location }) {
    // The city always resolves; the business name is a bonus. If a geocoder
    // knows the business and it sits near the city, centre on it, otherwise
    // fall back to the city centre.
    const city = await geocode(location);
    const exact = await geocodeBusiness(name, location, city);
    const geo = exact || city;
    const seed = seedFrom(name.toLowerCase());
    return {
      name,
      lat: geo.lat,
      lng: geo.lng,
      placeId: `mock_${seed.toString(36)}`,
      cid: String(seed),
      address: exact ? geo.displayName : `${city.displayName} (approximate — city centre)`,
      city: city.city || location,
      approximate: !exact,
      source: 'mock',
    };
  },

  /**
   * Builds a fixed "market" of competitors around the business once, then
   * ranks everyone at each grid point by a distance-decayed strength score.
   */
  createRanker({ business, keyword, spacingMi }) {
    const rand = rng(seedFrom(`${business.name}|${keyword}`.toLowerCase()));
    const cityShort = (business.city || '').split(',')[0].trim();
    const names = competitorNames(keyword, cityShort, rand, 24);
    // Strength ~ review count / authority. Target sits mid-pack so it wins
    // near home but loses further out – the classic proximity story.
    const spread = spacingMi * 2.4;
    // The market leans one way: a "weak side" where the target leaks calls.
    const weakAngle = rand() * Math.PI * 2;
    const competitors = names.map((n, i) => {
      const angle = i < 8 ? weakAngle + (rand() - 0.5) * 1.2 : rand() * Math.PI * 2;
      const dist = spread * (0.45 + rand() * 1.0);
      const p = offsetLatLng(business.lat, business.lng, Math.cos(angle) * dist, Math.sin(angle) * dist);
      return { title: n, placeId: `mock_c${i}`, lat: p.lat, lng: p.lng, strength: 0.35 + rand() * 0.75 };
    });
    // One strong regional player guarantees a believable "who is winning" story.
    competitors[0].strength = 1.75;
    competitors[1].strength = 1.1;
    const target = { title: business.name, placeId: business.placeId, cid: business.cid, lat: business.lat, lng: business.lng, strength: 1.0 };
    const all = [target, ...competitors];
    const decay = spacingMi * 0.9; // miles at which relevance roughly halves

    return async (point) => {
      const scored = all.map((b) => {
        const d = haversineMi(point.lat, point.lng, b.lat, b.lng);
        const jitter = 0.85 + rand() * 0.3;
        return { b, score: (b.strength * jitter) / (1 + d / decay) ** 1.6 };
      });
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, 20).map(({ b }, i) => ({
        position: i + 1,
        title: b.title,
        placeId: b.placeId,
        cid: b.cid,
        lat: b.lat,
        lng: b.lng,
      }));
    };
  },
};
