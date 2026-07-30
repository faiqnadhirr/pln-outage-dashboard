"use client";
import React, { useEffect, useMemo, useState } from "react";
import {
  fmtInt, fmtH, fmt1, ImpactBar, Tag, PatternTag, RepeatTag, TrendTag, PATTERN, REPEAT,
  Kpi, DataTable, TopClustersBar, PatternMix, TimeSeries, MapScatter, Drawer, exportCsv,
} from "@/components/parts";

const TABS = ["Overview", "Sites", "Clusters", "NOPs", "Worklist", "Map"];
const CSV_COLS = [
  { key: "site_id", label: "Site ID" }, { key: "cluster", label: "Cluster (TO)" }, { key: "nop", label: "NOP" },
  { key: "region", label: "Region" }, { key: "class", label: "Class" }, { key: "n_outage", label: "PLN outages" },
  { key: "n_ne_down", label: "NE down" }, { key: "power_dt_hours", label: "Power downtime (h)" },
  { key: "lost_gb", label: "Lost-GB" }, { label: "Backup", get: (r) => r.backup_insufficient === true ? "insufficient" : r.backup_insufficient === false ? "held" : "no data" },
  { label: "Pattern", get: (r) => PATTERN[r.pattern]?.label }, { label: "Repeat", get: (r) => REPEAT[r.repeat]?.label },
  { key: "trend", label: "Trend" }, { key: "batt_age_yr", label: "Battery age (yr)" }, { key: "lat", label: "Lat" }, { key: "lng", label: "Lng" },
];

