import 'dotenv/config';

const env = (k, d = '') => (process.env[k] ?? d).toString().trim();

export const config = {
  port: Number(env('PORT', '3000')),
  agencyName: env('AGENCY_NAME', ''),
  agencyUrl: env('AGENCY_URL', ''),
  /** mock | dataforseo | serpapi */
  rankProvider: env('RANK_PROVIDER', 'mock').toLowerCase(),
  /** osm | carto | mapbox | none */
  mapProvider: env('MAP_PROVIDER', 'carto').toLowerCase(),
  mapboxToken: env('MAPBOX_TOKEN'),
  mapboxStyle: env('MAPBOX_STYLE', 'mapbox/light-v11'),
  googlePlacesKey: env('GOOGLE_PLACES_API_KEY'),
  dataforseo: { login: env('DATAFORSEO_LOGIN'), password: env('DATAFORSEO_PASSWORD') },
  serpapiKey: env('SERPAPI_KEY'),
  userAgent: env('HTTP_USER_AGENT', 'geo-grid-report/0.1 (+https://github.com/tomvinkler44/geo-grid)'),
  outputDir: env('OUTPUT_DIR', 'output'),
  /** Concurrency for rank lookups against paid APIs. */
  rankConcurrency: Number(env('RANK_CONCURRENCY', '4')),
  /**
   * The offer. One definition drives the audit PDF, the checkout page and the
   * emails, so the name, button and guarantee cannot disagree. `{price}` in
   * any string is replaced with the price, and `{goal}` with the prospect's
   * own Day 90 map target (see guarantee.js).
   *
   * Two versions run as an A/B test. Each audit is assigned one, and its PDF,
   * report email and checkout page all show that version only:
   *   A - first 30 days free (the Stripe link for A must include the trial)
   *   B - we work free until the map improves
   */
  offer: {
    name: env('OFFER_NAME', 'Local Review Engine'),
    price: env('OFFER_PRICE', '$297/mo'),
    /** ab = split audits between A and B; a or b = show one version only. */
    test: env('OFFER_TEST', 'ab').toLowerCase(),
    deliverablesHeading: 'Everything handled for you, every month:',
    deliverables: [
      { title: 'A review request after every job', text: 'A friendly text after each job, with an email reminder. Every customer gets asked, so it stays within Google’s rules.' },
      { title: 'A reply to every review', text: 'Prompt, professional replies, and a heads-up with a calm reply drafted for you if a tough one comes in.' },
      { title: 'A monthly neighborhood map', text: 'The same 25-point map every 30 days, so you see exactly where you gained ground. No jargon.' },
    ],
    variants: {
      a: {
        label: 'Version A: first 30 days free',
        cta: env('OFFER_A_CTA', 'Start my free 30 days'),
        microcopy: env('OFFER_A_MICROCOPY', '$0 today · First 30 days free · Then {price} · Cancel anytime'),
        guarantee: env('OFFER_A_GUARANTEE',
          'First 30 days free: Try everything for 30 days. Cancel before Day 30 and you pay nothing. After that it’s {price}, month-to-month.'),
        terms: 'Card required to start, but nothing is charged today. We email you 3 days before your first payment on Day 31. After that, {price} is billed monthly in advance. Cancel anytime.',
      },
      b: {
        label: 'Version B: we work free until you get results',
        cta: env('OFFER_B_CTA', 'Start for {price}'),
        microcopy: env('OFFER_B_MICROCOPY', '{price} · No contract · Cancel anytime'),
        guarantee: env('OFFER_B_GUARANTEE',
          'We work free until you get results: If your Day 90 map doesn’t show you {goal}, you pay nothing more until it does.'),
        terms: 'Your Day 90 map is re-checked with the same search, grid and spacing as your Day 1 map. The guarantee applies while you send us every completed job. No contract, cancel anytime.',
      },
    },
  },
  /** Who the audit and emails come from. */
  sender: {
    company: env('SENDER_COMPANY', 'Promoflix'),
    name: env('SENDER_NAME', 'Tom Vinkler'),
    cityState: env('SENDER_CITY_STATE', 'Santa Clara, CA'),
    // CAN-SPAM requires a *valid physical postal address* in commercial email:
    // a street address, a P.O. box, or a registered private mailbox. A city
    // alone does not satisfy it, so this has no default.
    postalAddress: env('SENDER_POSTAL_ADDRESS', ''),
    email: env('SENDER_EMAIL', 'hello@promoflix.ai'),
    phone: env('SENDER_PHONE', '(408) 462-5198'),
  },
  /**
   * Where the report's checkout link points. The PDF is opened on the
   * prospect's machine, so this must be the public site, not localhost.
   */
  publicBaseUrl: env('PUBLIC_BASE_URL', 'https://promoflix.ai').replace(/\/+$/, ''),
  /**
   * Stripe Payment Links, e.g. https://buy.stripe.com/xxxx. Version A's link
   * must have the 30-day free trial switched on; version B's is a plain
   * monthly subscription.
   */
  stripeCheckoutUrlA: env('STRIPE_CHECKOUT_URL_A', ''),
  stripeCheckoutUrl: env('STRIPE_CHECKOUT_URL', ''),

};
