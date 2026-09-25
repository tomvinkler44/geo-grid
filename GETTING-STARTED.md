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

In the browser window that opened you will see a form on the left with four
numbered steps along the top. It walks you through them one at a time.

**Step 1 — the business**

1. Business name, for example `Pacific Coast Assisted Living`.
2. City and state, for example `Sunnyvale, CA`.
3. Street address is optional. Fill it in when several businesses nearby have
   similar names, so the right one is picked.
4. The search phrase, for example `assisted living sunnyvale`.
5. Watch the **Grid spacing** box: as you type the city it picks a size for you, with a short green note saying why. You can change it, but the suggestion is usually right. Leave **Mock mode** ticked. Mock mode
   invents sample data so you can see how everything works without paying.
6. Click **Scan market & find competitors**. This is the part that takes a
   moment, because it searches from 25 different points.

**Step 2 — the competitors**

Two cards appear. The app has picked them for you:

- **Market Dominator** is the big name in the area: the most reviewed of the
  businesses that show up almost everywhere on the map.
- **Nearby Direct Peer** is a rival round the corner that is still ahead of
  your client.

Each card shows the review count, the star rating, and one line saying why it
was chosen. If you already know who the client keeps losing to, click
**change** on either card and type a name instead.

**Step 3 — generate**

Click **Approve Rivals & Generate Executive Audit**. This is quick, because it
reuses the scan from step 2 rather than running another one. You are never
charged twice.

**Step 4 — the report**

Before you generate, you can click **Copy permission outreach email** in step 2. That is the short first email asking the owner whether they'd like the report. Send that first, and the audit once they say yes.

A one-page audit appears on the right:

- A big percentage at the top: how much of the local market puts them in the
  top three.
- Three maps side by side: your client, then the two rivals.
- Three cards explaining why searchers pick the rivals.
- A headline saying what share of local searches they win, next to the market leader.
- Two short columns: how they rank today, and what moves the pins.
- A grey box at the bottom with your price, a green button that opens the prospect's personal checkout page, what they get each month, and the guarantee.
- Your offer and price at the bottom.

Bottom right of the screen there are two buttons. **Export / Print PDF** opens
your printer dialog, already laid out to fit one page; choose "Save as PDF" to
get a file to attach; the button inside it stays clickable. **Copy Report Email** puts the written pitch on your
clipboard, ready to paste into an email.

To change the offer and price at the bottom of the report, open **⚙ Settings**
and scroll to section 5.

## Step 5 — Switch on real rankings (when you are ready)

Mock reports look right but the numbers are invented. To get real Google rankings
you need an account with a data provider. This is the only part that costs money.

1. Create an account with a data provider. **SerpApi** at https://serpapi.com is
   the one to pick if you want all three cards on the report filled in, because
   it can also read review dates and owner replies in a single call.
   **DataForSEO** at https://app.dataforseo.com is cheaper per report but its
   reviews lookup is slower and sometimes times out, in which case two of the
   three cards will say "not measured" instead of showing a number.
   Either way, add a small amount of credit to start.
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

**The report is covered in "Access blocked" text.**
That came from OpenStreetMap's map servers, which are run by volunteers and
block apps that use them for commercial work. The app now detects this and
switches to a different map service by itself. If you still see it, open
**⚙ Settings**, section 3, and choose **CARTO Positron**.

**The report shows a plain grey pattern instead of streets.**
No map service could be reached at all. Check your internet connection, and turn
off any VPN. The yellow bar above the report names exactly which services were
tried and what each one said.

**The map says something about an API key.**
Some map services now want you to sign up. Open **⚙ Settings**, go to section 3,
and click **Test every map service**. It tries each one from your computer and
shows you which actually work, so you can pick one with a green tick. If none
work, a free Mapbox token takes two minutes and there is a link on that page.

**It says "We could not find that location".**
The app tries three independent address-lookup services before giving up, so
this usually means your internet connection dropped, or a VPN is making those
services refuse you. Turn the VPN off and try again.

The guaranteed way past it: open Google Maps, right-click the business, and
click the row of numbers at the top of the menu. That copies its coordinates.
Paste them into **Advanced → Listing coordinates** in the app. The app opens
that box for you automatically when a lookup fails.

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
