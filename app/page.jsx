"use client";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  fmtInt, fmtH, fmt1, ImpactBar, Tag, PatternTag, RepeatTag, TrendTag, PATTERN, REPEAT,
  Kpi, DataTable, TopClustersBar, PatternMatrix, TimeSeries, GroupBars, GensetDonut,
  RangeControl, Drawer, exportCsv,
} from "@/components/parts";

const LeafletMap = dynamic(() => import("@/components/LeafletMap"), { ssr: false, loading: () => <div className="text-mut text-sm p-6">Loading map…</div> });
const TABS = ["Overview", "Sites", "Clusters", "NOPs", "Worklist", "Map"];
const slugOf = (c) => (c || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const CSV_COLS = [
  { key: "site_id", label: "Site ID" }, { key: "city", label: "City" }, { key: "cluster", label: "Cluster (TO)" }, { key: "nop", label: "NOP" },
  { key: "region", label: "Region" }, { key: "class", label: "Class" }, { key: "n_outage", label: "PLN outages (H1)" },
  { key: "n_ne_down", label: "NE down" }, { key: "power_dt_hours", label: "Power downtime H1 (h)" },
  { label: "Downtime in range (h)", get: (r) => r._rdt != null ? Math.round(r._rdt) : "" },
  { label: "Backup", get: (r) => r.backup_insufficient === true ? "insufficient" : r.backup_insufficient === false ? "held" : "no data" },
  { label: "Pattern", get: (r) => PATTERN[r.pattern]?.label }, { label: "Repeat", get: (r) => REPEAT[r.repeat]?.label },
  { key: "trend", label: "Trend" }, { key: "lat", label: "Lat" }, { key: "lng", label: "Lng" },
];

export default function Page() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState("Overview");
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState("");
  const [g, setG] = useState({ region: "", nop: "", cluster: "", city: "" });        // GLOBAL geo filter
  const [f, setF] = useState({ pattern: "", repeat: "", backup: "", trend: "", minOut: "", minDt: "", badgrid: false }); // LOCAL (Sites)
  const [thr, setThr] = useState(null);
  const [range, setRange] = useState({ s: 0, e: 0 });
  const [siteDaily, setSiteDaily] = useState({});
  const [loadedCl, setLoadedCl] = useState({});
  const [loadingDaily, setLoadingDaily] = useState(false);

  useEffect(() => {
    fetch("/data.json").then((r) => { if (!r.ok) throw new Error("data.json not found"); return r.json(); })
      .then((d) => {
        d.sites.forEach((s, i) => (s.__id = s.site_id + i));
        setData(d); setThr(d.meta.bad_grid_threshold_h); setRange({ s: 0, e: d.meta.dates.length - 1 });
        try { const rg = localStorage.getItem("myRegion"); if (rg) setG((x) => ({ ...x, region: rg })); } catch {}
      }).catch((e) => setErr(e.message));
  }, []);

  const full = data ? (range.s === 0 && range.e === data.meta.dates.length - 1) : true;
  const sliceSum = useCallback((arr) => arr ? arr.slice(range.s, range.e + 1).reduce((a, b) => a + (b || 0), 0) : 0, [range]);

  // cascading geo options
  const geoOpts = useMemo(() => {
    if (!data) return { regions: [], nops: [], clusters: [], cities: [] };
    const S = data.sites;
    const uniq = (arr, k) => [...new Set(arr.map((s) => s[k]).filter(Boolean))].sort();
    const byR = g.region ? S.filter((s) => s.region === g.region) : S;
    const byN = g.nop ? byR.filter((s) => s.nop === g.nop) : byR;
    const byC = g.cluster ? byN.filter((s) => s.cluster === g.cluster) : byN;
    return { regions: uniq(S, "region"), nops: uniq(byR, "nop"), clusters: uniq(byN, "cluster"), cities: uniq(byC, "city") };
  }, [data, g]);

  const geoSites = useMemo(() => !data ? [] : data.sites.filter((s) =>
    (!g.region || s.region === g.region) && (!g.nop || s.nop === g.nop) && (!g.cluster || s.cluster === g.cluster) && (!g.city || s.city === g.city)), [data, g]);

  const neededClusters = useMemo(() => [...new Set(geoSites.map((s) => s.cluster).filter(Boolean))], [geoSites]);
  useEffect(() => {
    if (full || !data) return;
    const slugs = [...new Set(neededClusters.map(slugOf))].filter((s) => s && !loadedCl[s]);
    if (!slugs.length) return;
    setLoadingDaily(true);
    Promise.all(slugs.map((sl) => fetch(`/clusters/${sl}.json`).then((r) => r.ok ? r.json() : {}).catch(() => ({})).then((o) => ({ sl, o }))))
      .then((res) => {
        setSiteDaily((prev) => { const nx = { ...prev }; res.forEach(({ o }) => Object.entries(o).forEach(([sid, v]) => { if (v.d) nx[sid] = v.d; })); return nx; });
        setLoadedCl((prev) => { const nx = { ...prev }; res.forEach(({ sl }) => (nx[sl] = true)); return nx; });
      }).finally(() => setLoadingDaily(false));
  }, [full, data, neededClusters, loadedCl]);

  const rdt = useCallback((s) => full ? s.power_dt_hours : (siteDaily[s.site_id] ? Math.round(sliceSum(siteDaily[s.site_id]) * 10) / 10 : 0), [full, siteDaily, sliceSum]);

  // geoSites decorated with range downtime
  const gSites = useMemo(() => geoSites.map((s) => ({ ...s, _rdt: rdt(s) })), [geoSites, rdt]);

  // Sites tab = gSites + local filters + search
  const sites = useMemo(() => {
    const t = q.trim().toLowerCase(); const T = thr ?? (data ? data.meta.bad_grid_threshold_h : 0);
    return gSites.filter((s) => {
      const bad = s._rdt >= T && s._rdt > 0;
      return (!t || s.site_id.toLowerCase().includes(t)) &&
        (!f.pattern || s.pattern === f.pattern) && (!f.repeat || s.repeat === f.repeat) && (!f.trend || s.trend === f.trend) &&
        (!f.backup || (f.backup === "insufficient" ? s.backup_insufficient === true : f.backup === "held" ? s.backup_insufficient === false : s.backup_insufficient == null)) &&
        (!f.minOut || s.n_outage >= +f.minOut) && (!f.minDt || s._rdt >= +f.minDt) && (!f.badgrid || bad);
    });
  }, [gSites, q, f, thr, data]);

  // group rollups computed from gSites (range-aware) + merged trend/avg from precomputed
  const metaLook = useMemo(() => {
    if (!data) return { cluster: {}, nop: {} };
    const mk = (arr, k) => Object.fromEntries(arr.map((o) => [o[k], o]));
    return { cluster: mk(data.clusters, "cluster"), nop: mk(data.nops, "nop") };
  }, [data]);
  const groupRows = useCallback((level) => {
    const T = thr ?? (data ? data.meta.bad_grid_threshold_h : 0);
    const map = new Map();
    gSites.forEach((s) => {
      const k = s[level]; if (!k) return;
      const d = map.get(k) || { [level]: k, nop: s.nop, region: s.region, n_sites: 0, n_outage: 0, n_ne_down: 0, power_dt_hours: 0, bad_grid_sites: 0, insuff_sites: 0 };
      d.n_sites++; d.n_outage += s.n_outage; d.n_ne_down += s.n_ne_down; d.power_dt_hours += s._rdt;
      d.bad_grid_sites += (s._rdt >= T && s._rdt > 0) ? 1 : 0; d.insuff_sites += s.backup_insufficient === true ? 1 : 0;
      map.set(k, d);
    });
    return [...map.values()].map((d) => { const meta = metaLook[level][d[level]] || {}; return { ...d, power_dt_hours: Math.round(d.power_dt_hours), avg_outage_dur_min: meta.avg_outage_dur_min, trend: meta.trend || "stable", earlier_h: meta.earlier_h, recent_h: meta.recent_h, delta_pct: meta.delta_pct }; })
      .sort((a, b) => b.power_dt_hours - a.power_dt_hours);
  }, [gSites, thr, data, metaLook]);
  const clustersG = useMemo(() => groupRows("cluster"), [groupRows]);
  const nopsG = useMemo(() => groupRows("nop"), [groupRows]);

  const scopeSeries = useMemo(() => {
    if (!data) return null; const m = data.meta;
    if (!g.cluster && !g.nop && !g.region) return { name: "AREA1 (estate)", dt: m.estate_daily_dt, out: m.estate_daily_out };
    const pick = (arr, k, v) => arr.find((x) => x[k] === v);
    const o = g.cluster ? pick(data.clusters, "cluster", g.cluster) : g.nop ? pick(data.nops, "nop", g.nop) : pick(data.regions, "region", g.region);
    if (o && o.daily_dt) return { name: (g.cluster || g.nop || g.region), dt: o.daily_dt, out: o.daily_out || o.daily_dt.map(() => 0) };
    return { name: "AREA1 (estate)", dt: m.estate_daily_dt, out: m.estate_daily_out };
  }, [data, g]);

  if (err) return <Center>Could not load data: {err}. Run the engine to generate <code>public/data.json</code>.</Center>;
  if (!data) return <Center><Spinner /> Loading AREA1 H1 dataset…</Center>;
  const m = data.meta;
  const siteMax = m.bad_grid_threshold_h * 3;
  const dates = m.dates;
  const estDt = Math.round(gSites.reduce((a, s) => a + (s._rdt || 0), 0));
  const estOut = gSites.reduce((a, s) => a + s.n_outage, 0);
  const estNe = gSites.reduce((a, s) => a + s.n_ne_down, 0);
  const impacted = gSites.filter((s) => s._rdt > 0).length;
  const chronic = gSites.filter((s) => s.repeat === "chronic").length;
  const insuff = gSites.filter((s) => s.backup_insufficient === true).length;
  const noData = gSites.filter((s) => s.in_events === false);
  const worsening = clustersG.filter((c) => c.trend === "worsening").sort((a, b) => (b.delta_pct || 0) - (a.delta_pct || 0)).slice(0, 6);
  const rangeLabel = full ? "Full H1" : `${dates[range.s].slice(6, 8)}/${dates[range.s].slice(4, 6)} – ${dates[range.e].slice(6, 8)}/${dates[range.e].slice(4, 6)}`;
  const scopeLabel = g.city || g.cluster || g.nop || g.region || "AREA1";
  const drill = (key, val) => { setG({ region: "", nop: "", cluster: "", city: "", [key]: val }); setTab("Sites"); };

  // auto-insight
  const worstCluster = clustersG[0];
  const insight = `${scopeLabel}: ${fmtInt(impacted)} sites impacted · ${fmtH(estDt)} power downtime${full ? "" : " in " + rangeLabel}. ` +
    (worstCluster ? `Worst cluster ${worstCluster.cluster.replace(/^TO /, "")} (${fmtH(worstCluster.power_dt_hours)}). ` : "") +
    `${fmtInt(chronic)} chronic sites, ${fmtInt(worsening.length)} clusters worsening, ${fmtInt(noData.length)} need verification.`;

  const dtCol = { key: "power_dt_hours", label: full ? "Power downtime" : "Downtime (range)", sortAccessor: (r) => r._rdt ?? r.power_dt_hours, render: (r) => <ImpactBar value={r._rdt ?? r.power_dt_hours} max={siteMax} /> };
  const siteCols = [
    { key: "rank", label: "#", sortable: false, render: (r, i) => <span className="text-mut tabular">{i + 1}</span> },
    { key: "site_id", label: "Site", render: (r) => <span className="font-semibold text-navy">{r.site_id}</span> },
    { key: "city", label: "City", render: (r) => <span className="text-slate">{r.city || "—"}</span> },
    { key: "cluster", label: "Cluster", render: (r) => <span className="text-slate">{(r.cluster || "—").replace(/^TO /, "")}</span> },
    { key: "n_outage", label: "Outages", align: "right", render: (r) => fmtInt(r.n_outage) },
    { key: "n_ne_down", label: "NE down", align: "right", render: (r) => <span className="text-crit">{fmtInt(r.n_ne_down)}</span> },
    dtCol,
    { key: "pattern", label: "Pattern", sortAccessor: (r) => r.pattern, render: (r) => <PatternTag p={r.pattern} /> },
    { key: "repeat", label: "Repeat", sortAccessor: (r) => ({ chronic: 3, intermittent: 2, one_off: 1, none: 0 }[r.repeat]), render: (r) => <RepeatTag r={r.repeat} /> },
    { key: "trend", label: "Trend", sortAccessor: (r) => ({ worsening: 2, stable: 1, improving: 0 }[r.trend]), render: (r) => <TrendTag t={r.trend} /> },
  ];
  const grpCols = (level, rows) => [
    { key: level, label: level === "cluster" ? "Cluster (TO)" : "NOP", render: (r) => <span className="font-semibold text-navy">{(r[level] || "—").replace(/^(TO|NOP) /, "")}</span> },
    { key: "nop", label: level === "cluster" ? "NOP" : "Region", render: (r) => <span className="text-slate">{level === "cluster" ? (r.nop || "—").replace(/^NOP /, "") : r.region}</span> },
    { key: "n_sites", label: "Sites", align: "right", render: (r) => fmtInt(r.n_sites) },
    { key: "n_outage", label: "Outages", align: "right", render: (r) => fmtInt(r.n_outage) },
    { key: "avg_outage_dur_min", label: "Avg outage", align: "right", render: (r) => r.avg_outage_dur_min ? r.avg_outage_dur_min + "m" : "—" },
    { key: "power_dt_hours", label: full ? "Power downtime" : "Downtime (range)", render: (r) => <ImpactBar value={r.power_dt_hours} max={rows[0]?.power_dt_hours || 1} /> },
    { key: "trend", label: "Trend", sortAccessor: (r) => ({ worsening: 2, stable: 1, improving: 0 }[r.trend]), render: (r) => <TrendTag t={r.trend} /> },
    { key: "bad_grid_sites", label: "Bad-grid", align: "right", render: (r) => <span className="text-crit">{fmtInt(r.bad_grid_sites)}</span> },
    { key: "insuff_sites", label: "Backup insuf.", align: "right", render: (r) => <span className="text-amber">{fmtInt(r.insuff_sites)}</span> },
    { key: "go", label: "", sortable: false, render: () => <span className="text-mut text-[12px]">sites →</span> },
  ];

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
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 pb-2 space-y-1.5">
          <GeoBar g={g} setG={setG} opts={geoOpts} />
          <div className="bg-white/5 rounded-md px-3 py-2"><RangeControl dates={dates} range={range} setRange={setRange} /></div>
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

      {!full && <div className="bg-amber/10 border-b border-amber/30 text-[12px] text-navy px-4 sm:px-6 py-1.5">
        Showing <b>{rangeLabel}</b> · scope <b>{scopeLabel}</b>. Downtime totals reflect this window; pattern/repeat/backup/trend describe full H1.{loadingDaily && <span className="ml-2 text-amber">· loading daily detail…</span>}</div>}

      <main className="max-w-[1360px] mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="bg-card border border-line rounded-lg px-4 py-2.5 text-[13px] text-navy flex items-start gap-2">
          <span className="text-amber font-bold">◆</span><span>{insight}</span>
        </div>

        {tab === "Overview" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="Sites impacted" value={fmtInt(impacted)} sub={`of ${fmtInt(gSites.length)} in scope`} />
              <Kpi label="PLN outages (H1)" value={fmtInt(estOut)} sub={`avg ${m.avg_outage_dur_min}m each`} tone="slate" />
              <Kpi label="Network-down (H1)" value={fmtInt(estNe)} sub="backup failed" tone="crit" />
              <Kpi label={full ? "Power downtime" : "Downtime (range)"} value={fmtH(estDt)} sub={full ? "wall-clock" : rangeLabel} tone="amber" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="Chronic sites" value={fmtInt(chronic)} sub="bad ≥4 of 6 months" tone="crit" />
              <Kpi label="Avg outages / site" value={fmt1(m.avg_outage_per_site)} sub="estate (H1)" tone="slate" />
              <Kpi label="Backup insufficient" value={fmtInt(insuff)} sub="site went down" tone="amber" />
              <Kpi label="Needs verification" value={fmtInt(noData.length)} sub="no event data" tone="slate" />
            </div>

            <Card title="Power downtime & PLN outages over time" note={`Scope: ${scopeSeries?.name} · grain below`}>
              <TimeSeries dates={dates} dt={scopeSeries.dt} out={scopeSeries.out} />
            </Card>

            <div className="grid md:grid-cols-2 gap-6">
              <Card title="Worst clusters by power downtime" note={`Top 10 · ${rangeLabel}`}><TopClustersBar data={clustersG} /></Card>
              <Card title="Genset-adjusted outcome" note="Did backup hold when PLN fell?">
                <GensetDonut held={estOut - estNe} down={estNe} />
                <div className="mt-3 text-[11px] text-mut">Backup carried {estOut ? Math.round(((estOut - estNe) / estOut) * 100) : 0}% of PLN outages in scope.</div>
              </Card>
            </div>

            <Card title="Site locations" note="OpenStreetMap · colour & size = downtime · click a site">
              <LeafletMap sites={gSites} onPick={setSel} />
            </Card>

            <div className="grid md:grid-cols-2 gap-6">
              <Card title="Site problem patterns" note="Pattern × how-often · click a cell to filter"><PatternMatrix sites={gSites} onPick={(p, r) => { setF((x) => ({ ...x, pattern: p, repeat: r })); setTab("Sites"); }} /></Card>
              <Card title="Clusters getting worse" note="Apr–Jun vs Jan–Mar · hover for why"><ChangeList rows={worsening} onPick={(c) => drill("cluster", c.cluster)} /></Card>
            </div>

            <Card title="Top 15 worst sites" note={`${scopeLabel} · ${rangeLabel}`}>
              <DataTable columns={siteCols} rows={gSites} maxRows={15} initialSort={{ key: "power_dt_hours", dir: "desc" }} onRowClick={setSel} />
            </Card>
          </>
        )}

        {tab === "Sites" && (
          <>
            <Filters {...{ f, setF, q, setQ, thr, setThr, m }} count={sites.length} total={gSites.length}
              onClear={() => { setF({ pattern: "", repeat: "", backup: "", trend: "", minOut: "", minDt: "", badgrid: false }); setQ(""); }}
              onExport={() => exportCsv(sites.slice(0, 5000), CSV_COLS, `pln_sites_${Date.now()}.csv`)} />
            <div className="grid md:grid-cols-2 gap-6">
              <Card title="Pattern × repeat of selection"><PatternMatrix sites={sites} onPick={(p, r) => setF((x) => ({ ...x, pattern: p, repeat: r }))} /></Card>
              <Card title="Top clusters in selection"><GroupBars rows={groupRows("cluster")} labelKey="cluster" n={10} onPick={(r) => r && setG((x) => ({ ...x, cluster: clustersG.find((c) => c.cluster.replace(/^TO /, "") === r.name)?.cluster || "" }))} /></Card>
            </div>
            <DataTable columns={siteCols} rows={sites} maxRows={500} initialSort={{ key: "power_dt_hours", dir: "desc" }} onRowClick={setSel} />
          </>
        )}
        {tab === "Clusters" && (
          <>
            <Card title="Clusters (TO) by power downtime" note={`${scopeLabel} · ${rangeLabel}`}><GroupBars rows={clustersG} labelKey="cluster" n={14} onPick={(r) => r && drill("cluster", clustersG.find((c) => c.cluster.replace(/^TO /, "") === r.name)?.cluster || r.cluster)} /></Card>
            <Card title="All clusters" note="Click a row to drill into its sites"><DataTable columns={grpCols("cluster", clustersG)} rows={clustersG} maxRows={100} initialSort={{ key: "power_dt_hours", dir: "desc" }} onRowClick={(r) => drill("cluster", r.cluster)} /></Card>
          </>
        )}
        {tab === "NOPs" && (
          <>
            <Card title="NOPs by power downtime" note={`${scopeLabel} · ${rangeLabel}`}><GroupBars rows={nopsG} labelKey="nop" n={14} onPick={(r) => r && drill("nop", nopsG.find((c) => c.nop.replace(/^NOP /, "") === r.name)?.nop || r.nop)} /></Card>
            <Card title="All NOPs" note="Click a row to drill into its sites"><DataTable columns={grpCols("nop", nopsG)} rows={nopsG} maxRows={100} initialSort={{ key: "power_dt_hours", dir: "desc" }} onRowClick={(r) => drill("nop", r.nop)} /></Card>
          </>
        )}
        {tab === "Worklist" && (
          <Card title="Manual-check worklist" note={`${fmtInt(noData.length)} sites in scope with no event data`}>
            <div className="flex justify-between items-center mb-3 gap-3 flex-wrap">
              <p className="text-[13px] text-slate max-w-2xl">Measured power downtime but no PLN-event records — backup behaviour unconfirmed. Field verification needed before any backup conclusion.</p>
              <button onClick={() => exportCsv(noData, CSV_COLS, `pln_worklist_${Date.now()}.csv`)} className="shrink-0 bg-navy text-white text-[12px] rounded px-3 py-1.5 hover:bg-navy/90">Export CSV</button>
            </div>
            <DataTable columns={siteCols.filter((c) => !["pattern", "repeat"].includes(c.key))} rows={noData} maxRows={500} initialSort={{ key: "power_dt_hours", dir: "desc" }} onRowClick={setSel} />
          </Card>
        )}
        {tab === "Map" && (
          <Card title="Bad-grid geography" note="OpenStreetMap · colour & size = power downtime · click a site">
            <LeafletMap sites={gSites} onPick={setSel} />
          </Card>
        )}
      </main>

      <footer className="max-w-[1360px] mx-auto px-4 sm:px-6 py-6 text-[11px] text-mut">
        Impact = power-attributable network downtime (wall-clock, capped 24h/day), genset-adjusted. In a custom period, downtime reflects the window; pattern/repeat/backup/trend describe full H1. “Backup insufficient” = site went down despite backup; “no data” = absent from the event feed. Estate-level analysis. Data as of {m.generated}.
      </footer>
      <Drawer site={sel} months={m.months} onClose={() => setSel(null)} />
    </div>
  );
}

