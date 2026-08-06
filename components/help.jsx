"use client";
import React, { useState } from "react";

/* ---------- short contextual tooltips (per metric) ---------- */
export const TIPS = {
  availability: {
    en: "Site availability (INAP) — the KPI. % of time the site was up. Target is the contractual/planned level; the gap is how far below target you are.",
    id: "Availability site (INAP) — KPI-nya. % waktu site menyala. Target = level kontrak/rencana; gap = seberapa jauh di bawah target.",
  },
  cause: {
    en: "Share of total downtime by root cause (power / transport / RAN / other). Proves whether power is the dominant contributor to the availability gap.",
    id: "Porsi total downtime per penyebab (power / transport / RAN / lainnya). Membuktikan apakah power penyumbang dominan ke gap availability.",
  },
  fault: {
    en: "Splits power downtime by who can fix it. Backup = went down despite backup → CAPEX (autonomy). PLN = grid issue, backup held → escalate to utility. Unverified = no event record → field-check.",
    id: "Membagi power downtime berdasarkan siapa yang bisa memperbaiki. Backup = turun walau ada backup → CAPEX (autonomy). PLN = masalah grid, backup nahan → eskalasi ke PLN. Unverified = tak ada catatan event → cek lapangan.",
  },
  driver: {
    en: "Why backup fails. Failure scales with PLN-down exposure (light vs heavy monthly PLN-down), not battery age or chemistry. Long outages need more autonomy (genset / larger battery).",
    id: "Kenapa backup gagal. Kegagalan naik seiring exposure PLN-down (ringan vs berat per bulan), bukan umur/jenis baterai. Outage panjang butuh autonomy lebih (genset / baterai lebih besar).",
  },
  power_dark: {
    en: "Power site-dark = Σ(1−power availability)×24h per day, at site level. The honest 'how long was the site dark from power'. Ranking metric.",
    id: "Power site-dark = Σ(1−ketersediaan power)×24h per hari, level site. Ukuran jujur 'berapa lama site gelap karena power'. Metrik ranking.",
  },
  ne_hours: {
    en: "Same downtime summed across every network element (sectors), so it exceeds 24h/day. Use only to compare severity between sites — it is NOT clock time and favours larger sites.",
    id: "Downtime yang sama dijumlah lintas semua network element (sektor), jadi bisa >24 jam/hari. Hanya untuk banding keparahan antar-site — BUKAN jam-dinding, dan berpihak ke site besar.",
  },
  pattern: {
    en: "Problem type × how often. Grid+backup = both bad. Backup insufficient = our asset. Grid bad·backup OK = PLN's. Rows = fault type, columns = chronic/intermittent/one-off.",
    id: "Jenis masalah × seberapa sering. Grid+backup = dua-duanya jelek. Backup insufficient = aset kita. Grid bad·backup OK = punya PLN. Baris = jenis, kolom = kronis/kadang/sekali.",
  },
  repeat: {
    en: "How persistent: Chronic = bad in ≥4 of 6 months, Intermittent = 2–3, One-off = 1.",
    id: "Seberapa persisten: Chronic = jelek ≥4 dari 6 bulan, Intermittent = 2–3, One-off = 1.",
  },
  trend: {
    en: "Apr–Jun vs Jan–Mar. 'Improving' is RELATIVE (got less bad) — not necessarily acceptable.",
    id: "Apr–Jun vs Jan–Mar. 'Improving' itu RELATIF (jadi kurang jelek) — belum tentu sudah oke.",
  },
  worklist: {
    en: "Sites with measured downtime but no PLN-event record, or that look permanently dark (likely decommissioned/broken). Excluded from ranking — verify in the field first.",
    id: "Site dengan downtime terukur tapi tanpa catatan event PLN, atau yang tampak gelap permanen (kemungkinan mati/rusak). Dikeluarkan dari ranking — verifikasi lapangan dulu.",
  },
  evonly: {
    en: "Show only sites that have a confirmed PLN-outage record. Keeps the ranking to verified cases (conservative). Untick to include unverified downtime.",
    id: "Tampilkan hanya site dengan catatan outage PLN terkonfirmasi. Menjaga ranking pada kasus terverifikasi (konservatif). Hilangkan centang untuk memasukkan downtime tak terverifikasi.",
  },
  range: {
    en: "Filters downtime totals to a period. Availability, pattern, fault & trend still describe full H1 (they are whole-period characterisations).",
    id: "Memfilter total downtime ke satu periode. Availability, pattern, fault & trend tetap menggambarkan H1 penuh (karakterisasi seluruh periode).",
  },
};

/* ---------- info tooltip (hover / tap) ---------- */
export function InfoTip({ id, lang = "en", text }) {
  const [open, setOpen] = useState(false);
  const body = text || TIPS[id]?.[lang] || "";
  if (!body) return null;
  return (
    <span className="relative inline-flex items-center align-middle"
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>
      <span className="ml-1 w-4 h-4 inline-flex items-center justify-center rounded-full bg-line text-mut text-[10px] font-bold cursor-help hover:bg-slate hover:text-white">i</span>
      {open && (
        <span className="absolute z-[4000] left-1/2 -translate-x-1/2 top-5 w-64 bg-ink text-white text-[11px] leading-snug rounded-md p-2.5 shadow-xl normal-case font-normal tracking-normal">
          {body}
        </span>
      )}
    </span>
  );
}

