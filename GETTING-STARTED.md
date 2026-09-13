# Start Here

Follow these steps in order. Nothing here requires any technical knowledge.
The whole thing takes about 10 minutes, and most of that is waiting.

---

## Step 1 — Install Node.js (one time only, about 3 minutes)

Node.js is a free, safe program made by a non-profit foundation. It is the
engine this app runs on, the same way Microsoft Word needs Windows.

1. Click this link: **https://nodejs.org/en/download**
2. Click the big green button labelled **LTS**. A file downloads.
3. Open that downloaded file and click **Continue** / **Next** until it says it
   is finished. You do not need to change any options.

You will not see anything new on your screen afterwards. That is normal. Node.js
works quietly in the background.

---

## Step 2 — Download the app (about 1 minute)

Click this link. It downloads a ZIP file straight away, with nothing to click on
GitHub:

**https://github.com/tomvinkler44/geo-grid/archive/refs/heads/claude/local-seo-geo-grid-report-xm2278.zip**

Then:

- **Mac:** the file lands in your Downloads folder and usually unzips itself.
  If you see a ZIP file, double-click it once to unzip.
- **Windows:** find the ZIP in Downloads, right-click it, choose
  **Extract All…**, then click **Extract**.

You now have a folder named something like
`geo-grid-claude-local-seo-geo-grid-report-xm2278`. Drag it to your Desktop so
it is easy to find. You can rename it to just `geo-grid` if you like.

---

## Step 3 — Start the app

Open that folder. Inside you will see a long list of files. Find the one called
**Start Geo-Grid** and double-click it.

- On a **Mac** it is called `Start Geo-Grid.command`.
- On **Windows** it is called `Start Geo-Grid.bat`.

**The first time only**, your computer will try to protect you from a file it
downloaded from the internet:

- **Mac** says *"cannot be opened because it is from an unidentified developer"*.
  Click **OK**. Then **right-click** (or hold Control and click) on
  `Start Geo-Grid.command`, choose **Open** from the menu, and click **Open** in
  the box that appears. You only ever do this once.
- **Windows** shows a blue *"Windows protected your PC"* box. Click
  **More info**, then **Run anyway**.

A black window opens with white text. The first time, it spends about a minute
downloading the app's parts. Then your web browser opens by itself and shows the
app.

**Leave the black window open.** It is the app's engine. Closing it stops the
app. When you are finished for the day, just close it.

To use the app again tomorrow, double-click **Start Geo-Grid** again. It will be
much faster the second time.

---

## Step 4 — Make your first report (1 minute)

In the browser window that opened:

1. Type a business name, for example `Pacific Coast Heating & AC`.
2. Type a city and state, for example `San Jose, CA`.
3. Type a search phrase, for example `furnace repair near me`.
4. Leave **Mock mode** ticked. This uses made-up sample rankings so you can see
   how everything looks without paying anything.
5. Click **Run Grid Audit** and wait a few seconds.

You get the report picture, the numbers underneath, the written client summary,
and buttons to download a PNG or PDF and to copy the email text.

Make two or three of these to get a feel for it. They cost nothing.

---

## Step 5 — Switch on real rankings (when you are ready)

Mock reports look right but the numbers are invented. To get real Google rankings
you need an account with a data provider. This is the only part that costs money.

1. Go to **https://app.dataforseo.com** and create an account. Add a small amount
   of credit, $20 goes a long way. Each report costs about 5 cents.
2. In DataForSEO, open the **API Access** page. You will see your login email and
   an **API password**. This is different from the password you log in with.
3. Back in the Geo-Grid app, click the **⚙ Settings** button in the top-right corner.
4. In section 1, choose **DataForSEO** from the dropdown, then paste your login
   email and API password into the two boxes.
5. Click **Save settings**, then click **Check setup**.
   Green ticks mean it works. Red crosses explain what is wrong in plain English.
6. Go back to the main page and **untick Mock mode**. Now your reports use real data.

While you are in Settings, section 4 lets you put your own name and website on
every report. Worth doing before you send any out.

---

## If something goes wrong

**The black window closes instantly, or nothing happens.**
Node.js probably is not installed. Go back to Step 1.

**Mac: double-clicking opens the file in a text editor instead of running it.**
Right-click the file, choose **Open With**, then **Terminal**.

**The report shows a plain grey pattern instead of streets.**
The map images could not be downloaded. Check your internet connection, then in
Settings section 3 try switching the basemap to **CARTO light**.

**It says "Could not geocode".**
Write the location as city and state with a comma, like `San Jose, CA`. If it
still fails, open Google Maps, right-click the business, click the numbers at
the top of the menu to copy them, and paste them into **Advanced → Listing
coordinates** in the app.

**Anything else.**
Click **⚙ Settings**, then **Check setup**. It tests each piece and tells you
which one failed. Send that screen over and it can be fixed.

---

## Running it as a website instead (optional)

If you would rather not install anything and want to open the app from your
phone or any computer, it can live on a small server for about $7 a month.

1. Create a free account at **https://render.com** and connect your GitHub account.
2. Click **New +**, then **Blueprint**. Pick the `geo-grid` repository and the
   branch `claude/local-seo-geo-grid-report-xm2278`. Click **Apply**.
3. Wait about three minutes. Render gives you a web address.
4. The site asks for a password. Find it in Render under your service →
   **Environment** → `APP_PASSWORD`. Any username works.
5. Open the address, click **⚙ Settings**, and follow Step 5 above.

One caveat: on Render, settings you save in the app are wiped whenever the code
is updated. To make them permanent, add them in Render's **Environment** tab
instead. The names to use are listed in the `.env.example` file.

---

## What things cost

| What | What it is for | Cost |
| --- | --- | --- |
| Node.js | Runs the app | Free |
| The app itself | Makes the reports | Free |
| Map images | The streets behind the dots | Free |
| **DataForSEO** *or* **SerpApi** | **Real Google rankings** | **DataForSEO ≈ 5¢ per report. SerpApi has a small free tier, then $75/month.** |
| Google Places key | Pinpointing the exact business listing | Free at this volume |
| Mapbox token | A slightly prettier map | Free at this volume |
| Render hosting | Running it as a website instead | About $7/month |

You only ever need one of DataForSEO or SerpApi. Everything else is optional.
