/**
 * Industry vocabulary. The audit, the checkout page and both emails read
 * from this one table, so a niche's wording cannot drift between them.
 */
export const NICHES = {
  'tree-services': {
    key: 'tree-services',
    label: 'Tree Services',
    serviceNoun: 'tree service',
    marketNoun: 'tree service companies',   // "I was looking at ___ in Dallas"
    businessNoun: 'tree service company',
    highTicket: 'crane takedowns, power lines, emergency removals',
    // Named in the report's "replies that name your services" line.
    services: ['tree removal', 'stump grinding', 'emergency storm work'],
    transactionEvent: 'completed job',
    software: 'Jobber, Housecall Pro, QuickBooks, or simple SMS',
    keywords: /\btree|arborist|stump|trimming|limb\b/i,
  },
  'assisted-living': {
    key: 'assisted-living',
    label: 'Assisted Living',
    serviceNoun: 'assisted living',
    marketNoun: 'assisted living communities',
    businessNoun: 'assisted living community',
    highTicket: 'memory care, respite stays, assisted living suites',
    services: ['assisted living suites', 'memory care', 'respite care'],
    transactionEvent: 'family tour or intake consultation',
    software: 'CRM, intake forms, email, or simple SMS',
    keywords: /assisted living|senior|memory care|retirement|elder|nursing home|respite/i,
  },
  plumbing: {
    key: 'plumbing',
    label: 'Plumbing',
    serviceNoun: 'plumbing',
    marketNoun: 'plumbing companies',
    businessNoun: 'plumbing company',
    highTicket: 'water heater replacements, repiping, sewer line repairs',
    services: ['water heater repair', 'drain clearing', 'leak detection'],
    transactionEvent: 'completed service call',
    software: 'Jobber, Housecall Pro, ServiceTitan, QuickBooks, or simple SMS',
    keywords: /plumb|drain|water heater|sewer|leak|rooter|pipe/i,
  },
  generic: {
    key: 'generic',
    label: 'General Contractor / Home Services',
    serviceNoun: 'local service',
    marketNoun: 'local service companies',
    businessNoun: 'local service business',
    // Plain trade language, not internal shorthand like "high-margin projects".
    highTicket: 'emergency repairs, new installations, larger remodel projects',
    services: ['emergency repairs', 'new installations', 'routine maintenance'],
    transactionEvent: 'completed service call',
    software: 'Jobber, QuickBooks, or simple SMS',
    keywords: null,
  },
};

export const DEFAULT_NICHE = 'tree-services';

/** Resolve a niche key, falling back to the default rather than throwing. */
export function getNiche(key) {
  return NICHES[key] || NICHES[DEFAULT_NICHE];
}

/**
 * Guess a niche from the search keyword, for pre-filling the composer.
 * Returns null when nothing matches so the caller keeps the explicit choice.
 */
export function detectNiche(keyword = '') {
  for (const n of Object.values(NICHES)) {
    if (n.keywords && n.keywords.test(keyword)) return n.key;
  }
  return null;
}

/** The subset safe to hand to a browser (no regexes). */
export function publicNiches() {
  return Object.fromEntries(Object.values(NICHES).map(({ keywords, ...rest }) =>
    [rest.key, { ...rest, pattern: keywords ? keywords.source : null }]));
}