/* ---------- language toggle ---------- */
export function LangToggle({ lang, setLang }) {
  return (
    <div className="inline-flex rounded overflow-hidden border border-white/20 text-[11px]">
      {["en", "id"].map((l) => (
        <button key={l} onClick={() => setLang(l)}
          className={`px-2 py-0.5 ${lang === l ? "bg-amber text-white" : "bg-white/5 text-white/70 hover:text-white"}`}>{l.toUpperCase()}</button>
      ))}
    </div>
  );
}

/* ---------- full help panel ---------- */
const HELP = {
  en: {
    title: "Help & documentation",
    sections: [
      { h: "What this is", b: ["A read-only analytics view for customer-side site availability (INAP). The KPI is availability; this tool isolates how much of the availability gap comes from power, splits it by who can fix it, and points to the highest-leverage action.", "It is not a ticketing tool, not real-time, and every figure is an estate-level property of the period (H1 2026, AREA1)."] },
      { h: "The logic chain", b: ["Availability vs target → the gap.", "Break the gap by cause → power is the #1 contributor.", "Split power downtime by fault → backup-insufficient (CAPEX-addressable) vs PLN-grid (escalate) vs unverified (field-check).", "Backup fails mainly because of outage DURATION, not battery age → CAPEX = add autonomy (genset / larger battery) where outages are long."] },
      { h: "Key metrics", b: ["Availability (INAP): % of time the site was up. Target = planned level; gap = target − actual.", "Power site-dark: Σ(1−power availability)×24h/day — honest site-level dark time; the ranking metric.", "NE-hours: downtime summed across sectors (>24h/day possible) — severity comparison only, not clock time.", "Cause shares: power/transport/RAN/other portion of total downtime.", "Fault class: backup (CAPEX) / PLN (escalate) / unverified (verify).", "Pattern: grid vs backup vs both. Repeat: chronic/intermittent/one-off. Trend: worsening/improving/stable (relative to Apr–Jun vs Jan–Mar)."] },
      { h: "How to read a site", b: ["Ranking is by power site-dark. Read PLN-down, NE-dark and the fault class together: long PLN-down but no NE-dark = PLN problem (backup held); NE-dark present = our backup failed; both high = top priority.", "Availability far below target with very little NE-dark means the darkness is NOT explained by recorded PLN power events — likely a chronic internal power fault; field-verify."] },
      { h: "Filters", b: ["Geo: Area → Region → NOP → Cluster → City drives every widget. Period: presets or custom range affect downtime totals (availability/pattern/fault stay full-H1). 'Event-confirmed only' keeps the ranking to verified cases.", "Click a cell in the pattern matrix, a cluster bar, or a table row to drill down. Export CSV sends the current selection to your field team."] },
      { h: "Honest caveats", b: ["~29% of downtime is on sites with no PLN-event record — shown as 'unverified', moved to the Worklist, not counted as confirmed PLN.", "Likely-dead sites (permanently dark, no events) are flagged and excluded from ranking.", "'Improving' is relative — a catastrophic site can still be 'improving'.", "Coordinates and battery/genset config are missing for some sites; recommendations there are generic.", "Data quality issues found in the source (see the team) are documented and worked around, not hidden."] },
    ],
  },
  id: {
    title: "Bantuan & dokumentasi",
    sections: [
      { h: "Ini apa", b: ["Tampilan analitik read-only untuk availability site dari sisi pelanggan (INAP). KPI-nya availability; tool ini memisahkan berapa banyak gap availability yang berasal dari power, membaginya berdasarkan siapa yang bisa memperbaiki, dan menunjuk aksi dengan leverage tertinggi.", "Ini bukan alat ticketing, bukan real-time, dan setiap angka adalah properti level-estate untuk periode (H1 2026, AREA1)."] },
      { h: "Rantai logika", b: ["Availability vs target → gap-nya.", "Pecah gap per penyebab → power = penyumbang #1.", "Pecah power downtime per fault → backup-insufficient (CAPEX) vs PLN-grid (eskalasi) vs unverified (cek lapangan).", "Backup gagal terutama karena DURASI outage, bukan umur baterai → CAPEX = tambah autonomy (genset / baterai lebih besar) di tempat outage-nya panjang."] },
      { h: "Metrik utama", b: ["Availability (INAP): % waktu site menyala. Target = level rencana; gap = target − aktual.", "Power site-dark: Σ(1−ketersediaan power)×24h/hari — waktu gelap level-site yang jujur; metrik ranking.", "NE-hours: downtime dijumlah lintas sektor (bisa >24 jam/hari) — hanya untuk banding keparahan, bukan jam-dinding.", "Cause shares: porsi power/transport/RAN/lainnya dari total downtime.", "Fault class: backup (CAPEX) / PLN (eskalasi) / unverified (verifikasi).", "Pattern: grid vs backup vs dua-duanya. Repeat: kronis/kadang/sekali. Trend: memburuk/membaik/stabil (relatif Apr–Jun vs Jan–Mar)."] },
      { h: "Cara membaca site", b: ["Ranking berdasarkan power site-dark. Baca PLN-down, NE-dark, dan fault bersamaan: PLN-down panjang tapi NE-dark nol = masalah PLN (backup nahan); ada NE-dark = backup kita gagal; dua-duanya tinggi = prioritas tertinggi.", "Availability jauh di bawah target dengan NE-dark sangat kecil berarti kegelapannya TIDAK dijelaskan oleh event power PLN tercatat — kemungkinan kerusakan power internal kronis; verifikasi lapangan."] },
      { h: "Filter", b: ["Geo: Area → Region → NOP → Cluster → City menyetir semua widget. Periode: preset atau rentang custom memengaruhi total downtime (availability/pattern/fault tetap H1 penuh). 'Event-confirmed only' menjaga ranking pada kasus terverifikasi.", "Klik sel di matriks pattern, bar cluster, atau baris tabel untuk drill-down. Export CSV mengirim seleksi saat ini ke tim lapangan."] },
      { h: "Caveat jujur", b: ["~29% downtime ada di site tanpa catatan event PLN — ditandai 'unverified', dipindah ke Worklist, tidak dihitung sebagai PLN terkonfirmasi.", "Site likely-dead (gelap permanen, tanpa event) ditandai dan dikeluarkan dari ranking.", "'Improving' itu relatif — site katastrofik pun bisa 'improving'.", "Koordinat dan konfigurasi baterai/genset hilang untuk sebagian site; rekomendasi di situ bersifat umum.", "Isu kualitas data di sumber (sampaikan ke tim data) didokumentasikan dan diakali, bukan disembunyikan."] },
    ],
  },
};

