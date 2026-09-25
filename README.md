# Geo-Grid Rank Report

Turns a 5 × 5 (25-point) local SEO geo-grid scan into a one-page executive audit you can print
and send: the prospect's map beside two rivals, three conversion signals, and five plain-English
sentences that say what the numbers mean for revenue.

**One scan, three panels.** A local-pack lookup at a grid point returns the whole pack, so the
prospect and both rivals are read out of the *same* 25 calls. Picking competitors happens after
the scan, from the stored results, so swapping one costs nothing.

Runs as a small Express web app **or** a one-line CLI. No database, and one small CSS build step
that `npm start` handles for you.

**Not technical?** Read [GETTING-STARTED.md](GETTING-STARTED.md): double-click launchers for
Mac/Windows, or a one-click Render deploy. All keys are entered on the in-app **Settings** page.

## Quick start

```bash
npm install
cp .env.example .env        # defaults to mock ranks + OpenStreetMap basemap, no keys needed
npm start                   # http://localhost:3000
```

The app walks through four steps:

| Step | What happens |
| --- | --- |
| **1 · Business details** | Name, city/state or zip, optional street address (pins the exact listing when names collide), keyword, grid spacing. |
| **2 · Recommended rivals** | The 25-point scan runs once, then two archetypes are proposed: the **Market Dominator** (most reviewed of the widest-reaching businesses) and the **Nearby Direct Peer** (closest rival that is at least level with the prospect). Each card shows review count, rating and why it was chosen. Either can be overridden with a typed name. |
| **3 · Generate** | *Approve Rivals & Generate Executive Audit*. Re-reads the stored scan, fetches review signals, draws the three maps. No second scan. |
| **4 · Executive audit** | Exactly one US Letter page: the headline "[Business] captures X% of local searches in [City]. [Competitor A] captures Y%.", a context strip, the 3-way heatmap with legend, three metric cards benchmarked against Competitor A, a two-column narrative (diagnosis / action plan), and a light offer card whose emerald button links into the personalized checkout. A floating bar (screen only) offers **Export / Print PDF**, **Copy Report Email** and **Copy Outreach Email**. Raw grid data is not shown; it is written to `output/*.json` and its path logged by the server. |

### What the three signal cards need

| Card | Source | Available when |
| --- | --- | --- |
| **Total Google reviews** | the local-pack result itself | always |
| **Reviews in the last 30 days** | a reviews endpoint | SerpApi (one call) or DataForSEO (queued task) |
| **Owner reply rate** | a reviews endpoint | SerpApi or DataForSEO only — **Google Places does not expose owner replies at all** |

A signal that could not be measured renders as `not measured` with the reason, and sentence four
drops the claim rather than reporting a zero nobody checked. This matters: telling a real prospect
they never answer reviews when the app simply did not look is worse than an empty card.

### CLI### CLI

```bash
node src/cli.js --business "Pacific Coast Heating & AC" --location "San Jose, CA" \
  --keyword "furnace repair near me" --spacing 0.5 --mock

# name the rivals yourself, pin the listing with a street address
node src/cli.js -b "Pacific Coast Assisted Living" -l "Sunnyvale, CA" -a "1250 Elm St" \
  -k "assisted living sunnyvale" --live \
  --competitor "Sunrise Senior Living of Sunnyvale" --competitor "The Terraces of Los Altos"

# fully offline (no tiles, no geocoding): give the coordinates and the procedural basemap
node src/cli.js -b "Test HVAC" -l "San Jose, CA" -k "ac repair" -c "37.3382,-121.8863" --map none --mock
```

The email-ready takeaway prints to stdout; progress and file paths go to stderr, so
`node src/cli.js … > pitch.txt` just works. Outputs land in `output/` as
`<business>_<keyword>_<timestamp>.{png,pdf,json,txt}`.

## How it works

1. **Resolve the listing.** With `GOOGLE_PLACES_API_KEY` set, Google Places (New) Text Search
   returns the exact GBP title, coordinates and Place ID. Otherwise the rank provider's own
   Maps search is used, and in mock mode the address is geocoded. You can always bypass this
   with a `lat,lng` override (form → Advanced, or `--coordinates`).

   Geocoding fails over across four keyless services in order — Zippopotam (postal codes),
   Photon, Open-Meteo, then Nominatim. Nominatim is last because it 403s VPN and datacentre
   IPs, which made it a single point of failure. Results are cached in `.cache/geocode.json`,
   and a service that cannot handle an input (a postal-code service given a city name) opts
   out rather than counting as a failure.