export default function Page() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState("Overview");
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState("");
  const [f, setF] = useState({ region: "", nop: "", cluster: "", cls: "", pattern: "", repeat: "", backup: "", trend: "", minOut: "", minDt: "", badgrid: false });
  const [thr, setThr] = useState(null);

  useEffect(() => {
    fetch("/data.json").then((r) => { if (!r.ok) throw new Error("data.json not found"); return r.json(); })
      .then((d) => {
        d.sites.forEach((s, i) => (s.__id = s.site_id + i));
        setData(d); setThr(d.meta.bad_grid_threshold_h);
        try { const rg = localStorage.getItem("myRegion"); if (rg) setF((x) => ({ ...x, region: rg })); } catch {}
      }).catch((e) => setErr(e.message));
  }, []);

  const options = useMemo(() => {
    if (!data) return { regions: [], nops: [], clusters: [] };
    const u = (k) => [...new Set(data.sites.map((s) => s[k]).filter(Boolean))].sort();
    return { regions: u("region"), nops: u("nop"), clusters: u("cluster") };
  }, [data]);

  const sites = useMemo(() => {
    if (!data) return [];
    const t = q.trim().toLowerCase();
    const T = thr ?? data.meta.bad_grid_threshold_h;
    return data.sites.filter((s) => {
      const bad = s.power_dt_hours >= T && s.power_dt_hours > 0;
      return (!t || s.site_id.toLowerCase().includes(t)) &&
        (!f.region || s.region === f.region) && (!f.nop || s.nop === f.nop) &&
        (!f.cluster || s.cluster === f.cluster) && (!f.cls || s.class === f.cls) &&
        (!f.pattern || s.pattern === f.pattern) && (!f.repeat || s.repeat === f.repeat) &&
        (!f.trend || s.trend === f.trend) &&
        (!f.backup || (f.backup === "insufficient" ? s.backup_insufficient === true : f.backup === "held" ? s.backup_insufficient === false : s.backup_insufficient == null)) &&
        (!f.minOut || s.n_outage >= +f.minOut) && (!f.minDt || s.power_dt_hours >= +f.minDt) &&
        (!f.badgrid || bad);
    });
  }, [data, q, f, thr]);

  const scopeSeries = useMemo(() => {
    if (!data) return null;
    const m = data.meta;
    if (!f.cluster && !f.nop && !f.region) return { name: "AREA1 (estate)", dt: m.estate_daily_dt, out: m.estate_daily_out };
    const pick = (arr, key, val) => arr.find((x) => x[key] === val);
    let o = f.cluster ? pick(data.clusters, "cluster", f.cluster) : f.nop ? pick(data.nops, "nop", f.nop) : pick(data.regions, "region", f.region);
    if (o && o.daily_dt) return { name: (f.cluster || f.nop || f.region), dt: o.daily_dt, out: o.daily_out || o.daily_dt.map(() => 0) };
    return { name: "AREA1 (estate)", dt: m.estate_daily_dt, out: m.estate_daily_out };
  }, [data, f.cluster, f.nop, f.region]);

  if (err) return <Center>Could not load data: {err}. Run the engine to generate <code>public/data.json</code>.</Center>;
  if (!data) return <Center><Spinner /> Loading AREA1 H1 dataset…</Center>;
  const m = data.meta;
  const siteMax = m.bad_grid_threshold_h * 3;
  const drill = (key, val) => { setF((x) => ({ ...x, cluster: "", nop: "", region: "", [key]: val })); setTab("Sites"); };
  const saveRegion = (rg) => { try { rg ? localStorage.setItem("myRegion", rg) : localStorage.removeItem("myRegion"); } catch {} };

  const siteCols = [
    { key: "rank", label: "#", sortable: false, render: (r, i) => <span className="text-mut tabular">{i + 1}</span> },
    { key: "site_id", label: "Site", render: (r) => <span className="font-semibold text-navy">{r.site_id}</span> },
    { key: "cluster", label: "Cluster", render: (r) => <span className="text-slate">{(r.cluster || "—").replace(/^TO /, "")}</span> },
    { key: "nop", label: "NOP", render: (r) => <span className="text-slate">{(r.nop || "—").replace(/^NOP /, "")}</span> },
    { key: "n_outage", label: "Outages", align: "right", render: (r) => fmtInt(r.n_outage) },
    { key: "n_ne_down", label: "NE down", align: "right", render: (r) => <span className="text-crit">{fmtInt(r.n_ne_down)}</span> },
    { key: "power_dt_hours", label: "Power downtime", render: (r) => <ImpactBar value={r.power_dt_hours} max={siteMax} /> },
    { key: "pattern", label: "Pattern", sortAccessor: (r) => r.pattern, render: (r) => <PatternTag p={r.pattern} /> },
    { key: "repeat", label: "Repeat", sortAccessor: (r) => ({ chronic: 3, intermittent: 2, one_off: 1, none: 0 }[r.repeat]), render: (r) => <RepeatTag r={r.repeat} /> },
    { key: "trend", label: "Trend", sortAccessor: (r) => ({ worsening: 2, stable: 1, improving: 0 }[r.trend]), render: (r) => <TrendTag t={r.trend} /> },
  ];
  const grpCols = (level, maxRef) => [
    { key: level, label: level === "cluster" ? "Cluster (TO)" : "NOP", render: (r) => <span className="font-semibold text-navy">{(r[level] || "—").replace(/^(TO|NOP) /, "")}</span> },
    { key: "nop", label: level === "cluster" ? "NOP" : "Region", render: (r) => <span className="text-slate">{level === "cluster" ? (r.nop || "—").replace(/^NOP /, "") : r.region}</span> },
    { key: "n_sites", label: "Sites", align: "right", render: (r) => fmtInt(r.n_sites) },
    { key: "n_outage", label: "Outages", align: "right", render: (r) => fmtInt(r.n_outage) },
    { key: "avg_outage_dur_min", label: "Avg outage", align: "right", render: (r) => r.avg_outage_dur_min ? r.avg_outage_dur_min + "m" : "—" },
    { key: "power_dt_hours", label: "Power downtime", render: (r) => <ImpactBar value={r.power_dt_hours} max={maxRef} /> },
    { key: "trend", label: "Trend", sortAccessor: (r) => ({ worsening: 2, stable: 1, improving: 0 }[r.trend]), render: (r) => <TrendTag t={r.trend} /> },
    { key: "bad_grid_sites", label: "Bad-grid", align: "right", render: (r) => <span className="text-crit">{fmtInt(r.bad_grid_sites)}</span> },
    { key: "insuff_sites", label: "Backup insuf.", align: "right", render: (r) => <span className="text-amber">{fmtInt(r.insuff_sites)}</span> },
    { key: "go", label: "", sortable: false, render: () => <span className="text-mut text-[12px]">sites →</span> },
  ];
  const noData = data.sites.filter((s) => s.in_events === false);
  const worsening = data.clusters.filter((c) => c.trend === "worsening").slice(0, 6);
  const improving = data.clusters.filter((c) => c.trend === "improving").slice(0, 6);

  return (
    <div className="min-h-screen">
      <header className="bg-navy text-white">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-3 flex items-end justify-between flex-wrap gap-2">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-amber font-semibold">Power Operations Intelligence</div>
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">PLN Outage — Top-Site Analysis</h1>
            <div className="text-[12px] text-white/60">AREA1 · H1 2026 (Jan–Jun)</div>
          </div>
          <div className="text-right text-[12px] text-white/70">
            <div className="inline-flex items-center gap-1.5 bg-white/10 rounded px-2 py-1"><span className="w-1.5 h-1.5 rounded-full bg-ok inline-block" /> Data as of {m.generated}</div>
            <div className="text-white/50 mt-1">{fmtInt(m.n_sites)} sites · {fmtInt(m.total_outages)} outages</div>
          </div>
        </div>
        <nav className="max-w-[1360px] mx-auto px-4 sm:px-6 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 sm:px-4 py-2 text-[13px] font-medium border-b-2 -mb-px whitespace-nowrap ${tab === t ? "border-amber text-white" : "border-transparent text-white/55 hover:text-white/85"}`}>
              {t}{t === "Worklist" && <span className="ml-1 text-[10px] bg-amber/80 text-white rounded-full px-1.5">{fmtInt(noData.length)}</span>}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-[1360px] mx-auto px-4 sm:px-6 py-6 space-y-6">
        {tab === "Overview" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="Sites impacted" value={fmtInt(m.n_sites_impacted)} sub={`of ${fmtInt(m.n_sites)}`} />
              <Kpi label="PLN outages" value={fmtInt(m.total_outages)} sub={`avg ${m.avg_outage_dur_min}m each`} tone="slate" />
              <Kpi label="Network-down" value={fmtInt(m.total_ne_down)} sub="backup failed" tone="crit" />
              <Kpi label="Power downtime" value={fmtH(m.total_power_dt_hours)} sub="wall-clock, all sites" tone="amber" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="Chronic sites" value={fmtInt(m.repeat_counts.chronic)} sub="bad ≥4 of 6 months" tone="crit" />
              <Kpi label="Avg outages / site" value={fmt1(m.avg_outage_per_site)} sub="event-fed sites" tone="slate" />
              <Kpi label="Backup insufficient" value={fmtInt(data.sites.filter((s) => s.backup_insufficient === true).length)} sub="site went down" tone="amber" />
              <Kpi label="Needs verification" value={fmtInt(noData.length)} sub="no event data" tone="slate" />
            </div>

            <Card title="Power downtime & PLN outages over time" note="Switch grain · scope follows your Region/NOP/Cluster filter">
              <div className="flex flex-wrap gap-2 mb-2 items-center text-[12px]">
                <span className="text-mut">Scope:</span>
                <select value={f.region} onChange={(e) => setF((x) => ({ ...x, region: e.target.value, nop: "", cluster: "" }))} className="border border-line rounded px-2 py-1 bg-card">
                  <option value="">All regions</option>{options.regions.map((o) => <option key={o}>{o}</option>)}</select>
                <select value={f.cluster} onChange={(e) => setF((x) => ({ ...x, cluster: e.target.value, nop: "" }))} className="border border-line rounded px-2 py-1 bg-card">
                  <option value="">All clusters</option>{options.clusters.map((o) => <option key={o}>{o.replace(/^TO /, "")}</option>)}</select>
                <span className="text-navy font-medium ml-1">→ {scopeSeries?.name}</span>
              </div>
              <TimeSeries dates={m.dates} dt={scopeSeries.dt} out={scopeSeries.out} />
            </Card>

            <div className="grid md:grid-cols-2 gap-6">
              <Card title="Worst clusters by power downtime" note="Top 10">
                <TopClustersBar data={data.clusters} />
              </Card>
              <Card title="Site problem patterns" note="Click a pattern to filter the Sites tab">
                <PatternMix counts={m.pattern_counts} onPick={(k) => drill("pattern", k)} />
                <div className="mt-3 text-[11px] text-mut">Each pattern implies a different action — see the site drawer for the suggested direction.</div>
              </Card>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <Card title="Clusters getting worse" note="Apr–Jun vs Jan–Mar">
                <ChangeList rows={worsening} tone="crit" onPick={(c) => drill("cluster", c.cluster)} />
              </Card>
              <Card title="Clusters improving" note="Apr–Jun vs Jan–Mar">
                <ChangeList rows={improving} tone="ok" onPick={(c) => drill("cluster", c.cluster)} />
              </Card>
            </div>

            <Card title="Top 15 worst sites" note="Ranked by power downtime">
              <DataTable columns={siteCols} rows={data.sites} maxRows={15} initialSort={{ key: "power_dt_hours", dir: "desc" }} onRowClick={setSel} />
            </Card>
          </>
        )}

        {tab === "Sites" && (
          <>
            <Filters {...{ f, setF, q, setQ, options, thr, setThr, m, saveRegion }}
              count={sites.length} total={data.sites.length}
              onClear={() => { setF({ region: "", nop: "", cluster: "", cls: "", pattern: "", repeat: "", backup: "", trend: "", minOut: "", minDt: "", badgrid: false }); setQ(""); saveRegion(""); }}
              onExport={() => exportCsv(sites.slice(0, 5000), CSV_COLS, `pln_sites_${Date.now()}.csv`)} />
            <DataTable columns={siteCols} rows={sites} maxRows={500} initialSort={{ key: "power_dt_hours", dir: "desc" }} onRowClick={setSel} />
          </>
        )}
        {tab === "Clusters" && (
          <Card title="Clusters (TO) ranked by power downtime" note="Click a row to drill into its sites">
            <DataTable columns={grpCols("cluster", data.clusters[0].power_dt_hours)} rows={data.clusters} maxRows={100} initialSort={{ key: "power_dt_hours", dir: "desc" }} onRowClick={(r) => drill("cluster", r.cluster)} />
          </Card>
        )}
        {tab === "NOPs" && (
          <Card title="NOP ranked by power downtime" note="Click a row to drill into its sites">
            <DataTable columns={grpCols("nop", data.nops[0].power_dt_hours)} rows={data.nops} maxRows={100} initialSort={{ key: "power_dt_hours", dir: "desc" }} onRowClick={(r) => drill("nop", r.nop)} />
          </Card>
        )}
        {tab === "Worklist" && (
          <Card title="Manual-check worklist" note={`${fmtInt(noData.length)} sites absent from the event feed — backup behaviour unknown`}>
            <div className="flex justify-between items-center mb-3">
              <p className="text-[13px] text-slate max-w-2xl">These sites have measured power downtime but no PLN-event records, so we cannot confirm whether backup held. They need field verification before any backup conclusion.</p>
              <button onClick={() => exportCsv(noData, CSV_COLS, `pln_worklist_nodata_${Date.now()}.csv`)} className="shrink-0 bg-navy text-white text-[12px] rounded px-3 py-1.5 hover:bg-navy/90">Export CSV</button>
            </div>
            <DataTable columns={siteCols.filter((c) => !["pattern", "repeat"].includes(c.key))} rows={noData} maxRows={500} initialSort={{ key: "power_dt_hours", dir: "desc" }} onRowClick={setSel} />
          </Card>
        )}
        {tab === "Map" && (
          <Card title="Bad-grid geography" note="Sites with coordinates · colour & size = power downtime">
            <MapScatter sites={sites.length && (f.region || f.nop || f.cluster || f.pattern || f.badgrid || q) ? sites : data.sites} onPick={setSel} />
          </Card>
        )}
      </main>

      <footer className="max-w-[1360px] mx-auto px-4 sm:px-6 py-6 text-[11px] text-mut">
        Impact = power-attributable network downtime (wall-clock, capped 24h/day), inherently genset-adjusted. “Backup insufficient” = the site went down despite backup; “no data” = absent from the event feed (not confirmed OK). Lost-GB is a payload proxy (Jan–Apr). Trend compares Apr–Jun vs Jan–Mar. Estate-level analysis — no per-site engineering audit. Data as of {m.generated}.
      </footer>
      <Drawer site={sel} months={m.months} onClose={() => setSel(null)} />
    </div>
  );
}

