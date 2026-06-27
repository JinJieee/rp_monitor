# Setup guide

Once it's running, every 30 minutes it will:
1. Check Gmail for sale emails from the retailer
2. Check the retailer's website for the specific styles being watched
3. Email a summary of anything it finds, from your own Gmail account to
   yourself

It uses two free Google tools together:
- **Google Sheets** — the place where you list which styles to watch, and
  where results get written
- **Google Apps Script** — runs the checking logic on a timer, and sends
  the notification emails

Notifications arrive as a normal email sent from your own Gmail account to
yourself. Because it's a plain self-to-self message (not bulk/marketing
mail), Gmail's automatic sorting essentially never routes it into the
Promotions tab the way a retailer's own marketing emails often do.

### Two ways a style can disappear, and why this matters

Retailers commonly do this in two different ways, and the watchlist handles
both — fill in different columns depending on which one applies:

- **Fully delisted** — the style vanishes completely, no page, no link,
  nothing. For these, fill in only a **Keyword** (e.g. the style name).
  The script scans the shop's catalog page looking for that name to
  reappear.
- **"Last sale" / sold out in every size** — the product page is still
  live and clickable, but every size shows no stock. For these, also fill
  in the actual **Product URL**. The script checks that exact page
  directly for a true "in stock across all sizes" signal, which is far
  more accurate than just scanning the catalog grid.
- **Only care about one specific size** — fill in **Product URL** and also
  the **Size** column (e.g. `M`, `XL`). The script will only notify when
  that exact size comes back, not just any size.

All three columns are covered in the spreadsheet steps below.

### Price drops

Separately from restocks, any row with a **Product URL** is also checked
for price drops every run — even outside of a sitewide sale, in case a
single style quietly drops in price on its own. The script remembers the
price it saw last time (in the **LastPrice** column) and includes it in
that run's notification email only when the new price is lower than that.
This only works for rows that have a Product URL; keyword-only rows (fully
delisted items) have no live page to read a price from.

### One email per check, not one per item

If a single check finds several things at once (say, two restocks and a
price drop), it sends **one combined email** listing all of them, rather
than several separate emails landing back-to-back. If nothing changed, no
email is sent for that check. For rows with a Product URL, the email also
includes a photo of the item pulled straight from its product page —
keyword-only rows (fully delisted items) don't get a photo, since there's
no live page to pull one from.

### Charting price history

Every time a watched item's price changes, a row gets added to the
`PriceHistory` tab (`Date`, `Label`, `Price`). To turn that into a chart:

1. Once there are a few rows of data in `PriceHistory`, select the data
   (including the header row).
2. Go to **Insert → Chart** in the Google Sheets menu.
3. Pick **Line chart** in the chart editor that opens on the right.

The chart updates automatically as new rows get appended. If tracking
several different items in the same sheet and wanting a separate chart per
item, filter the data first (e.g. **Data → Create a filter view**) before
inserting the chart.

---

## Part 1 — Create the spreadsheet

1. Go to **sheets.new** in a browser (this opens a new blank Google Sheet
   instantly).
2. At the top left, click "Untitled spreadsheet" and rename it to
   something like `RP Monitor`.
3. Look at the bottom of the screen — there's a tab that says `Sheet1`.
   Right-click it, choose **Rename**, and rename it to exactly: `Watchlist`
4. In row 1 of that `Watchlist` tab, type these seven headers, one per cell:

   | A1 | B1 | C1 | D1 | E1 | F1 | G1 |
   |---|---|---|---|---|---|---|
   | Keyword | Product URL | Size | Notes | Status | LastChecked | LastPrice |

5. In row 2 onward, add the styles to watch — one per row.

   - For a style that's **fully gone** (no page at all), just fill in
     column A:

     | A (Keyword) | B (Product URL) | C (Size) | D (Notes) |
     |---|---|---|---|
     | Mathilde | | | the one that got delisted entirely |

   - For a style that's **still live but sold out in every size**, fill in
     both A and B — paste the actual product page link into column B, and
     leave Size blank to mean "notify if ANY size comes back":

     | A (Keyword) | B (Product URL) | C (Size) | D (Notes) |
     |---|---|---|---|
     | Gia Havana | https://int.realisationpar.com/the-gia-havana/ | | marked last sale |

   - To only care about **one specific size**, also fill in column C:

     | A (Keyword) | B (Product URL) | C (Size) | D (Notes) |
     |---|---|---|---|
     | Meg Rosette | https://int.realisationpar.com/the-meg-rosette/ | XL | only want XL |

   Leave columns E, F, and G empty — the script fills those in automatically
   (Status gets `In Stock`, `Out of Stock`, or `Not Found`; LastChecked gets
   a timestamp; LastPrice gets whatever price it last saw on that page, and
   is only filled in for rows with a Product URL).

6. Add a second tab. Click the **+** button at the bottom left (next to the
   `Watchlist` tab) to add a new sheet. Rename this one to exactly:
   `SaleLog`
7. In row 1 of `SaleLog`, type any header, e.g. `Date`, `Subject`,
   `Snippet` — this tab fills up automatically over time as a history log,
   nothing else to do here.
