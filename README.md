# Insider Ledger 📈

A live tracker of **insider trading** — the *legal* kind. Whenever a company
executive, director, or big shareholder buys or sells their own company's
stock, US law requires them to report it to the SEC within two business days
on a "Form 4". This app pulls those filings the moment they land, and shows
you who's buying and selling.

It runs entirely on your own laptop. Nothing is sent anywhere; it only *reads*
public data from the government's free SEC EDGAR service.

---

## How to start it

Open the **Terminal** app, then copy-paste this one line and press Enter:

```
~/code/insider-tracker/run.sh
```

The first time, it spends about 20 seconds setting itself up. Then your
browser opens automatically at **http://localhost:8077**.

To stop it, click the Terminal window and press **Ctrl + C**.
To start it again later, run that same line.

---

## What you're looking at

- **The big numbers up top** — total insider buying vs. selling over the last
  7 days, and the *net flow* (green = insiders net buying, red = net selling).
- **The ledger** (main table) — every recent trade. Green = a **buy**, red = a
  **sell**. Click the ↗ arrow to open the original SEC filing.
- **Cluster buys** (gold panel, right) — ⭐ the signal worth watching. When
  *several different insiders at the same company* all buy around the same
  time, that's historically the most meaningful pattern. Click one to filter
  the ledger to that company.
- **Filters** — the chips (Buys / Sells / …), the Role dropdown (just CEOs &
  CFOs, just directors, etc.), a minimum-value filter, and a search box for
  any company, person, or ticker.

The board **refreshes itself every 5 minutes** and the more it runs, the more
history it builds up. Leave it open and it stays current.

---

## Good to know

- **What counts as a "buy"?** The most meaningful is code **P** — an open-market
  purchase with the insider's own money. **Grants** and **option exercises**
  are compensation, not conviction, so they're shown but coloured neutrally.
- **Net selling is normal.** Executives are paid in stock and sell routinely.
  *Buying* is the rarer, more interesting signal — especially clusters.
- This is a **personal research tool, not investment advice.** Insider activity
  is one input among many.

---

## Under the hood (for the curious)

- `backend/sec.py` — fetches & parses SEC Form 4 filings (standard library only)
- `backend/db.py` — local SQLite database (`data/insider.db`)
- `backend/main.py` — the small web server + auto-refresh
- `frontend/` — the dashboard you see
- Data source: <https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4>
