# PLN Outage — Top-Site Power Intelligence (AREA1)

A two-part MVP for identifying the worst BTS sites/clusters by PLN-outage impact.

- **`engine/`** — Python + DuckDB ETL. Reads the raw datasets, cleans + joins on Site ID,
  derives the impact ranking (v1 outages/downtime · v2 backup dimensioning · v3 payload),
  and writes a compact `data.json`.
- **`app/`** (this Next.js project) — a dashboard that reads `public/data.json`:
  KPIs, Top-N sites/clusters/NOPs, filters & drill-down, a site detail drawer, and a bad-grid map.

The heavy raw data (100s of MB) never enters the app. The engine compresses it to a
~12 MB `data.json` that the app consumes. Re-run the engine monthly and drop in the new file.

## 1. Regenerate data (engine)

Requires Python 3.10+ :

```bash
pip install duckdb openpyxl
python engine/run.py \
  --avail  "/path/to/Avail_RAN_*_daily/"        # folder of the daily availability CSVs \
  --events "/path/to/BBT_Exportmonthly_*.xlsx"   # the raw mains-fail event export \
  --config "/path/to/New_BBT_2026.xlsx"          # the site master / config workbook \
  --out    public/data.json \
  --topn   15                                    # optional: print a Top-N preview
```

DuckDB streams the availability CSVs, so it handles multi-GB inputs without loading them into RAM.
To run another area, just point `--avail/--events/--config` at that area's files.

## 2. Run the dashboard locally

```bash
npm install
npm run dev        # http://localhost:3000
```

## 3. Deploy to Vercel

1. Push this folder to a Git repo.
2. Import it in Vercel (framework auto-detected as Next.js) → Deploy.
3. To refresh data later: replace `public/data.json` (from the engine) and redeploy.

Deploys on Netlify too (build command `next build`).

## Method & honesty notes (read before presenting)

- **Ranking metric = power-attributable network downtime** (from the availability feed,
  wall-clock, capped at 24h/day). It is inherently *genset-adjusted*: it counts downtime that
  actually happened after backup, not raw PLN dips.
- **NE-hours** (`power_ne_hours`) is shown separately as a severity signal; it sums across
  network elements so it can exceed 24h/day — do not read it as wall-clock.
- **Backup verdict (v2):** "under-dim" = the site went down despite backup (NE down occurred).
  "no data" = the site is absent from the event feed (not confirmed OK).
- **Lost-GB (v3)** is a payload proxy (Jan–Apr, ~62% of sites). Blank where payload is missing.
- **Estate-level only** — no per-site engineering audit, no site coordinates used for anything
  beyond the map.

## Known source-data issues surfaced during the build

- The monthly *BBT Site Details* CSVs had **Jan = Feb = May identical** (likely an export copy
  error). Not used by the engine (superseded by the event export), but worth fixing at source.
- The config workbook's **January payload column** contained corrupt values (~10⁹ GB) for some
  sites; the engine drops any month value > 1,000,000 GB as implausible.

## v3.1a fix — coordinates
Map previously showed only South Sumatra. Root cause: the engine read the combined "Koordinat" column in New_BBT, which is only clean for REGIONAL2 and corrupt/empty for the north & central regions. Fixed to read the separate **Long / Lat** columns (100% filled, clean), with the combined column as fallback. Coordinates now cover all Sumatra: 18,583 sites (6,201 north incl. Aceh/Medan/Padang, 6,392 south).