function Filters({ f, setF, q, setQ, options, thr, setThr, m, saveRegion, count, total, onClear, onExport }) {
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const Sel = ({ k, label, opts, onChange }) => (
    <select value={f[k]} onChange={(e) => { set(k, e.target.value); onChange && onChange(e.target.value); }}
      className="border border-line rounded-md px-2 py-1.5 text-[12px] bg-card text-navy">
      <option value="">{label}</option>{opts.map((o) => <option key={o.v ?? o} value={o.v ?? o}>{o.l ?? o.replace(/^(TO|NOP) /, "")}</option>)}
    </select>
  );
  return (
    <div className="bg-card border border-line rounded-lg px-3 py-2.5 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Site ID…" className="border border-line rounded-md px-2.5 py-1.5 text-[12px] w-36" />
        <Sel k="region" label="All regions" opts={options.regions} onChange={saveRegion} />
        <Sel k="nop" label="All NOPs" opts={options.nops} />
        <Sel k="cluster" label="All clusters" opts={options.clusters} />
        <Sel k="pattern" label="Any pattern" opts={Object.keys(PATTERN).map((k) => ({ v: k, l: PATTERN[k].label }))} />
        <Sel k="repeat" label="Any repeat" opts={[{ v: "chronic", l: "Chronic" }, { v: "intermittent", l: "Intermittent" }, { v: "one_off", l: "One-off" }]} />
        <Sel k="backup" label="Any backup" opts={[{ v: "insufficient", l: "Insufficient" }, { v: "held", l: "Held" }, { v: "nodata", l: "No data" }]} />
        <Sel k="trend" label="Any trend" opts={[{ v: "worsening", l: "Worsening" }, { v: "improving", l: "Improving" }, { v: "stable", l: "Stable" }]} />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-mut">Min outages</span><input type="number" value={f.minOut} onChange={(e) => set("minOut", e.target.value)} className="border border-line rounded px-1.5 py-1 w-16" placeholder="0" />
        <span className="text-mut ml-1">Min downtime (h)</span><input type="number" value={f.minDt} onChange={(e) => set("minDt", e.target.value)} className="border border-line rounded px-1.5 py-1 w-16" placeholder="0" />
        <span className="w-px h-5 bg-line mx-1" />
        <label className="flex items-center gap-1.5 text-slate cursor-pointer"><input type="checkbox" checked={f.badgrid} onChange={(e) => set("badgrid", e.target.checked)} className="accent-amber" />Bad-grid</label>
        <span className="text-mut ml-1">threshold ≥</span><input type="number" value={thr ?? ""} onChange={(e) => setThr(e.target.value === "" ? m.bad_grid_threshold_h : +e.target.value)} className="border border-line rounded px-1.5 py-1 w-16" /><span className="text-mut">h</span>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-mut"><span className="tabular font-semibold text-navy">{fmtInt(count)}</span> / {fmtInt(total)}</span>
          <button onClick={onExport} className="bg-navy text-white rounded px-3 py-1.5 hover:bg-navy/90">Export CSV</button>
          <button onClick={onClear} className="text-amber hover:underline">Clear</button>
        </div>
      </div>
    </div>
  );
}
function ChangeList({ rows, tone, onPick }) {
  if (rows.length === 0) return <div className="text-mut text-sm py-4">None this period.</div>;
  return (
    <div className="divide-y divide-line">
      {rows.map((c) => (
        <div key={c.cluster} onClick={() => onPick(c)} className="flex items-center justify-between py-2 cursor-pointer hover:bg-surface px-1 rounded">
          <div><div className="font-medium text-navy text-[13px]">{c.cluster.replace(/^TO /, "")}</div><div className="text-[11px] text-mut">{c.nop?.replace(/^NOP /, "")} · {fmtInt(c.n_sites)} sites</div></div>
          <div className="text-right"><div className={`text-[13px] font-semibold ${tone === "crit" ? "text-crit" : "text-ok"}`}>{fmtH(c.power_dt_hours)}</div><TrendTag t={c.trend} /></div>
        </div>
      ))}
    </div>
  );
}
const Card = ({ title, note, children }) => (
  <section className="bg-card border border-line rounded-lg">
    <div className="px-4 py-3 border-b border-line flex items-baseline justify-between gap-2 flex-wrap">
      <h3 className="text-[14px] font-semibold text-navy">{title}</h3>{note && <span className="text-[11px] text-mut">{note}</span>}
    </div>
    <div className="p-4">{children}</div>
  </section>
);
const Center = ({ children }) => <div className="min-h-screen flex items-center justify-center text-slate text-sm gap-2 px-6 text-center">{children}</div>;
const Spinner = () => <span className="inline-block w-4 h-4 border-2 border-amber border-t-transparent rounded-full animate-spin" />;