export function HelpButton({ lang }) {
  const [open, setOpen] = useState(false);
  const t = HELP[lang] || HELP.en;
  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 bg-white/10 hover:bg-white/20 rounded px-2 py-1 text-[12px]">
        <span className="w-4 h-4 inline-flex items-center justify-center rounded-full bg-amber text-white text-[10px] font-bold">?</span>
        {lang === "id" ? "Bantuan" : "Help"}
      </button>
      {open && (
        <div className="fixed inset-0 z-[4000] flex justify-end" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-ink/50" />
          <div className="relative w-full max-w-lg bg-card h-full overflow-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-navy text-white px-5 py-4 flex items-center justify-between z-10">
              <div className="text-lg font-bold">{t.title}</div>
              <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white text-lg">✕</button>
            </div>
            <div className="p-5 space-y-5">
              {t.sections.map((s, i) => (
                <section key={i}>
                  <h4 className="text-[13px] font-semibold text-navy border-b border-line pb-1 mb-2">{s.h}</h4>
                  <ul className="space-y-1.5">
                    {s.b.map((line, j) => <li key={j} className="text-[12.5px] text-slate leading-snug flex gap-2"><span className="text-amber">›</span><span>{line}</span></li>)}
                  </ul>
                </section>
              ))}
              <div className="text-[11px] text-mut pt-2 border-t border-line">AREA1 · H1 2026 · customer POV (INAP). Read-only analytics. For source-data questions, contact the data team.</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ================= In-app Docs (mirrors the .xlsx design/ops doc) ================= */
export const DOCS = {
  en: {
    label: "Documentation",
    sections: [
      { id: "cover", title: "Overview", kind: "kv", rows: [
        ["Document", "Dashboard Design & Operations Doc"],
        ["Subtitle", "Site Availability — Power Cause Analysis · AREA1 · H1 2026 · customer POV (INAP)"],
        ["Purpose", "Isolates how much of the availability gap comes from power, splits that power downtime by who can fix it (backup=CAPEX / PLN=escalate / unverified=field-check), and points to the highest-leverage CAPEX action."],
        ["Scope", "Read-only, non-real-time. H1 2026 (Jan–Jun), AREA1 only. Estate averages hide per-site/cluster variation."],
        ["Version", "v5"],
        ["⚠ Note", "Read the Data Quality section before quoting any single-site number — several top-ranked sites are chronic-internal-fault sites, not PLN victims."],
      ]},
      { id: "flow", title: "App flow & architecture", kind: "table", headers: ["Step", "Component", "What happens", "Output"], rows: [
        ["1. Inputs", "3 data feeds", "(a) Availability daily CSVs; (b) BBT Site Details monthly CSVs; (c) New_BBT config xlsx.", "Raw files"],
        ["2. Engine", "run.py", "DuckDB reads availability; openpyxl/csv read BBT + config; metrics computed.", "In-memory tables"],
        ["3. Build", "run.py build()", "Writes dataset + per-cluster lazy files.", "data.json (~18MB) + clusters/<slug>.json"],
        ["4. App", "Next.js client", "Renders KPIs, charts, map, tables, drawer; geo + date filters drive every widget.", "Interactive dashboard"],
        ["5. Deploy", "Vercel", "git push → auto-build → live URL.", "pln-outage-dashboard.vercel.app"],
        ["Coverage", "site counts", "availability 19,681 · BBT 15,933 · config 18,683 · union 19,859 · clean coords 18,583.", "—"],
      ]},
      { id: "sources", title: "Data sources", kind: "table", headers: ["Source", "Grain", "Key fields", "Coverage", "Notes"], rows: [
        ["Availability (Avail_RAN daily)", "site-day", "availability%, target%, ava_power%, duration_power/transport/ran/other, outage, region/NOP/cluster, class", "19,681", "THE KPI + cause source."],
        ["BBT Site Details (monthly)", "site-month", "PLN Down, NE Down, Backup Duration, Repetitive, MF-First-NE-Down", "15,933", "Duration-based event/backup source (v5)."],
        ["Config (New_BBT_2026)", "site", "Long/Lat, battery, genset, cluster TO, target-max, VIP, hub", "18,683", "Coordinates, backup context, grouping."],
        ["Per-event export (reference, not wired)", "event", "227,538 rows; real timestamps (quoted text); per-event durations", "13,761", "Usable after stripping quotes; sharp ~1h threshold. Pending A4."],
      ]},
      { id: "metrics", title: "Metrics & formulas", kind: "table", headers: ["Metric", "Definition", "Notes"], rows: [
        ["Availability (INAP)", "avg(availability %)", "THE KPI."],
        ["Target / Gap", "avg(target %) ; Gap = Target − Availability", "Estate −0.49pp (97.74 vs 98.23)."],
        ["Power site-dark (ranking)", "Σ (1 − ava_power/100) × 24h per day", "Site-level, honest. Estate 1,014,842 h."],
        ["Cause share", "duration_[cause] ÷ total outage", "power 53.8%, other 23.4%, transport 18.8%, RAN 4.1%."],
        ["NE-hours (severity)", "raw Σ duration_power (NE-summed)", "Drawer only; not clock time; favours large sites."],
        ["PLN-down / NE-dark / Backup", "Σ BBT PLN-Down / NE-Down / Backup-Duration", "v5, monthly BBT."],
      ]},
      { id: "rules", title: "Classification rules & thresholds", kind: "table", headers: ["Rule", "Definition / values"], rows: [
        ["Fault", "unverified = not in BBT; backup (CAPEX) = ne_dark>0; pln (escalate) = pln_down>0 & ne_dark=0. Estate: backup 62.1 / pln 18.5 / unverified 19.4%."],
        ["Pattern", "grid-bad if pln_down ≥ 75th pctile. both / grid_backup_ok / backup_fail / minimal / no_data."],
        ["Repeat", "months with power site-dark >24h → chronic ≥4, intermittent 2–3, one_off 1, none 0."],
        ["Trend", "Apr–Jun vs Jan–Mar; worsening >+20%, improving <−20%, else stable. RELATIVE."],
        ["Likely-dead", "not in BBT & avg avail <40% & ≥140 dark days → excluded from ranking (heuristic)."],
        ["Driver (v5)", "PLN-down exposure → % NE-dark: <1h 19.4%, 1–6h 23.0%, 6–12h 31.0%, >12h 72.7% (monotonic)."],
        ["Driver (per-event, not wired)", "event duration → % NE-down: <15m 0.7% … 1–2h 76.6%, >2h 83.4% — ~1h threshold."],
        ["Genset / Battery age", "Genset: 21.3h vs 52.3h dark. Age NOT predictive (~29% flat; Lithium=VRLA) → CAPEX = autonomy."],
      ]},
      { id: "features", title: "Features & operational usage", kind: "table", headers: ["Feature", "How to use"], rows: [
        ["Tabs", "Overview, Sites, Clusters, NOPs, Worklist, Map, Docs."],
        ["Geo filter", "Area→Region→NOP→Cluster→City cascade drives every widget."],
        ["Date range", "Full-H1/30d/14d/7d/custom affects downtime totals only; availability/pattern/fault stay full-H1."],
        ["Event-confirmed only", "Toggle (default ON) keeps ranking to sites with a BBT record."],
        ["Drill-down", "Click a cluster bar / pattern cell / row → jumps into Sites scoped to it."],
        ["Site drawer", "Click a site → availability, cause, fault, monthly site-dark, Monthly BBT table."],
        ["Export CSV", "Exports the current selection for the field team."],
      ]},
      { id: "glossary", title: "Glossary", kind: "table", headers: ["Term", "Definition"], rows: [
        ["Availability / INAP", "% of time the site was up — the KPI."],
        ["Power site-dark", "Σ(1−ava_power)×24h/day; honest site-level dark hours. Ranking metric."],
        ["NE-hours", "Downtime summed across sectors (>24h/day possible). Severity only, not clock time."],
        ["Cause share", "Portion of total downtime by power / transport / RAN / other."],
        ["Fault: backup / pln / unverified", "Went down despite backup (CAPEX) / grid but backup held (escalate) / no record (verify)."],
        ["Pattern", "both / grid-backup-ok / backup-fail / minimal / no-data."],
        ["Repeat / Trend", "Persistence across months / Apr–Jun vs Jan–Mar direction (relative)."],
        ["Likely-dead", "Permanently-dark no-event site; excluded from ranking."],
        ["Unverified", "Measured downtime with no BBT record; parked in the Worklist."],
        ["Autonomy / Genset", "How long backup holds before first drop / backup generator (halves dark hours)."],
        ["Event-confirmed", "Site appears in the BBT feed."],
      ]},
      { id: "dq", title: "Data quality register", kind: "table", headers: ["ID", "Issue", "Impact", "Status"], statusCol: 3, rows: [
        ["A1", "Coordinate column corrupt", "Map originally South-only", "Resolved"],
        ["A2", "Duplicate Jan–Mar BBT", "Q1 event metrics wrong", "Resolved"],
        ["A3", "Event timestamps as quoted text", "Misjudged as unusable", "Known"],
        ["A4", "9× PLN-down discrepancy (per-event vs monthly)", "Absolute PLN-down uncertain", "Open"],
        ["A5", "Config missing for some sites", "Blind recommendations", "Known"],
        ["B1", "Wall-clock overstated 5.8×", "Headline was inflated", "Resolved"],
        ["B2", "NE-hours size confound", "Misleading as clock time", "Known"],
        ["B3", "Driver monthly resolution", "Coarse autonomy sizing", "Known"],
        ["C1", "Unverified ~19%", "Can't confirm as PLN", "Known"],
        ["C2", "Likely-dead sites", "Contaminate raw ranking", "Known"],
        ["C3", "Feed coverage differs", "Some sites lack context", "Known"],
        ["D1", "Event feed ≠ availability feed (TIS025, COA043)", "Fault owner may be wrong", "Open"],
        ["D2", "'Backup Held' misleading", "Held yet dark for 100s of hours", "Known"],
        ["E1", "Fault leans on event feed", "Chronic-fault sites mislabelled", "Open"],
        ["E2", "'Improving' is relative", "Catastrophic site can read improving", "Known"],
        ["E3", "Battery age not predictive", "'Replace old batteries' unsupported", "Finding"],
        ["F1", "City time-series", "Chart lags KPI for city filter", "Known"],
        ["F2", "~1% daily-vs-total gap", "Minor mismatch", "Known"],
        ["F3", "Coverage window", "Availability & BBT both Jan–Jun", "Resolved"],
        ["G", "Scope caveats", "H1 2026 AREA1 only; estate averages", "Known"],
      ]},
      { id: "guidance", title: "Presenting guidance & roadmap", kind: "table", headers: ["Type", "Item"], rows: [
        ["Solid", "Availability 97.74% vs target 98.23% (gap −0.49pp)."],
        ["Solid", "Power is the #1 cause of the availability gap (53.8%)."],
        ["Solid", "Backup fails with outage duration; age doesn't predict; genset halves dark hours."],
        ["Caveat", "Absolute PLN-down magnitude uncertain (A4)."],
        ["Caveat", "Verify a top-ranked site's fault label before quoting it (D1/E1)."],
        ["Caveat", "'Unverified' ~19% excluded from confirmed-PLN by design (C1)."],
        ["Roadmap 1", "Data team: resolve A4 + fix Koordinat at source."],
        ["Roadmap 2", "Build the audit-needed / unexplained-darkness flag (D1/E1)."],
        ["Roadmap 3", "Optionally wire per-event for the ~1h autonomy threshold."],
        ["Roadmap 4", "Suppress 'improving' on still-catastrophic sites."],
      ]},
      { id: "changelog", title: "Changelog", kind: "table", headers: ["Version", "Change"], rows: [
        ["v1", "Initial power-downtime tool: outage counts, wall-clock downtime, map, clusters/NOPs, drawer."],
        ["v2", "Backup & battery context (verdict, age, type, genset)."],
        ["v3", "Pattern/repeat/trend, per-site daily drill, geo cascade + date range, lazy cluster files."],
        ["v3.1a", "FIX coordinates: read Long/Lat; map covers all Sumatra (18,583 coords)."],
        ["v4", "Availability-first reframe: availability vs target, cause attribution, fault split, honest site-dark (1.01M h), driver/genset/age findings, event-confirmed ranking + Worklist, dead-site flag, bug-fix round."],
        ["v4 help", "Bilingual in-app Help + EN/ID toggle + tooltips."],
        ["v5", "Duration-based BBT from corrected monthly Jan–Jun files; fault split refreshed (62.1/18.5/19.4); monotonic driver 19→73%; drawer Monthly BBT. Per-event later found usable (~1h threshold) — pending A4."],
      ]},
    ],
  },
  id: {
    label: "Dokumentasi",
    sections: [
      { id: "cover", title: "Ringkasan", kind: "kv", rows: [
        ["Dokumen", "Dokumen Desain & Operasional Dashboard"],
        ["Subjudul", "Site Availability — Power Cause Analysis · AREA1 · H1 2026 · POV pelanggan (INAP)"],
        ["Tujuan", "Memisahkan berapa banyak gap availability dari power, membaginya berdasarkan siapa yang bisa memperbaiki (backup=CAPEX / PLN=eskalasi / unverified=cek lapangan), dan menunjuk aksi CAPEX dengan leverage tertinggi."],
        ["Cakupan", "Read-only, non-real-time. H1 2026 (Jan–Jun), AREA1 saja. Rata-rata estate menyembunyikan variasi per-site/cluster."],
        ["Versi", "v5"],
        ["⚠ Catatan", "Baca bagian Data Quality sebelum mengutip angka site manapun — beberapa site peringkat atas adalah site rusak kronis internal, bukan korban PLN."],
      ]},
      { id: "flow", title: "Alur & arsitektur app", kind: "table", headers: ["Langkah", "Komponen", "Yang terjadi", "Output"], rows: [
        ["1. Input", "3 feed data", "(a) CSV harian Availability; (b) CSV bulanan BBT Site Details; (c) config New_BBT xlsx.", "File mentah"],
        ["2. Engine", "run.py", "DuckDB baca availability; openpyxl/csv baca BBT + config; metrik dihitung.", "Tabel in-memory"],
        ["3. Build", "run.py build()", "Menulis dataset + file per-cluster lazy.", "data.json (~18MB) + clusters/<slug>.json"],
        ["4. App", "Next.js client", "Render KPI, chart, peta, tabel, drawer; filter geo + tanggal menyetir semua widget.", "Dashboard interaktif"],
        ["5. Deploy", "Vercel", "git push → auto-build → URL live.", "pln-outage-dashboard.vercel.app"],
        ["Cakupan", "jumlah site", "availability 19.681 · BBT 15.933 · config 18.683 · union 19.859 · koordinat bersih 18.583.", "—"],
      ]},
      { id: "sources", title: "Sumber data", kind: "table", headers: ["Sumber", "Grain", "Field kunci", "Cakupan", "Catatan"], rows: [
        ["Availability (Avail_RAN harian)", "site-hari", "availability%, target%, ava_power%, duration_power/transport/ran/other, outage, region/NOP/cluster, class", "19.681", "Sumber KPI + cause."],
        ["BBT Site Details (bulanan)", "site-bulan", "PLN Down, NE Down, Backup Duration, Repetitive, MF-First-NE-Down", "15.933", "Sumber event/backup berbasis durasi (v5)."],
        ["Config (New_BBT_2026)", "site", "Long/Lat, baterai, genset, cluster TO, target-max, VIP, hub", "18.683", "Koordinat, konteks backup, grouping."],
        ["Export per-event (referensi, belum dipakai)", "event", "227.538 baris; timestamp asli (teks berkutip); durasi per-event", "13.761", "Bisa dipakai setelah strip kutip; threshold ~1 jam tajam. Menunggu A4."],
      ]},
      { id: "metrics", title: "Metrik & rumus", kind: "table", headers: ["Metrik", "Definisi", "Catatan"], rows: [
        ["Availability (INAP)", "rata-rata(availability %)", "KPI utama."],
        ["Target / Gap", "rata-rata(target %) ; Gap = Target − Availability", "Estate −0,49pp (97,74 vs 98,23)."],
        ["Power site-dark (ranking)", "Σ (1 − ava_power/100) × 24h per hari", "Level-site, jujur. Estate 1.014.842 jam."],
        ["Cause share", "duration_[sebab] ÷ total outage", "power 53,8%, other 23,4%, transport 18,8%, RAN 4,1%."],
        ["NE-hours (severity)", "Σ mentah duration_power (NE-summed)", "Drawer saja; bukan jam-dinding; berpihak ke site besar."],
        ["PLN-down / NE-dark / Backup", "Σ BBT PLN-Down / NE-Down / Backup-Duration", "v5, BBT bulanan."],
      ]},
      { id: "rules", title: "Aturan klasifikasi & ambang", kind: "table", headers: ["Aturan", "Definisi / nilai"], rows: [
        ["Fault", "unverified = tidak di BBT; backup (CAPEX) = ne_dark>0; pln (eskalasi) = pln_down>0 & ne_dark=0. Estate: backup 62,1 / pln 18,5 / unverified 19,4%."],
        ["Pattern", "grid-bad jika pln_down ≥ persentil-75. both / grid_backup_ok / backup_fail / minimal / no_data."],
        ["Repeat", "bulan dengan power site-dark >24h → chronic ≥4, intermittent 2–3, one_off 1, none 0."],
        ["Trend", "Apr–Jun vs Jan–Mar; memburuk >+20%, membaik <−20%, selain itu stabil. RELATIF."],
        ["Likely-dead", "tidak di BBT & rata-rata avail <40% & ≥140 hari gelap → dikeluarkan dari ranking (heuristik)."],
        ["Driver (v5)", "exposure PLN-down → % NE-dark: <1h 19,4%, 1–6h 23,0%, 6–12h 31,0%, >12h 72,7% (monotonik)."],
        ["Driver (per-event, belum dipakai)", "durasi event → % NE-down: <15m 0,7% … 1–2h 76,6%, >2h 83,4% — threshold ~1 jam."],
        ["Genset / Umur baterai", "Genset: 21,3h vs 52,3h gelap. Umur TIDAK prediktif (~29% flat; Lithium=VRLA) → CAPEX = autonomy."],
      ]},
      { id: "features", title: "Fitur & penggunaan operasional", kind: "table", headers: ["Fitur", "Cara pakai"], rows: [
        ["Tab", "Overview, Sites, Clusters, NOPs, Worklist, Map, Docs."],
        ["Filter Geo", "Kaskade Area→Region→NOP→Cluster→City menyetir semua widget."],
        ["Rentang tanggal", "Full-H1/30h/14h/7h/custom hanya memengaruhi total downtime; availability/pattern/fault tetap H1 penuh."],
        ["Event-confirmed only", "Toggle (default ON) menjaga ranking pada site dengan catatan BBT."],
        ["Drill-down", "Klik bar cluster / sel pattern / baris → masuk ke Sites yang dibatasi."],
        ["Drawer site", "Klik site → availability, cause, fault, site-dark bulanan, tabel Monthly BBT."],
        ["Export CSV", "Mengekspor seleksi saat ini untuk tim lapangan."],
      ]},
      { id: "glossary", title: "Glosarium", kind: "table", headers: ["Istilah", "Definisi"], rows: [
        ["Availability / INAP", "% waktu site menyala — KPI-nya."],
        ["Power site-dark", "Σ(1−ava_power)×24h/hari; jam gelap level-site yang jujur. Metrik ranking."],
        ["NE-hours", "Downtime dijumlah lintas sektor (bisa >24 jam/hari). Severity saja, bukan jam-dinding."],
        ["Cause share", "Porsi total downtime per power / transport / RAN / lainnya."],
        ["Fault: backup / pln / unverified", "Turun walau ada backup (CAPEX) / grid tapi backup nahan (eskalasi) / tanpa catatan (verifikasi)."],
        ["Pattern", "both / grid-backup-ok / backup-fail / minimal / no-data."],
        ["Repeat / Trend", "Persistensi antar bulan / arah Apr–Jun vs Jan–Mar (relatif)."],
        ["Likely-dead", "Site gelap permanen tanpa event; dikeluarkan dari ranking."],
        ["Unverified", "Downtime terukur tanpa catatan BBT; ditaruh di Worklist."],
        ["Autonomy / Genset", "Lama backup nahan sebelum drop pertama / generator backup (memangkas separuh jam gelap)."],
        ["Event-confirmed", "Site muncul di feed BBT."],
      ]},
      { id: "dq", title: "Register kualitas data", kind: "table", headers: ["ID", "Isu", "Dampak", "Status"], statusCol: 3, rows: [
        ["A1", "Kolom koordinat rusak", "Peta awalnya selatan saja", "Beres"],
        ["A2", "Duplikat BBT Jan–Mar", "Metrik event Q1 salah", "Beres"],
        ["A3", "Timestamp event sebagai teks berkutip", "Sempat dinilai tak terpakai", "Diketahui"],
        ["A4", "Diskrepansi PLN-down 9× (per-event vs bulanan)", "Magnitudo PLN-down tak pasti", "Open"],
        ["A5", "Config hilang untuk sebagian site", "Rekomendasi buta", "Diketahui"],
        ["B1", "Wall-clock overstate 5,8×", "Headline melambung", "Beres"],
        ["B2", "NE-hours confound ukuran", "Menyesatkan sbg jam-dinding", "Diketahui"],
        ["B3", "Resolusi driver bulanan", "Sizing autonomy kasar", "Diketahui"],
        ["C1", "Unverified ~19%", "Tak bisa dikonfirmasi PLN", "Diketahui"],
        ["C2", "Site likely-dead", "Mengkontaminasi ranking mentah", "Diketahui"],
        ["C3", "Cakupan feed berbeda", "Sebagian site tanpa konteks", "Diketahui"],
        ["D1", "Feed event ≠ feed availability (TIS025, COA043)", "Pemilik fault bisa salah", "Open"],
        ["D2", "'Backup Held' menyesatkan", "Held padahal gelap ratusan jam", "Diketahui"],
        ["E1", "Fault bersandar ke feed event", "Site fault kronis salah label", "Open"],
        ["E2", "'Improving' itu relatif", "Site katastrofik bisa 'membaik'", "Diketahui"],
        ["E3", "Umur baterai tak prediktif", "'Ganti baterai tua' tak didukung", "Temuan"],
        ["F1", "Time-series city", "Chart tertinggal utk filter city", "Diketahui"],
        ["F2", "Selisih ~1% harian-vs-total", "Ketidakcocokan kecil", "Diketahui"],
        ["F3", "Jendela cakupan", "Availability & BBT sama-sama Jan–Jun", "Beres"],
        ["G", "Caveat cakupan", "Hanya H1 2026 AREA1; rata-rata estate", "Diketahui"],
      ]},
      { id: "guidance", title: "Panduan presentasi & roadmap", kind: "table", headers: ["Tipe", "Item"], rows: [
        ["Solid", "Availability 97,74% vs target 98,23% (gap −0,49pp)."],
        ["Solid", "Power = penyebab #1 gap availability (53,8%)."],
        ["Solid", "Backup gagal seiring durasi outage; umur tak memprediksi; genset memangkas separuh jam gelap."],
        ["Caveat", "Magnitudo absolut PLN-down tak pasti (A4)."],
        ["Caveat", "Verifikasi label fault site peringkat atas sebelum mengutip (D1/E1)."],
        ["Caveat", "'Unverified' ~19% dikecualikan dari PLN-terkonfirmasi secara sengaja (C1)."],
        ["Roadmap 1", "Tim data: selesaikan A4 + perbaiki Koordinat di sumber."],
        ["Roadmap 2", "Bangun flag audit-needed / unexplained-darkness (D1/E1)."],
        ["Roadmap 3", "Opsional: wire per-event untuk threshold autonomy ~1 jam."],
        ["Roadmap 4", "Tahan label 'improving' di site yang masih katastrofik."],
      ]},
      { id: "changelog", title: "Changelog", kind: "table", headers: ["Versi", "Perubahan"], rows: [
        ["v1", "Tool power-downtime awal: hitung outage, wall-clock downtime, peta, clusters/NOPs, drawer."],
        ["v2", "Konteks backup & baterai (verdict, umur, tipe, genset)."],
        ["v3", "Pattern/repeat/trend, drill harian per-site, kaskade geo + rentang tanggal, file cluster lazy."],
        ["v3.1a", "FIX koordinat: baca Long/Lat; peta menutup seluruh Sumatera (18.583 koordinat)."],
        ["v4", "Reframe availability-first: availability vs target, atribusi cause, fault split, site-dark jujur (1,01jt jam), temuan driver/genset/umur, ranking event-confirmed + Worklist, flag dead-site, ronde bug-fix."],
        ["v4 help", "Help in-app bilingual + toggle EN/ID + tooltip."],
        ["v5", "BBT berbasis durasi dari file bulanan Jan–Jun terkoreksi; fault split diperbarui (62,1/18,5/19,4); driver monotonik 19→73%; Monthly BBT di drawer. Per-event kemudian ditemukan bisa dipakai (~1 jam) — menunggu A4."],
      ]},
    ],
  },
};

const DOC_STATUS = (v) => {
  const t = String(v).toLowerCase();
  if (["resolved", "beres"].some((k) => t.includes(k))) return "bg-[#C6EFCE] text-[#006100]";
  if (t.includes("open")) return "bg-[#FFC7CE] text-[#9C0006]";
  return "bg-[#FFEB9C] text-[#9C6500]";
};

export function DocsView({ lang }) {
  const doc = DOCS[lang] || DOCS.en;
  const [q, setQ] = useState("");
  const ql = q.trim().toLowerCase();
  const match = (rows) => !ql ? rows : rows.filter((r) => r.some((c) => String(c).toLowerCase().includes(ql)));
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={lang === "id" ? "Cari di dokumentasi…" : "Search the docs…"}
          className="border border-line rounded-md px-3 py-1.5 text-[13px] w-64" />
        <span className="text-[11px] text-mut">{lang === "id" ? "Sama persis dengan file .xlsx" : "Mirrors the .xlsx doc"}</span>
      </div>
      {doc.sections.map((s) => {
        const rows = s.kind === "table" ? match(s.rows) : s.rows;
        if (s.kind === "table" && rows.length === 0) return null;
        return (
          <section key={s.id} className="bg-card border border-line rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 bg-navy text-white text-[13px] font-semibold">{s.title}</div>
            {s.kind === "kv" ? (
              <table className="w-full text-[12.5px]">
                <tbody>{s.rows.map((r, i) => (
                  <tr key={i} className="border-t border-line/70 align-top">
                    <td className="px-4 py-2 font-semibold text-navy bg-surface w-40">{r[0]}</td>
                    <td className="px-4 py-2 text-slate">{r[1]}</td>
                  </tr>))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-[12.5px]">
                <thead><tr className="bg-surface text-mut text-left">{s.headers.map((h, i) => <th key={i} className="px-4 py-1.5 font-semibold">{h}</th>)}</tr></thead>
                <tbody>{rows.map((r, i) => (
                  <tr key={i} className="border-t border-line/70 align-top">
                    {r.map((c, j) => (
                      <td key={j} className={`px-4 py-2 ${j === 0 ? "font-medium text-navy whitespace-nowrap" : "text-slate"}`}>
                        {s.statusCol === j ? <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${DOC_STATUS(c)}`}>{c}</span> : c}
                      </td>))}
                  </tr>))}
                </tbody>
              </table>
            )}
          </section>
        );
      })}
    </div>
  );
}
