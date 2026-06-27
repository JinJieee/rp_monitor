/**
 * ============================================================
 * Réalisation Par Monitor
 * Feature 1: Watch Gmail for sale/promo emails (works even though
 *            Gmail sorts these into the Promotions tab)
 * Feature 2: Watch for specific styles coming back, in two ways:
 *            (a) fully delisted styles with no live page -> scan
 *                the catalog page for the keyword to reappear
 *            (b) "last sale" styles whose page still exists but
 *                shows sold-out -> check that exact product page's
 *                stock status directly (works for "sold out in
 *                every size" even when the catalog grid doesn't
 *                flag it as out of stock) — optionally down to one
 *                specific size, if you only care about that size
 * Feature 3: Watch for individual price drops on items with a Product URL
 *            on file, even outside of a sitewide sale (compares each
 *            check's price against the last one recorded), and log every
 *            price change to a "PriceHistory" tab for charting
 * All restock/price-drop findings from one checkRestocks() run are sent as
 * a single combined email rather than one email per item.
 * Notifications: sent to your own Gmail inbox (no third-party service)
 * ============================================================
 *
 * One-time setup required before this works (see README):
 * 1. Create a Google Sheet and paste its ID into SHEET_ID below
 * 2. Add three tabs to that Sheet: "Watchlist", "SaleLog", and
 *    "PriceHistory" (see README for the expected column headers)
 * 3. Run the setup() function once (it creates the time triggers)
 */

// ====================== Required configuration ======================

const SHEET_ID = 'PASTE YOUR GOOGLE SHEET ID HERE';   // the long string in the Sheet URL between /d/ and /edit

// Website settings
const SHOP_BASE_URL = 'https://int.realisationpar.com';
const CATALOG_PAGES_TO_SCAN = [
  // Used only as a fallback for rows that have no Product URL filled in.
  // Default: scan the full "Everything" catalog page.
  // If you only care about dresses, swap this for '/shop/dresses/' to scan less and run faster.
  '/shop/everything/',
];

// Email monitoring settings: sender domain + keywords that suggest a sale (any one match is enough)
const SENDER_QUERY = 'from:(realisationpar.com)';
const SALE_KEYWORDS = [
  'sale', '% off', 'percent off', 'off everything', 'off sitewide',
  'final hours', 'last chance', 'flash sale', 'discount'
];
// How many days back to search each run — wide enough to not miss anything, narrow enough to stay fast
const EMAIL_LOOKBACK_DAYS = 3;

// Status values written into the Watchlist sheet's "Status" column
const STATUS_IN_STOCK = 'In Stock';
const STATUS_OUT_OF_STOCK = 'Out of Stock';
const STATUS_NOT_FOUND = 'Not Found';

// ====================== Helper functions ======================

function getSheet_(name) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Sheet tab not found: ' + name + ' — check the tab name in your spreadsheet');
  return sh;
}

// Send a notification email to yourself, using your own Gmail account.
// No external service, no rate limits shared with strangers, no extra app
// to install — this is why it's simpler and more reliable than a
// third-party push service. Sent from-you-to-you, so Gmail's
// spam/promotions classifier essentially never routes these elsewhere.
//
// kind controls the color/label of the email card: 'sale', 'restock', or
// 'system'. Emoji are deliberately avoided in the subject line - Apps
// Script's mail sender sometimes mis-encodes them there (showing up as
// garbled boxes), even though the same characters are fine in the body.
const EMAIL_STYLES_ = {
  sale:    { label: 'SALE ALERT',    color: '#D85A30' }, // coral
  restock: { label: 'BACK IN STOCK', color: '#0F6E56' }, // teal
  price:   { label: 'PRICE DROP',    color: '#BA7517' }, // amber
  system:  { label: 'SYSTEM',        color: '#5F5E5A' }, // neutral gray
};

