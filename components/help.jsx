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
