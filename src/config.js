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
   * any string is replaced with the price.
   */
  offer: {
    name: env('OFFER_NAME', 'Local Review Engine & Geo-Expansion'),
    price: env('OFFER_PRICE', '$297/mo'),
    cta: env('OFFER_CTA', 'Start 60-Day Review Engine — {price}'),
    microcopy: env('OFFER_MICROCOPY', '{price} flat · No contracts · 60-day guarantee · 15-min setup'),
    checkoutMicrocopy: env('OFFER_CHECKOUT_MICROCOPY', 'Instant 15-Min Setup · No Setup Fees · Month-to-Month'),
    guarantee: env('OFFER_GUARANTEE',
      '60-Day Momentum Guarantee: More reviews and more green pins on your next heatmap, or we refund month two in full. Cancel anytime with one click.'),
    goalPins: Number(env('OFFER_GOAL_PINS', '15')),
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
    phone: env('SENDER_PHONE', '(408) 555-0199'),
  },
  /**
   * Where the report's checkout link points. The PDF is opened on the
   * prospect's machine, so this must be the public site, not localhost.
   */
  publicBaseUrl: env('PUBLIC_BASE_URL', 'https://promoflix.ai').replace(/\/+$/, ''),
  /** Stripe Payment Link, e.g. https://buy.stripe.com/xxxx */
  stripeCheckoutUrl: env('STRIPE_CHECKOUT_URL', ''),

};