function notify_(title, message, url, kind) {
  const recipient = Session.getActiveUser().getEmail();
  const style = EMAIL_STYLES_[kind] || EMAIL_STYLES_.system;

  const plainBody = message + (url ? '\n\n' + url : '');

  const buttonHtml = url
    ? `<a href="${url}" style="display:inline-block;background-color:${style.color};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;font-weight:500;margin-top:4px;">View on site &rarr;</a>`
    : '';

  const htmlBody = `
    <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;">
      <div style="background-color:${style.color};color:#ffffff;padding:16px 20px;border-radius:8px 8px 0 0;">
        <div style="font-size:12px;letter-spacing:0.5px;text-transform:uppercase;opacity:0.85;">${style.label}</div>
        <div style="font-size:18px;font-weight:600;margin-top:4px;">${title}</div>
      </div>
      <div style="border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px;padding:20px;">
        <p style="font-size:15px;color:#333333;line-height:1.5;margin:0 0 16px 0;">${message}</p>
        ${buttonHtml}
        <p style="font-size:12px;color:#999999;margin:20px 0 0 0;border-top:1px solid #f0f0f0;padding-top:12px;">R&#xE9;alisation Par Monitor</p>
      </div>
    </div>
  `;

  try {
    GmailApp.sendEmail(recipient, title, plainBody, { htmlBody: htmlBody });
  } catch (e) {
    console.error('Failed to send notification email: ' + e);
  }
}

// Sends ONE combined email for every restock/price-drop event found in a
// single checkRestocks() run, instead of a separate email per item. Each
// event becomes its own colour-coded row inside the same email. Sends
// nothing at all if the events array is empty.
function notifyDigest_(events) {
  if (!events || events.length === 0) return;

  const recipient = Session.getActiveUser().getEmail();

  const plainBody = events
    .map(e => `[${(EMAIL_STYLES_[e.type] || EMAIL_STYLES_.system).label}] ${e.title}: ${e.message}` + (e.url ? ' ' + e.url : ''))
    .join('\n\n');

  const itemsHtml = events.map(e => {
    const style = EMAIL_STYLES_[e.type] || EMAIL_STYLES_.system;
    const linkHtml = e.url
      ? `<a href="${e.url}" style="color:${style.color};text-decoration:none;font-size:13px;font-weight:500;">View on site &rarr;</a>`
      : '';
    const imageHtml = e.imageUrl
      ? `<img src="${e.imageUrl}" alt="" style="width:100%;max-width:180px;border-radius:4px;display:block;margin-bottom:8px;">`
      : '';
    return `
      <div style="border-left:3px solid ${style.color};padding:10px 14px;margin-bottom:10px;background:#fafafa;border-radius:0 4px 4px 0;">
        ${imageHtml}
        <div style="font-size:11px;letter-spacing:0.5px;text-transform:uppercase;color:${style.color};font-weight:600;margin-bottom:2px;">${style.label}</div>
        <div style="font-size:14px;color:#222222;font-weight:500;margin-bottom:2px;">${e.title}</div>
        <div style="font-size:13px;color:#555555;margin-bottom:6px;">${e.message}</div>
        ${linkHtml}
      </div>
    `;
  }).join('');

  const subjectTitle = events.length === 1
    ? events[0].title
    : `${events.length} updates from your watchlist`;

  const htmlBody = `
    <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;">
      <div style="background-color:#5F5E5A;color:#ffffff;padding:16px 20px;border-radius:8px 8px 0 0;">
        <div style="font-size:12px;letter-spacing:0.5px;text-transform:uppercase;opacity:0.85;">WATCHLIST UPDATE</div>
        <div style="font-size:18px;font-weight:600;margin-top:4px;">${events.length} update${events.length > 1 ? 's' : ''} this check</div>
      </div>
      <div style="border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px;padding:16px;">
        ${itemsHtml}
        <p style="font-size:12px;color:#999999;margin:12px 0 0 0;border-top:1px solid #f0f0f0;padding-top:12px;">R&#xE9;alisation Par Monitor</p>
      </div>
    </div>
  `;

  try {
    GmailApp.sendEmail(recipient, subjectTitle, plainBody, { htmlBody: htmlBody });
  } catch (e) {
    console.error('Failed to send digest email: ' + e);
  }
}

// Track already-processed email IDs so we don't notify twice for the same message
// (stored in Script Properties, capped at the most recent 300 entries)
function getProcessedIds_() {
  const raw = PropertiesService.getScriptProperties().getProperty('processedEmailIds');
  return raw ? JSON.parse(raw) : [];
}
function addProcessedId_(id) {
  let ids = getProcessedIds_();
  ids.push(id);
  if (ids.length > 300) ids = ids.slice(ids.length - 300); // keep only the most recent 300 to avoid unbounded growth
  PropertiesService.getScriptProperties().setProperty('processedEmailIds', JSON.stringify(ids));
}