8. Add a third tab the same way, rename it to exactly: `PriceHistory`
9. In row 1 of `PriceHistory`, type three headers: `Date`, `Label`, `Price`
   — like `SaleLog`, this fills up automatically (one row every time a
   watched item's price changes) and is what a chart gets built from later
   (see "Charting price history" above).
10. Look at the address bar of the browser. The URL looks like this:

    ```
    https://docs.google.com/spreadsheets/d/1AbCxyz123_THIS_PART_IS_YOUR_ID/edit
    ```

    Copy the long part between `/d/` and `/edit` — that's the **Sheet ID**.
    Save it somewhere — it gets pasted into the code in Part 2.

---

## Part 2 — Create the Apps Script project

1. Go to **script.new** in a browser. This opens a blank Apps Script
   project automatically.
2. There's a file called `Code.gs` already open, with some default text
   inside (probably just `function myFunction() {}`). Select all of that
   text and delete it.
3. Open this repo's `Code.gs`, copy its entire contents, and paste it into
   that empty file.
4. Near the top of the pasted code, there's this line:

   ```
   const SHEET_ID = 'PASTE YOUR GOOGLE SHEET ID HERE';
   ```

   Replace the placeholder text between the quotes with the Sheet ID from
   Part 1, step 10. Keep the quote marks. It should look something like:

   ```
   const SHEET_ID = '1AbCxyz123example';
   ```

5. At the top left, click the project name ("Untitled project") and rename
   it to something like `RP Monitor`.
6. Press **Ctrl+S** (Windows) or **Cmd+S** (Mac) to save.

---

## Part 3 — Grant permission to read and send Gmail

This step looks scarier than it is — it's Google's standard warning for any
personal script, because it hasn't gone through their public-app review
(which is only required for apps meant for the public, not for a script
only one person uses).

1. Near the top of the Apps Script screen, there's a row of buttons
   including a dropdown that lists function names, and a **Run** button
   (▶ triangle icon).
2. Click that dropdown and select `testNotification`.
3. Click **Run** (▶).
4. A popup titled "Authorization required" appears. Click
   **Review permissions**.
5. Choose the Google account.
6. A screen saying "Google hasn't verified this app" will likely appear.
   Click **Advanced** (small text link), then click
   **Go to RP Monitor (unsafe)**.
   This warning is normal and expected — it just means this script wasn't
   submitted for Google's public app review, because only one person uses
   it.
7. Click **Allow** on the permissions screen.
8. Check the Gmail inbox — there should be an email titled
   "Test notification" within a few seconds.

If it doesn't arrive, check the Spam folder once, then check the
**Execution log** at the bottom of the Apps Script screen for an error
message.

---

## Part 4 — Turn on automatic checking

1. In the function dropdown, select `setup`.
2. Click **Run** (▶).
3. This creates two scheduled jobs that run automatically every 30 minutes
   from then on — one checks email, one checks the website.
4. Confirm this worked by clicking the clock icon on the left sidebar
   (labeled **Triggers**) — two entries should be listed there.
5. An email titled "Setup complete" should also arrive right away.

That's it. From then on this runs by itself in the background — no need to
keep the browser tab open.

---

## Using it day to day

- **Add a new style to watch:** open the Google Sheet, go to the
  `Watchlist` tab, and type a new row. Just column A (Keyword) if the style
  has no live page at all; columns A and B (Keyword + Product URL) if the
  page exists but shows sold out everywhere; add column C (Size) too to
  only care about one specific size. No code changes needed.
- **See sale history over time:** check the `SaleLog` tab — it fills up
  automatically every time a sale email is detected.
- **Change how often it checks:** open the Apps Script project, click the
  clock icon (**Triggers**) on the left, and edit the frequency there.
- **Narrow the website scan to dresses only (affects Keyword-only rows):**
  in `Code.gs`, find `CATALOG_PAGES_TO_SCAN` and change `/shop/everything/`
  to `/shop/dresses/`.

---

## Troubleshooting

- **No email at all:** check Spam once, then check the **Execution log** in
  Apps Script for an error under `testNotification` or `setup`.
- **Error mentioning "Sheet tab not found":** tabs must be named exactly
  `Watchlist`, `SaleLog`, and `PriceHistory` (capital letters matter). A
  missing `PriceHistory` tab only disables price-history logging — it
  won't break restock or price-drop checking itself.
- **A sale email didn't trigger a notification:** open `Code.gs`, find the
  list called `SALE_KEYWORDS`, and add a word/phrase from that email's
  subject line.
- **A row with a Product URL keeps showing "Not Found":** double-check the
  link was copied in full and starts with `https://`. If the link is fine
  but it's still wrong, the site may have changed how it marks stock
  status — see "Known limitations" in the main README.
- **Only some rows in Watchlist got their Status/LastChecked updated, and
  the rest are still blank:** this usually means a single run hit Apps
  Script's execution time limit partway through (most often because one
  particular row's page was slow to load) and got cut off. Since every run
  starts over from row 1, the next scheduled run usually picks up the
  remaining rows automatically. If the *same* row keeps being the one that
  never finishes, open that row's Product URL directly to check it loads —
  if it does, check that run's entry in the Apps Script **Executions**
  page (including its duration) to track down the bottleneck.
  
  
  