2. **Build the grid.** `src/geometry.js` lays out 25 points on a spherical-earth offset,
   centred on the listing (index 12 = `[2,2]`), at 0.5 / 1 / 2 mile spacing.
3. **Rank each point.** Every point runs one Google Maps search *from that coordinate*, and the
   top 20 results are kept. Each of the three businesses is then located in that same list by
   Place ID / CID, falling back to fuzzy title match. Rank `null` means not in the top 20 and
   renders as **20+**.

   If competitors were not named, `rankRivals` scores every business seen anywhere on the grid
   by Σ(21 − rank) — which rewards ranking well *and* often — and takes the top two.
4. **Metrics + takeaway.** Average rank (20+ counts as 21), Top-3 share, and the competitor
   that most often holds #1 where you are not in the Map Pack. `src/takeaway.js` turns the
   grid into "The Good / The Revenue Leak / The Competitive Context" using distances and
   compass directions from the grid itself.
5. **Render.** `src/render.js` draws the card with `@napi-rs/canvas` (bundled Inter font, so
   output is identical on every machine) on top of a muted basemap stitched from map tiles.
   The map carries a scale bar, a north arrow, a dashed outline of the scanned square and a
   dimension bracket labelled with the area covered, all derived from the real projection
   rather than assumed. Default export is 2400 px wide; the PDF adds a second page with the
   takeaway text.

## Rank providers

| `RANK_PROVIDER` | Needs | Notes |
| --- | --- | --- |
| `mock` (default) | nothing | Deterministic per business + keyword. Builds a market of ~27 businesses, then *calibrates* their strengths so the three panels land on "Scenario A": the lead holds about 6 green pins with a red outer edge, while the two rivals hold about 18 and 15. That is the shape the sheet exists to show, so the layout is always tested against it. Typed competitor names are ignored in mock mode — a real company's name on invented numbers would be misleading. |
| `dataforseo` | `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` | `serp/google/maps/live/advanced` with `location_coordinate = "lat,lng,15z"`. 25 tasks per audit. |
| `serpapi` | `SERPAPI_KEY` | `engine=google_maps` with `ll=@lat,lng,15z`. 25 searches per audit. |

Both live adapters live in `src/providers/` and share the same shape
(`resolveBusiness()` + `createRanker()` returning a ranked list), so adding another vendor is
one file. `RANK_CONCURRENCY` bounds parallel calls. The UI's mock toggle overrides the
provider per run; when no live credentials are present it is forced on.

## Basemaps

| `MAP_PROVIDER` | Needs | Look |
| --- | --- | --- |
| `carto` (default) | nothing | CARTO Positron light tiles at 2×. Already muted. |
| `esri` | nothing | Esri World Light Gray Canvas. Keyless second choice; caps at z16. |
| `mapbox` | `MAPBOX_TOKEN` | Static Images API, `mapbox/light-v11` by default. Best looking, one request, fractional zoom, and the only option whose terms clearly cover commercial volume (~50k images/month free). |
| `osm` | nothing | Standard OpenStreetMap tiles. **Never selected automatically.** Volunteer-run servers whose tile usage policy does not cover bulk or commercial use. |
| `none` | nothing | Procedural street pattern. Last resort so a report always renders. |

Providers fail over in order: the configured one, then `carto`, then `esri`, then the offline
pattern. `report.basemap` reports `provider`, `requestedProvider`, `fellBack` and `error`, and both
the UI and the PDF say plainly when a fallback was used.

A refusing tile server is the failure mode worth knowing about: OpenStreetMap answers a blocked app
with **HTTP 200 and a placeholder PNG reading "Access blocked"**, so status codes alone cannot
detect it. `validateTiles` hashes every tile in the view and rejects the map when they all come back
byte-identical, then purges those tiles from the cache. A provider that refuses us is remembered for
the life of the process and skipped on later reports.

Tiles are cached in `.cache/tiles/` so re-running a report is free and polite.

## API

`POST /api/audit` with JSON `{ business, location, keyword, spacingMi, mock, coordinates?, scale? }`
returns `{ id, imageUrl, pdfUrl, jsonUrl, report, takeaway }`. `report.points[]` carries
`row, col, lat, lng, rank, bearing, distanceMi, results[0..4]`. `GET /api/config` tells the UI
what is configured.

## Checkout and compliance