// ====================== Feature 1: sale email monitoring ======================

function checkSaleEmails() {
  const query = `${SENDER_QUERY} newer_than:${EMAIL_LOOKBACK_DAYS}d`;
  const threads = GmailApp.search(query, 0, 50);
  const processedIds = getProcessedIds_();

  threads.forEach(thread => {
    const messages = thread.getMessages();
    messages.forEach(msg => {
      const id = msg.getId();
      if (processedIds.indexOf(id) !== -1) return; // already handled, skip

      const subject = msg.getSubject() || '';
      const body = msg.getPlainBody() || '';
      const combined = (subject + ' ' + body).toLowerCase();

      const isSale = SALE_KEYWORDS.some(kw => combined.indexOf(kw.toLowerCase()) !== -1);

      if (isSale) {
        notify_(
          'Réalisation Par might be having a sale!',
          subject,
          null,
          'sale'
        );
        logSale_(subject, body.substring(0, 200), msg.getDate());
      }

      addProcessedId_(id); // mark as handled regardless, so we never re-scan this email again
    });
  });
}

function logSale_(subject, snippet, date) {
  const sh = getSheet_('SaleLog');
  sh.appendRow([date, subject, snippet]);
}

// ====================== Feature 2: restock monitoring ======================
//
// Each row in Watchlist can work in one of two modes:
//
// Mode A — "Product URL" column is filled in:
//   Used for items whose page still exists (e.g. marked "last sale") but
//   show sold out in every size. We fetch that exact page and read its
//   og:availability meta tag, which BigCommerce sets to "instock" or "oos"
//   based on total stock across ALL sizes — this is reliable even when the
//   catalog grid doesn't visibly flag the product as out of stock.
//   If the "Size" column is also filled in (e.g. "M"), we instead check
//   that exact size's own availability via the page's embedded BCData
//   block, so you're only notified when YOUR size comes back — not just
//   any size.
//
// Mode B — "Product URL" column is empty, only "Keyword" is filled in:
//   Used for items that have been fully delisted and have no live page at
//   all. We scan the catalog listing page(s) and check whether the keyword
//   has reappeared, and whether it's tagged "out of stock" there.

function checkRestocks() {
  const sh = getSheet_('Watchlist');
  const data = sh.getDataRange().getValues();
  // Header row: Keyword | Product URL | Size | Notes | Status | LastChecked | LastPrice
  if (data.length < 2) return;

  let catalogHtml = null; // only fetched if at least one row actually needs it (Mode B)
  const events = []; // collected across all rows, sent as one digest email at the end

  for (let row = 1; row < data.length; row++) {
    const keyword = (data[row][0] || '').toString().trim();
    const productUrl = (data[row][1] || '').toString().trim();
    const desiredSize = (data[row][2] || '').toString().trim();
    if (!keyword && !productUrl) continue;

    const prevStatus = data[row][4];
    const prevPrice = data[row][6];
    const label = keyword || productUrl;
    let newStatus;
    let newPrice = null;
    let imageUrl = null;

    if (productUrl) {
      // Mode A: check the exact product page directly (optionally for one specific size)
      const result = checkProductUrlStatus_(productUrl, desiredSize || null);
      newStatus = result.status;
      newPrice = result.price; // only available for Mode A — Mode B has no single page to read a price from
      imageUrl = result.imageUrl; // same limitation — only available for Mode A
    } else {
      // Mode B: fall back to scanning the catalog listing for the keyword
      if (catalogHtml === null) catalogHtml = fetchCatalogHtml_();
      newStatus = checkKeywordStatus_(catalogHtml, keyword);
    }

    // Restock event: only when status flips from unavailable -> in stock, to avoid repeated nagging
    const wasUnavailable = (prevStatus === STATUS_OUT_OF_STOCK || prevStatus === STATUS_NOT_FOUND || !prevStatus);
    if (wasUnavailable && newStatus === STATUS_IN_STOCK) {
      const sizeNote = desiredSize ? ` (size ${desiredSize})` : '';
      events.push({
        type: 'restock',
        title: 'Back in stock!',
        message: `"${label}"${sizeNote} is now available — go grab it!`,
        url: productUrl || (SHOP_BASE_URL + CATALOG_PAGES_TO_SCAN[0]),
        imageUrl: imageUrl,
      });
    }

    // Price-drop event: only fires once a previous price is on record and the new one is lower
    if (newPrice !== null && typeof prevPrice === 'number' && newPrice < prevPrice) {
      events.push({
        type: 'price',
        title: 'Price drop!',
        message: `"${label}" dropped from $${prevPrice} to $${newPrice}`,
        url: productUrl,
        imageUrl: imageUrl,
      });
    }

    // Price history log: one row per observed price CHANGE (including the first time
    // a price is seen), so a chart built from this sheet shows clean steps over time
    // rather than one row per 30-minute check regardless of whether anything moved.
    if (newPrice !== null && newPrice !== prevPrice) {
      logPriceHistory_(label, newPrice);
    }

    sh.getRange(row + 1, 5).setValue(newStatus);      // Status column
    sh.getRange(row + 1, 6).setValue(new Date());     // LastChecked column
    if (newPrice !== null) sh.getRange(row + 1, 7).setValue(newPrice); // LastPrice column
  }

  notifyDigest_(events);
}