function GeoBar({ g, setG, opts }) {
  const Sel = ({ k, label, list, reset }) => (
    <select value={g[k]} onChange={(e) => setG((x) => ({ ...x, [k]: e.target.value, ...reset }))}
      className="bg-white/10 text-white border border-white/20 rounded px-2 py-1 text-[12px]">
      <option value="" className="text-navy">{label}</option>
      {list.map((o) => <option key={o} value={o} className="text-navy">{o.replace(/^(TO|NOP) /, "")}</option>)}
    </select>
  );
  const anyGeo = g.region || g.nop || g.cluster || g.city;
  return (
    <div className="flex flex-wrap items-center gap-2 text-white">
      <span className="text-[10px] uppercase tracking-wide text-white/50 font-semibold">Area</span>
      <span className="bg-white/10 rounded px-2 py-1 text-[12px]">AREA1</span>
      <span className="text-white/30">›</span>
      <Sel k="region" label="All regions" list={opts.regions} reset={{ nop: "", cluster: "", city: "" }} />
      <Sel k="nop" label="All NOPs" list={opts.nops} reset={{ cluster: "", city: "" }} />
      <Sel k="cluster" label="All clusters" list={opts.clusters} reset={{ city: "" }} />
      <Sel k="city" label="All cities" list={opts.cities} reset={{}} />
      {anyGeo ? <button onClick={() => setG({ region: "", nop: "", cluster: "", city: "" })} className="text-amber text-[12px] hover:underline ml-1">Reset</button> : null}
    </div>
  );
}
function Filters({ f, setF, q, setQ, thr, setThr, m, count, total, onClear, onExport }) {
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const Sel = ({ k, label, opts }) => (
    <select value={f[k]} onChange={(e) => set(k, e.target.value)} className="border border-line rounded-md px-2 py-1.5 text-[12px] bg-card text-navy">
      <option value="">{label}</option>{opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
  return (
    <div className="bg-card border border-line rounded-lg px-3 py-2.5 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Site ID…" className="border border-line rounded-md px-2.5 py-1.5 text-[12px] w-36" />
        <Sel k="pattern" label="Any pattern" opts={Object.keys(PATTERN).map((k) => ({ v: k, l: PATTERN[k].label }))} />
        <Sel k="repeat" label="Any repeat" opts={[{ v: "chronic", l: "Chronic" }, { v: "intermittent", l: "Intermittent" }, { v: "one_off", l: "One-off" }]} />
        <Sel k="backup" label="Any backup" opts={[{ v: "insufficient", l: "Insufficient" }, { v: "held", l: "Held" }, { v: "nodata", l: "No data" }]} />
        <Sel k="trend" label="Any trend" opts={[{ v: "worsening", l: "Worsening" }, { v: "improving", l: "Improving" }, { v: "stable", l: "Stable" }]} />
        <span className="text-mut">Min out</span><input type="number" value={f.minOut} onChange={(e) => set("minOut", e.target.value)} className="border border-line rounded px-1.5 py-1 w-14 text-[12px]" placeholder="0" />
        <span className="text-mut">Min dt(h)</span><input type="number" value={f.minDt} onChange={(e) => set("minDt", e.target.value)} className="border border-line rounded px-1.5 py-1 w-14 text-[12px]" placeholder="0" />
        <label className="flex items-center gap-1.5 text-slate cursor-pointer text-[12px]"><input type="checkbox" checked={f.badgrid} onChange={(e) => set("badgrid", e.target.checked)} className="accent-amber" />Bad-grid ≥</label>
        <input type="number" value={thr ?? ""} onChange={(e) => setThr(e.target.value === "" ? m.bad_grid_threshold_h : +e.target.value)} className="border border-line rounded px-1.5 py-1 w-14 text-[12px]" /><span className="text-mut text-[12px]">h</span>
        <div className="ml-auto flex items-center gap-3 text-[12px]">
          <span className="text-mut"><span className="tabular font-semibold text-navy">{fmtInt(count)}</span> / {fmtInt(total)}</span>
          <button onClick={onExport} className="bg-navy text-white rounded px-3 py-1.5 hover:bg-navy/90">Export CSV</button>
          <button onClick={onClear} className="text-amber hover:underline">Clear</button>
        </div>
      </div>
    </div>
  );
}
function ChangeList({ rows, onPick }) {
  if (rows.length === 0) return <div className="text-mut text-sm py-4">No worsening clusters in scope.</div>;
  return (
    <div className="divide-y divide-line">
      {rows.map((c) => (
        <div key={c.cluster} onClick={() => onPick(c)}
          title={`${c.cluster}: Jan–Mar ${fmtInt(c.earlier_h)}h → Apr–Jun ${fmtInt(c.recent_h)}h (${c.delta_pct > 0 ? "+" : ""}${c.delta_pct}%). ${fmtInt(c.bad_grid_sites)} bad-grid sites.`}
          className="flex items-center justify-between py-2 cursor-pointer hover:bg-surface px-1 rounded">
          <div><div className="font-medium text-navy text-[13px]">{c.cluster.replace(/^TO /, "")}</div>
            <div className="text-[11px] text-mut">{c.nop?.replace(/^NOP /, "")} · {fmtInt(c.n_sites)} sites · {fmtInt(c.earlier_h)}→{fmtInt(c.recent_h)}h</div></div>
          <div className="text-right"><div className="text-[13px] font-semibold text-crit">{c.delta_pct > 0 ? "+" : ""}{c.delta_pct ?? "—"}%</div><TrendTag t={c.trend} /></div>
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