Each audit gets a slug. The printed button links to
`PUBLIC_BASE_URL/audit/<slug>/activate?biz=…&pins=…&lead=…` (older `business`/`currPins`/`leader`
links still work), and the plain-text
fallback `promoflix.ai/audit/<slug>` works on its own because a short public summary is saved per
audit. The checkout page, its two small APIs, the stylesheet and fonts are exempt from
`APP_PASSWORD`, so a prospect never sees the admin prompt; everything else stays gated. Values from
the URL are inserted as text only. The buy button goes to `STRIPE_CHECKOUT_URL` with
`client_reference_id=<slug>` so each payment can be matched to its audit; until that is set it opens
an email instead.

Guard rails built in, each covered by a test:

- **Review solicitation is ungated.** Every customer gets the same link. The FAQ answer about bad
  reviews was rewritten, because "checking in first" before sending the review link is review
  gating, which Google's review policy prohibits and the FTC treats as potentially deceptive.
- **The outreach email** has a factual subject, a signature, and a reply-"no" opt-out, and the app
  warns until `SENDER_POSTAL_ADDRESS` is set, since CAN-SPAM requires a physical postal address and
  a city alone does not qualify. It never claims a review gap or "right near you" that the data
  does not support.
- **Nothing unmeasured is asserted.** "Address, phone, and hours are verified" only appears for
  fields a resolver confirmed; the reply-rate finding is swapped for a measured one when replies
  were not read.
- **Settings → Check setup** flags the launch blockers: no postal address, a 555-01xx phone number,
  a checkout link pointing at localhost, and no Stripe link.

## Front end

No CDN at runtime. Tailwind is compiled to `public/tailwind.css` and Inter is served from
`public/fonts`, because two separate CDN outages (map tiles, then geocoders) already cost this
project a working afternoon. Rebuild the stylesheet after editing markup or class names in JS:

```bash
npm run build:css
```

`npm start` builds it automatically if it is missing.

**Print.** `@page` is `size: letter portrait; margin: 0`, and the 0.35in × 0.4in border is padding on
the report. That is deliberate: Chrome draws its date, URL and "1/1" inside the @page margin, so a
non-zero margin brings them back. The report box is fixed at 8.5in × 11in with overflow hidden so it
can never spill to a second page, and the layout is tested to fit with room to spare: about 0.8in
normally, 0.4in with a very long business name and keyword. In browsers other than Chrome, untick
"Headers and footers" in the print dialog if it appears.

The print layout is enforced by an
`@media print` block that hides the composer and floating bar and tightens type so the audit
lands on a single US Letter page; it is verified in CI-style by rendering the page through a
headless browser's PDF export and asserting the page count.

## Project layout

```
src/server.js        Express app + API
src/cli.js           Standalone CLI
src/report.js        audit -> render -> takeaway -> files
src/audit.js         orchestration + metrics
src/geometry.js      grid math
src/mercator.js      Web Mercator helpers
src/basemap.js       tile stitching / Mapbox static / offline fallback
src/render.js         detail grid renderer (canvas)
src/render-compare.js three-panel comparison sheet (PNG, for email)
src/render-panel.js   one grid panel per business, for the HTML report
src/draw.js           shared canvas primitives and palette
src/candidates.js     archetype selection for step 2
src/executive.js      headline, metric cards, two-column narrative, both emails
src/niches.js         industry vocabulary (tree services, assisted living, generic)
src/offer.js          the one offer/sender definition, and audit links
src/ranks.js          rank bands: 1–3 visible, 4–10 weak, 11+ invisible
src/auditstore.js     public per-audit summaries for the short checkout link
public/checkout.*     the prospect-facing checkout page
src/scanstore.js      holds a scan between step 2 and step 3
src/providers/reviews.js  review velocity and owner reply rate
src/takeaway.js      plain-English copy generator
src/pdf.js           PDF export
src/providers/       mock, dataforseo, serpapi, places (resolution), geocode, match
public/index.html    single-page UI (Tailwind CDN)
assets/fonts/        Inter (OFL)
test/                node:test suites (npm test)
```

## Notes

- Keep `HTTP_USER_AGENT` honest; OSM and Nominatim block generic agents.
- Live runs cost 25 API calls per audit (plus 1–2 for resolution). Start with mock mode to
  check the layout, then flip the toggle for a real prospect.
- Results are searched from the exact coordinate with a 15z viewport, which mirrors what a
  phone user at that spot sees. Rankings can differ slightly from a hand check because Google
  personalises and A/B tests results.