// Appends one row to the "PriceHistory" tab: Date | Label | Price.
// Designed to degrade gracefully (just logs an error, doesn't throw) if
// that tab doesn't exist yet, so adding this feature can never break the
// restock/price-drop checks above even before you've created the tab.
function logPriceHistory_(label, price) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sh = ss.getSheetByName('PriceHistory');
    if (!sh) {
      console.error('PriceHistory tab not found - skipping price history log. See README to add it.');
      return;
    }
    sh.appendRow([new Date(), label, price]);
  } catch (e) {
    console.error('Failed to log price history: ' + e);
  }
}

// Fetch and concatenate all configured catalog pages (used for Mode B rows only)
function fetchCatalogHtml_() {
  let html = '';
  CATALOG_PAGES_TO_SCAN.forEach(path => {
    try {
      const resp = UrlFetchApp.fetch(SHOP_BASE_URL + path, { muteHttpExceptions: true });
      html += resp.getContentText();
    } catch (e) {
      console.error('Failed to fetch page: ' + path + ' ' + e);
    }
  });
  return html;
}

// Mode A: fetch one specific product page and read its true stock status,
// plus its current price (for price-drop detection) and its representative
// photo (for showing in the notification email). If desiredSize is given,
// checks that exact size's availability using the page's embedded BCData
// block — this catches "in stock overall but not in my size" cases that
// og:availability can't. If desiredSize is omitted, falls back to the
// overall og:availability check (true if ANY size is purchasable).
// Returns { status, price, imageUrl } — price/imageUrl are null if they
// couldn't be read.
function checkProductUrlStatus_(url, desiredSize) {
  try {
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const code = resp.getResponseCode();
    if (code === 404) return { status: STATUS_NOT_FOUND, price: null, imageUrl: null }; // the page is genuinely gone

    const html = resp.getContentText();
    return {
      status: resolveStockStatus_(html, desiredSize),
      price: getPrice_(html),
      imageUrl: getImageUrl_(html),
    };
  } catch (e) {
    console.error('Failed to fetch product url: ' + url + ' ' + e);
    return { status: STATUS_NOT_FOUND, price: null, imageUrl: null };
  }
}

