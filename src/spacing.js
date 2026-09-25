/**
 * Grid-spacing recommendation and the radius wording that follows from it.
 *
 * A 5x5 grid extends two steps from the center pin in each direction:
 *   radius = spacing x 2      (0.5 -> 1 mi,  1 -> 2 mi,  2 -> 4 mi)
 *   width  = spacing x 4      (0.5 -> 2 mi,  1 -> 4 mi,  2 -> 8 mi)
 * Every piece of copy that mentions distance derives from these two numbers,
 * so it cannot drift from the grid actually scanned.
 */
import { splitCityState } from './providers/geocode.js';
import { getNiche } from './niches.js';

export const radiusMi = (spacing) => Number((spacing * 2).toFixed(2));
export const widthMi = (spacing) => Number((spacing * 4).toFixed(2));

const miles = (n) => `${Number(n.toFixed(1))} ${n === 1 ? 'mile' : 'miles'}`;
const article = (n) => (/^(8|11|18)(\D|$)/.test(String(n)) ? 'an' : 'a');

/**
 * The phrase that follows "captures X% of local searches ...".
 *   0.5 -> "within 1 mile of your location"
 *   1   -> "across a 4-mile territory in Santa Clara"
 *   2   -> "across an 8-mile territory in Santa Clara"
 */
export function coveragePhrase(spacing, city) {
  if (spacing <= 0.5) return `within ${miles(radiusMi(spacing))} of your location`;
  const w = widthMi(spacing);
  return `across ${article(w)} ${Number(w.toFixed(1))}-mile territory${city ? ` in ${city}` : ''}`;
}

/* ------------------------------------------------------------------------ */
/* Market density                                                            */
/* ------------------------------------------------------------------------ */

// City|ST. Kept deliberately short: a wrong "urban" call shrinks the grid to
// a few blocks, so only places that are unambiguously dense are listed.
const URBAN_CORE = new Set([
  'san francisco|CA', 'new york|NY', 'manhattan|NY', 'brooklyn|NY', 'queens|NY', 'bronx|NY',
  'chicago|IL', 'boston|MA', 'cambridge|MA', 'somerville|MA', 'philadelphia|PA',
  'washington|DC', 'seattle|WA', 'jersey city|NJ', 'hoboken|NJ', 'miami beach|FL', 'baltimore|MD',
]);

const SPRAWLING = new Set([
  'houston|TX', 'dallas|TX', 'fort worth|TX', 'arlington|TX', 'san antonio|TX', 'el paso|TX',
  'phoenix|AZ', 'mesa|AZ', 'chandler|AZ', 'gilbert|AZ', 'scottsdale|AZ', 'glendale|AZ', 'tucson|AZ',
  'orlando|FL', 'jacksonville|FL', 'oklahoma city|OK', 'tulsa|OK', 'las vegas|NV', 'henderson|NV',
  'albuquerque|NM', 'kansas city|MO', 'charlotte|NC', 'nashville|TN', 'indianapolis|IN', 'atlanta|GA',
]);

const RURAL_POPULATION = 10000;

function lookup(set, city, state) {
  const c = city.toLowerCase().trim();
  if (state) return set.has(`${c}|${state}`);
  // No state typed: match on the city name alone.
  for (const k of set) if (k.split('|')[0] === c) return true;
  return false;
}

/**
 * Classify a market. Returns {density, basis} where basis says how sure we
 * are: 'known' (a listed city), 'population' (from geocoder data) or 'default'.
 */
export function classifyMarket(location, population = null) {
  const { city, state } = splitCityState(location);
  const name = String(city || '').replace(/\s+/g, ' ').trim();
  if (name && lookup(URBAN_CORE, name, state)) return { density: 'urban', basis: 'known' };
  if (name && lookup(SPRAWLING, name, state)) return { density: 'sprawl', basis: 'known' };
  if (Number.isFinite(population) && population > 0 && population < RURAL_POPULATION) {
    return { density: 'rural', basis: 'population' };
  }
  return { density: 'standard', basis: Number.isFinite(population) ? 'population' : 'default' };
}

const DENSITY_LABEL = { urban: 'urban-core', standard: 'suburban', sprawl: 'sprawling-metro', rural: 'rural' };
const MODEL_LABEL = { dispatch: 'contractor', facility: 'facility' };

/** The heuristic table from the spec, in one place. */
function pick(density, model) {
  switch (density) {
    case 'urban':
      return { spacingMi: 0.5, reason: 'High-density urban market; proximity drop-off happens within blocks.' };
    case 'sprawl':
      return model === 'facility'
        ? { spacingMi: 1.5, reason: 'Sprawling commercial territory; covers extended driving & service zones.' }
        : { spacingMi: 2, reason: 'Sprawling commercial territory; covers extended driving & service zones.' };
    case 'rural':
      return { spacingMi: 2, reason: 'Low-density territory; search catchment spans multiple zip codes.' };
    default:
      return model === 'facility'
        ? { spacingMi: 0.5, reason: 'Suburban facility market; families search close to home.' }
        // 1 mi spacing is a 4-mile-wide grid, i.e. a 2-mile radius; the
        // wording says "territory" so it matches the headline's numbers.
        : { spacingMi: 1, reason: 'Suburban service area; standard 4-mile customer dispatch territory.' };
  }
}

/**
 * @returns {{spacingMi:number, density:string, model:string, basis:string,
 *            reason:string, badge:string, city:string}}
 */
export function recommendSpacing({ location, niche, population = null, city: knownCity }) {
  const n = getNiche(niche);
  const model = n.model || 'dispatch';
  const { density, basis } = classifyMarket(location, population);
  const { spacingMi, reason } = pick(density, model);
  const city = knownCity || String(splitCityState(location).city || location || '').trim();
  const where = city ? `${titleCase(city)} ` : '';
  const badge = `Recommended: ${spacingMi.toFixed(1)} mi spacing based on ${where}${DENSITY_LABEL[density]} ${MODEL_LABEL[model]} footprint`;
  // Say when the density is a guess, so an operator in a dense or sprawling
  // city that is not on the lists knows to check the dropdown.
  const note = basis === 'default' ? 'Not on the urban-core or sprawling-metro lists, so a suburban market is assumed.' : '';
  return { spacingMi, density, model, basis, reason, note, badge, city: titleCase(city) };
}

function titleCase(s) {
  return String(s || '').replace(/\S+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}
