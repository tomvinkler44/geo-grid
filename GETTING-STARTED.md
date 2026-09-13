# Getting started (no technical skills needed)

There are two ways to run Geo-Grid. Pick one.

---

## Option A – Run it on your own computer (free)

**Step 1. Install Node.js** (a free program the app runs on; one-time, 2 minutes)

- Go to https://nodejs.org/en/download
- Click the big green **LTS** download button, open the installer, click *Next* until it finishes.

**Step 2. Download the app**

- Open https://github.com/tomvinkler44/geo-grid in your browser.
- Click the green **Code** button → **Download ZIP**.
- Unzip it. You get a folder called `geo-grid-…`. Put it somewhere you'll find it again, like Documents.

> If the ZIP only shows the `main` branch and the files below aren't in it, switch the branch
> dropdown (top-left of the GitHub page) to `claude/local-seo-geo-grid-report-xm2278` first.

**Step 3. Start it**

- **Mac:** double-click `Start Geo-Grid.command`.
  The first time, macOS may say it "cannot be opened because it is from an unidentified developer".
  Right-click the file → **Open** → **Open** to allow it (only needed once).
- **Windows:** double-click `Start Geo-Grid.bat`.
  If SmartScreen appears, click *More info* → *Run anyway*.

A black window opens, downloads a few components on the first run (about a minute), and then
your browser opens at http://localhost:3000. Keep the black window open while you use the
app. Close it to stop.

**Step 4. Make your first report**

Type a business name, city, and keyword, leave *Mock mode* ticked, and click **Run Grid Audit**.
You'll get the report image, the metrics, the client takeaway, and download buttons.
Mock mode uses sample rankings so you can see how everything looks without paying for anything.

**Step 5. Turn on real rankings**

Click **⚙ Settings** (top right). Follow the four numbered sections, paste your keys, click
**Save settings**, then **Check setup**. Green ticks mean you're good. Go back, untick
*Mock mode*, and run a real audit.

---

## Option B – Run it as a website (about $7/month, works from any device)

This puts the app on a small server so you just open a link. No installs.

1. Create a free account at https://render.com and connect your GitHub account.
2. In Render, click **New +** → **Blueprint**, choose the `geo-grid` repository and the branch
   `claude/local-seo-geo-grid-report-xm2278` (or `main` once it's merged). Click **Apply**.
3. Wait about three minutes. Render shows a link like `https://geo-grid-xxxx.onrender.com`.
4. The site is password protected. Find the password in Render under your service →
   **Environment** → `APP_PASSWORD`. Any username works.
5. Open the link, go to **⚙ Settings**, paste your keys, save, and check setup.

Note: on Render, settings saved in the app are kept until the next time the code is
redeployed. To make them permanent, add them as environment variables in Render's
**Environment** tab instead (names are in `.env.example`).

---

## What accounts do I need?

| What | Needed for | Where | Cost |
| --- | --- | --- | --- |
| **DataForSEO** *or* **SerpApi** | Real rankings | app.dataforseo.com / serpapi.com | DataForSEO ≈ 5¢ per report, pay as you go. SerpApi has a small free tier, then plans from $75/mo. |
| Google Places API key | Finding the exact listing (optional but recommended) | console.cloud.google.com | Free at this volume |
| Mapbox token | Prettier map (optional) | mapbox.com | Free tier is plenty |

Everything else is free and needs no account.

## Something's wrong?

- Open **Settings → Check setup**. Each line tells you what failed in plain English.
- The report shows a plain grey pattern instead of streets: the map tiles could not be
  downloaded. Check your internet connection, or set a different basemap in Settings.
- "Could not geocode": type the city as `City, ST` (e.g. `San Jose, CA`), or paste the
  business's coordinates from Google Maps into *Advanced → Listing coordinates*.
