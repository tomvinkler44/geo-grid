import { config } from '../config.js';
import { mockProvider } from './mock.js';
import { dataforseoProvider } from './dataforseo.js';
import { serpapiProvider } from './serpapi.js';
import { resolveWithPlaces } from './places.js';

const PROVIDERS = { mock: mockProvider, dataforseo: dataforseoProvider, serpapi: serpapiProvider };

export function getProvider(name = config.rankProvider) {
  const p = PROVIDERS[name];
  if (!p) throw new Error(`Unknown RANK_PROVIDER "${name}". Use one of: ${Object.keys(PROVIDERS).join(', ')}`);
  return p;
}

/**
 * Resolve the business to a GBP listing. Google Places wins when a key is
 * configured (even in mock mode, so the map is centred on the real address);
 * otherwise the rank provider's own search is used.
 */
export async function resolveBusiness(provider, input) {
  if (config.googlePlacesKey && !input.coordinates) {
    try {
      return await resolveWithPlaces(input);
    } catch (err) {
      if (provider.name !== 'mock') throw err;
      console.warn(`[places] ${err.message} – falling back to mock resolver`);
    }
  }
  return provider.resolveBusiness(input);
}
