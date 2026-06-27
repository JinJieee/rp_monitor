# Réalisation Par Monitor


A serverless background agent that watches a fashion retailer's website and
Gmail inbox for two things ordinary browsing habits miss: sitewide sale
announcements (often buried by Gmail's own Promotions tab) and restocks of
delisted or sold-out styles. Runs entirely on Google's infrastructure via
Apps Script — no server to provision, no third-party API, no cost.

## What it does

- **Sale detection** — scans Gmail for promotional emails from the retailer
  and surfaces them regardless of which tab Gmail sorts them into.
- **Restock detection** — watches specific styles in two different states:
  fully delisted (no live page at all) and "last sale" (page still exists,
  shows sold out). Can be narrowed to one specific size.
- **Price-drop detection** — flags individual price drops on watched items
  even outside of a sitewide sale, and logs a price history for charting.
- **Digest notifications** — every finding from a single run is combined
  into one email (with a product photo, where available) instead of
  spamming a separate message per item.

## Quickstart

1. Create a Google Sheet with three tabs: `Watchlist`, `SaleLog`,
   `PriceHistory` (column headers in [SETUP.md](./SETUP.md)).
2. Create an Apps Script project at [script.new](https://script.new),
   paste in `Code.gs`, and set `SHEET_ID` to your Sheet's ID.
3. Run `testNotification`, authorize the requested Gmail/Sheets/external
   request permissions, then run `setup` once.

Full step-by-step instructions are in [SETUP.md](./SETUP.md).

## Known limitations

- Stock/size/price parsing depends on the target site's current HTML
  structure (specifically the `BCData` block and `og:` meta tags) — a
  redesign on the retailer's end would require updating the parsing logic.
- A single run can occasionally be cut short by Apps Script's execution
  time limit if one page is slow to respond; the next scheduled run starts
  over from the top of the watchlist and self-corrects.
- `SHEET_ID` is read from a constant in `Code.gs` for simplicity. For a
  shared/forked deployment, swapping it to read from Apps Script's Script
  Properties (rather than a hardcoded value) would be a natural next step.

## Stack

Google Apps Script · Gmail API · Google Sheets API · UrlFetchApp (no
external HTTP libraries, no LLM API calls)