// Pulls product_attributes.price.without_tax.value out of the same BCData
// block used for size checking — same page, same fetch, no extra request.
function getPrice_(html) {
  const bcMatch = html.match(/var BCData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  if (!bcMatch) return null;
  try {
    const bcData = JSON.parse(bcMatch[1]);
    const price = bcData.product_attributes
      && bcData.product_attributes.price
      && bcData.product_attributes.price.without_tax
      && bcData.product_attributes.price.without_tax.value;
    return (typeof price === 'number') ? price : null;
  } catch (e) {
    return null;
  }
}

// Resolves a fetched page's HTML into one of the three Status values,
// optionally narrowed to one specific size. Shared by checkProductUrlStatus_.
function resolveStockStatus_(html, desiredSize) {
  if (desiredSize) {
    const sizeInStock = checkSizeStatus_(html, desiredSize);
    if (sizeInStock === null) return STATUS_NOT_FOUND;
    return sizeInStock ? STATUS_IN_STOCK : STATUS_OUT_OF_STOCK;
  }
  const availability = getAvailability_(html);
  if (availability === 'instock') return STATUS_IN_STOCK;
  if (availability === 'oos') return STATUS_OUT_OF_STOCK;
  return STATUS_NOT_FOUND;
}

// Checks whether one specific size (e.g. "M", "XL") is in stock, using two
// pieces embedded directly in the static page HTML (no extra request needed):
// 1. Each size button carries a numeric ID:
//    data-size-code="XL" data-product-attribute-value="85"
// 2. A script tag defines `var BCData = {...}` whose
//    product_attributes.in_stock_attributes is the list of numeric IDs that
//    currently have stock.
// Cross-referencing the two tells us if this exact size's ID is in that list.
// Returns true/false, or null if either piece couldn't be found/parsed.
function checkSizeStatus_(html, desiredSize) {
  const bcMatch = html.match(/var BCData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  if (!bcMatch) return null;

  let bcData;
  try {
    bcData = JSON.parse(bcMatch[1]);
  } catch (e) {
    return null;
  }
  const inStockIds = (bcData.product_attributes && bcData.product_attributes.in_stock_attributes) || [];

  // Build a size-code -> attribute-value-id map, handling either attribute order
  const sizeMap = {};
  const re1 = /data-size-code="([^"]+)"[^>]*data-product-attribute-value="(\d+)"/g;
  const re2 = /data-product-attribute-value="(\d+)"[^>]*data-size-code="([^"]+)"/g;
  let mm;
  while ((mm = re1.exec(html)) !== null) sizeMap[mm[1].toUpperCase()] = parseInt(mm[2], 10);
  while ((mm = re2.exec(html)) !== null) sizeMap[mm[2].toUpperCase()] = parseInt(mm[1], 10);

  const sizeId = sizeMap[desiredSize.toString().trim().toUpperCase()];
  if (sizeId === undefined) return null; // this size code doesn't exist on this product at all

  return inStockIds.indexOf(sizeId) !== -1;
}

// Pull the value out of: <meta property="og:image" content="https://...">
// This is the same kind of tag as og:availability, just for the product's
// representative photo — gives a clean image URL with no extra request.
function getImageUrl_(html) {
  const m = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
         || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  return m ? m[1] : null;
}

// Pull the value out of: <meta property="og:availability" content="instock">
// Handles either attribute order, since raw HTML doesn't guarantee one.
function getAvailability_(html) {
  const m = html.match(/<meta[^>]*property=["']og:availability["'][^>]*content=["']([^"']+)["']/i)
         || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:availability["']/i);
  return m ? m[1].toLowerCase() : null;
}

// Mode B: search the catalog HTML for this keyword and decide whether it's
// in stock, out of stock, or not listed at all
function checkKeywordStatus_(html, keyword) {
  const lowerHtml = html.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();

  const idx = lowerHtml.indexOf(lowerKeyword);
  if (idx === -1) {
    return STATUS_NOT_FOUND; // keyword doesn't appear on the page at all -> still delisted
  }

  // Look at a short window of text right after the keyword for an "out of stock" marker
  // (on this site's product cards, the out-of-stock label sits right after the name/price)
  const windowEnd = Math.min(lowerHtml.length, idx + 600);
  const nearbyText = lowerHtml.substring(idx, windowEnd);

  if (nearbyText.indexOf('out of stock') !== -1) {
    return STATUS_OUT_OF_STOCK;
  }
  return STATUS_IN_STOCK;
}

// ====================== One-time setup ======================

function setup() {
  // Clear any existing triggers first so we never end up with duplicates
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('checkSaleEmails')
    .timeBased()
    .everyMinutes(30)
    .create();

  ScriptApp.newTrigger('checkRestocks')
    .timeBased()
    .everyMinutes(30)
    .create();

  notify_('Setup complete', 'Réalisation Par monitor is live, checking every 30 minutes', null, 'system');
}

// ====================== Test helpers ======================

// Run this first to confirm you receive the notification email
function testNotification() {
  notify_('Test notification', 'If you see this email, notifications are wired up correctly!', null, 'system');
}

// Run this to manually trigger an email check right now instead of waiting for the timer
function testCheckSaleEmails() {
  checkSaleEmails();
}

// Run this to manually trigger a restock check right now instead of waiting for the timer
function testCheckRestocks() {
  checkRestocks();
}
