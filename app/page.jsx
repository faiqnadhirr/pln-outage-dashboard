"use client";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  fmtInt, fmtH, fmt1, ImpactBar, Tag, PatternTag, RepeatTag, TrendTag, PATTERN, REPEAT,
  Kpi, DataTable, TopClustersBar, PatternMatrix, TimeSeries, GroupBars,
  RangeControl, Drawer, exportCsv, AvailBand, CauseMix, FaultSplit, DriverBars,
} from "@/components/parts";
import { HelpButton, LangToggle, InfoTip, DocsView } from "@/components/help";

const LeafletMap = dynamic(() => import("@/components/LeafletMap"), { ssr: false, loading: () => <div className="text-mut text-sm p-6">Loading map…</div> });
const TABS = ["Overview", "Sites", "Clusters", "NOPs", "Worklist", "Map", "Docs"];
const slugOf = (c) => (c || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const CSV_COLS = [
  { key: "site_id", label: "Site ID" }, { key: "city", label: "City" }, { key: "cluster", label: "Cluster (TO)" }, { key: "nop", label: "NOP" },
  { key: "region", label: "Region" }, { key: "class", label: "Class" }, { key: "avail_pct", label: "Availability %" }, { key: "avail_gap", label: "Gap pp" },
  { key: "pln_down_h", label: "PLN-down (h)" }, { key: "ne_dark_h", label: "NE-dark (h)" }, { key: "power_dt_hours", label: "Power site-dark (h)" },
  { label: "Downtime in range (h)", get: (r) => r._rdt != null ? Math.round(r._rdt) : "" },
  { key: "fault", label: "Fault class" }, { label: "Pattern", get: (r) => PATTERN[r.pattern]?.label }, { label: "Repeat", get: (r) => REPEAT[r.repeat]?.label },
  { key: "trend", label: "Trend" }, { key: "batt_age_yr", label: "Battery age" }, { key: "lat", label: "Lat" }, { key: "lng", label: "Lng" },
];

export default function Page() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState("Overview");
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState("");
  const [g, setG] = useState({ region: "", nop: "", cluster: "", city: "" });
  const [f, setF] = useState({ pattern: "", repeat: "", backup: "", trend: "", fault: "", minOut: "", minDt: "", badgrid: false });
  const [evOnly, setEvOnly] = useState(true);
  const [lang, setLang] = useState("en");
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
        try { const rg = localStorage.getItem("myRegion"); if (rg) setG((x) => ({ ...x, region: rg })); const lg = localStorage.getItem("lang"); if (lg) setLang(lg); } catch {}
      }).catch((e) => setErr(e.message));
  }, []);

  const full = data ? (range.s === 0 && range.e === data.meta.dates.length - 1) : true;
  const sliceSum = useCallback((arr) => arr ? arr.slice(range.s, range.e + 1).reduce((a, b) => a + (b || 0), 0) : 0, [range]);

  const geoOpts = useMemo(() => {
    if (!data) return { regions: [], nops: [], clusters: [], cities: [] };
    const S = data.sites, uniq = (arr, k) => [...new Set(arr.map((s) => s[k]).filter(Boolean))].sort();
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
  const gSites = useMemo(() => geoSites.map((s) => ({ ...s, _rdt: rdt(s) })), [geoSites, rdt]);

  // main ranking universe: exclude likely-dead; optionally event-confirmed only
  const rankSites = useMemo(() => gSites.filter((s) => !s.likely_dead && (!evOnly || s.in_events)), [gSites, evOnly]);
  const worklist = useMemo(() => gSites.filter((s) => s.in_events === false || s.likely_dead), [gSites]);

  const sites = useMemo(() => {
    const t = q.trim().toLowerCase(); const T = thr ?? (data ? data.meta.bad_grid_threshold_h : 0);
    return rankSites.filter((s) => {
      const bad = s._rdt >= T && s._rdt > 0;
      return (!t || s.site_id.toLowerCase().includes(t)) &&
        (!f.pattern || s.pattern === f.pattern) && (!f.repeat || s.repeat === f.repeat) && (!f.trend || s.trend === f.trend) && (!f.fault || s.fault === f.fault) &&
        (!f.backup || (f.backup === "insufficient" ? s.backup_insufficient === true : f.backup === "held" ? s.backup_insufficient === false : s.backup_insufficient == null)) &&
        (!f.minOut || s.pln_down_h >= +f.minOut) && (!f.minDt || s._rdt >= +f.minDt) && (!f.badgrid || bad);
    });
  }, [rankSites, q, f, thr, data]);

  // aggregates over geoSites (respect geo filter)
  const agg = useMemo(() => {
    const av = gSites.filter((s) => s.avail_pct != null);
    const avail = av.length ? av.reduce((a, s) => a + s.avail_pct, 0) / av.length : null;
    const target = av.length ? av.reduce((a, s) => a + s.target_pct, 0) / av.length : null;
    const cause = { power: 0, transport: 0, ran: 0, other: 0 };
    gSites.forEach((s) => { cause.power += s.cause_pow || 0; cause.transport += s.cause_tr || 0; cause.ran += s.cause_ran || 0; cause.other += s.cause_oth || 0; });
    const ctot = cause.power + cause.transport + cause.ran + cause.other || 1;
    const cause_pct = Object.fromEntries(Object.entries(cause).map(([k, v]) => [k, Math.round(1000 * v / ctot) / 10]));
    const fault = { backup: 0, pln: 0, unverified: 0 };
    gSites.forEach((s) => { fault[s.fault] = (fault[s.fault] || 0) + s.power_dt_hours; });
    const ftot = fault.backup + fault.pln + fault.unverified || 1;
    const fault_pct = Object.fromEntries(Object.entries(fault).map(([k, v]) => [k, Math.round(1000 * v / ftot) / 10]));
    return { avail, target, gap: (avail != null && target != null) ? target - avail : null, cause_pct, fault, fault_pct };
  }, [gSites]);

  // backup-fail vs PLN-down-duration driver (estate-level, site-month based — from engine)
  const drivers = data ? data.meta.backup_drivers.duration_corr : [];

  const clustersG = useMemo(() => groupRows(gSites, "cluster", data, rdt, thr, sliceSum, full), [gSites, data, rdt, thr, sliceSum, full]);
  const nopsG = useMemo(() => groupRows(gSites, "nop", data, rdt, thr, sliceSum, full), [gSites, data, rdt, thr, sliceSum, full]);

  const scopeSeries = useMemo(() => {
    if (!data) return null; const m = data.meta;
    if (!g.cluster && !g.nop && !g.region) return { name: "AREA1 (estate)", dt: m.estate_daily_dt, out: m.estate_daily_out };
    const pick = (arr, k, v) => arr.find((x) => x[k] === v);
    const o = g.cluster ? pick(data.clusters, "cluster", g.cluster) : g.nop ? pick(data.nops, "nop", g.nop) : pick(data.regions, "region", g.region);
    if (o && o.daily_dt) return { name: (g.cluster || g.nop || g.region), dt: o.daily_dt, out: o.daily_out || o.daily_dt.map(() => 0) };
    return { name: "AREA1 (estate)", dt: m.estate_daily_dt, out: m.estate_daily_out };
  }, [data, g]);

  if (err) return <Center>Could not load data: {err}.</Center>;
  if (!data) return <Center><Spinner /> Loading AREA1 availability dataset…</Center>;
  const m = data.meta;
  const siteMax = m.bad_grid_threshold_h * 3, dates = m.dates;
  const drill = (key, val) => { setG({ region: "", nop: "", cluster: "", city: "", [key]: val }); setTab("Sites"); };
  const saveRegion = (rg) => { try { rg ? localStorage.setItem("myRegion", rg) : localStorage.removeItem("myRegion"); } catch {} };
  const changeLang = (l) => { setLang(l); try { localStorage.setItem("lang", l); } catch {} };
  const rangeLabel = full ? "Full H1" : `${dates[range.s].slice(6, 8)}/${dates[range.s].slice(4, 6)} – ${dates[range.e].slice(6, 8)}/${dates[range.e].slice(4, 6)}`;
  const scopeLabel = g.city || g.cluster || g.nop || g.region || "AREA1";
  const worstCluster = clustersG[0];
  const insight = `${scopeLabel}: availability ${agg.avail!=null?agg.avail.toFixed(2):"—"}% vs target ${agg.target!=null?agg.target.toFixed(2):"—"}% (gap ${agg.gap>0?"−":"+"}${Math.abs(agg.gap||0).toFixed(2)}pp). ` +
    `Power = ${agg.cause_pct.power}% of downtime (the #1 cause). Of power downtime, ${agg.fault_pct.backup}% is backup-fault (CAPEX-addressable).`;

  const dtCol = { key: "power_dt_hours", label: full ? "Power site-dark" : "Site-dark (range)", sortAccessor: (r) => r._rdt ?? r.power_dt_hours, render: (r) => <ImpactBar value={r._rdt ?? r.power_dt_hours} max={siteMax} /> };
  const FAULT = { backup: { l: "Backup", t: "crit" }, pln: { l: "PLN grid", t: "amber" }, unverified: { l: "Unverified", t: "mut" } };
  const siteCols = [
    { key: "rank", label: "#", sortable: false, render: (r, i) => <span className="text-mut tabular">{i + 1}</span> },
    { key: "site_id", label: "Site", render: (r) => <span className="font-semibold text-navy">{r.site_id}</span> },
    { key: "city", label: "City", render: (r) => <span className="text-slate">{r.city || "—"}</span> },
    { key: "cluster", label: "Cluster", render: (r) => <span className="text-slate">{(r.cluster || "—").replace(/^TO /, "")}</span> },
    { key: "avail_pct", label: "Avail%", align: "right", render: (r) => r.avail_pct == null ? "—" : <span className={r.avail_gap > 0 ? "text-crit" : "text-navy"}>{r.avail_pct.toFixed(2)}</span> },
    { key: "pln_down_h", label: "PLN-down", align: "right", sortAccessor: (r) => r.pln_down_h, render: (r) => fmtH(r.pln_down_h) },
    { key: "ne_dark_h", label: "NE-dark", align: "right", sortAccessor: (r) => r.ne_dark_h, render: (r) => <span className="text-crit">{fmtH(r.ne_dark_h)}</span> },
    dtCol,
    { key: "fault", label: "Fault", sortAccessor: (r) => r.fault, render: (r) => <Tag tone={FAULT[r.fault]?.t}>{FAULT[r.fault]?.l}</Tag> },
    { key: "repeat", label: "Repeat", sortAccessor: (r) => ({ chronic: 3, intermittent: 2, one_off: 1, none: 0 }[r.repeat]), render: (r) => <RepeatTag r={r.repeat} /> },
    { key: "trend", label: "Trend", sortAccessor: (r) => ({ worsening: 2, stable: 1, improving: 0 }[r.trend]), render: (r) => <TrendTag t={r.trend} /> },
  ];
  const grpCols = (level, rows) => [
    { key: level, label: level === "cluster" ? "Cluster (TO)" : "NOP", render: (r) => <span className="font-semibold text-navy">{(r[level] || "—").replace(/^(TO|NOP) /, "")}</span> },
    { key: "avail_pct", label: "Avail%", align: "right", render: (r) => r.avail_pct == null ? "—" : <span className={r.avail_gap > 0 ? "text-crit" : "text-navy"}>{r.avail_pct.toFixed(2)}</span> },
    { key: "n_sites", label: "Sites", align: "right", render: (r) => fmtInt(r.n_sites) },
    { key: "pln_down_h", label: "PLN-down", align: "right", render: (r) => fmtH(r.pln_down_h) },
    { key: "power_dt_hours", label: full ? "Power site-dark" : "Site-dark (range)", render: (r) => <ImpactBar value={r.power_dt_hours} max={rows[0]?.power_dt_hours || 1} /> },
    { key: "fault_backup_h", label: "Backup-fault", align: "right", render: (r) => <span className="text-crit">{fmtH(r.fault_backup_h)}</span> },
    { key: "trend", label: "Trend", sortAccessor: (r) => ({ worsening: 2, stable: 1, improving: 0 }[r.trend]), render: (r) => <TrendTag t={r.trend} /> },
    { key: "insuff_sites", label: "Backup insuf.", align: "right", render: (r) => <span className="text-amber">{fmtInt(r.insuff_sites)}</span> },
    { key: "go", label: "", sortable: false, render: () => <span className="text-mut text-[12px]">sites →</span> },
  ];

  return (
    <div className="min-h-screen">
      <header className="bg-navy text-white">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-3 flex items-end justify-between flex-wrap gap-2">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-amber font-semibold">Availability &amp; Power Intelligence</div>
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">Site Availability — Power Cause Analysis</h1>
            <div className="text-[12px] text-white/60">AREA1 · H1 2026 (Jan–Jun) · customer POV (INAP)</div>
          </div>
          <div className="text-right text-[12px] text-white/70">
            <div className="flex items-center gap-2 justify-end">
              <LangToggle lang={lang} setLang={changeLang} />
              <HelpButton lang={lang} />
            </div>
            <div className="inline-flex items-center gap-1.5 bg-white/10 rounded px-2 py-1 mt-1"><span className="w-1.5 h-1.5 rounded-full bg-ok inline-block" /> Data as of {m.generated}</div>
          </div>
        </div>
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 pb-2 space-y-1.5">
          <GeoBar g={g} setG={setG} opts={geoOpts} saveRegion={saveRegion} />
          <div className="bg-white/5 rounded-md px-3 py-2"><RangeControl dates={dates} range={range} setRange={setRange} /></div>
        </div>
        <nav className="max-w-[1360px] mx-auto px-4 sm:px-6 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 sm:px-4 py-2 text-[13px] font-medium border-b-2 -mb-px whitespace-nowrap ${tab === t ? "border-amber text-white" : "border-transparent text-white/55 hover:text-white/85"}`}>
              {t}{t === "Worklist" && <span className="ml-1 text-[10px] bg-amber/80 text-white rounded-full px-1.5">{fmtInt(worklist.length)}</span>}
            </button>
          ))}
        </nav>
      </header>

      {!full && <div className="bg-amber/10 border-b border-amber/30 text-[12px] text-navy px-4 sm:px-6 py-1.5">
        Showing <b>{rangeLabel}</b> · scope <b>{scopeLabel}</b>. Site-dark reflects this window; availability, cause, fault &amp; pattern describe full H1.{loadingDaily && <span className="ml-2 text-amber">· loading daily detail…</span>}</div>}

      <main className="max-w-[1360px] mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="bg-card border border-line rounded-lg px-4 py-2.5 text-[13px] text-navy flex items-start gap-2">
          <span className="text-amber font-bold">◆</span><span>{insight}</span>
        </div>

        {tab === "Overview" && (
          <>
            <Card title="Availability vs target" note={`${scopeLabel} · INAP`} tip="availability" lang={lang}>
              <AvailBand avail={agg.avail} target={agg.target} gap={agg.gap} />
            </Card>

            <div className="grid md:grid-cols-2 gap-6">
              <Card title="What causes the availability gap?" note="Share of total downtime by cause" tip="cause" lang={lang}>
                <CauseMix cause_pct={agg.cause_pct} />
                <div className="mt-3 text-[12px] text-slate"><b className="text-navy">Power is the #1 cause</b> at {agg.cause_pct.power}% — larger than transport and RAN combined. It is the highest-leverage lever to close the availability gap.</div>
              </Card>
              <Card title="Power downtime — whose fault?" note="Where CAPEX can actually help" tip="fault" lang={lang}>
                <FaultSplit fault={agg.fault} fault_pct={agg.fault_pct} />
                <div className="mt-3 text-[12px] text-slate"><b className="text-navy">{agg.fault_pct.backup}%</b> is backup-fault → addressable by autonomy CAPEX. The PLN slice needs escalation, not CAPEX; unverified needs field checks.</div>
              </Card>
            </div>

            <Card title="Why backup fails: PLN-down exposure, not battery age" note="% of site-months with any NE-dark, by PLN-down duration · estate-level" tip="driver" lang={lang}>
              <div className="grid md:grid-cols-2 gap-6 items-center">
                <DriverBars duration_corr={drivers} />
                <div className="text-[13px] text-slate space-y-2">
                  <p><b className="text-navy">Backup failure scales with PLN-down exposure</b> — from ~19% at light exposure to ~73% at heavy (&gt;12h/mo) exposure. Battery autonomy runs out; the site drops.</p>
                  <p>Battery <b>age is flat</b> across the estate (~29% at every age) and Lithium vs VRLA is identical — so the fix is <b className="text-navy">not "replace old batteries."</b></p>
                  <p>Genset roughly halves dark hours ({m.backup_drivers.genset_effect.with.avg_dark_h}h with vs {m.backup_drivers.genset_effect.without.avg_dark_h}h without). <b className="text-navy">CAPEX case = add autonomy (genset / larger battery) at sites facing long outages.</b></p>
                </div>
              </div>
            </Card>

            <Card title="Power site-dark over time" note={`Scope: ${scopeSeries?.name}`} tip="power_dark" lang={lang}>
              <TimeSeries dates={dates} dt={scopeSeries.dt} out={scopeSeries.out} />
            </Card>

            <Card title="Site locations" note="OpenStreetMap · colour & size = power site-dark · click a site">
              <LeafletMap sites={gSites} onPick={setSel} />
            </Card>

            <div className="grid md:grid-cols-2 gap-6">
              <Card title="Worst clusters (power site-dark)" note={`Top 10 · ${rangeLabel}`}><TopClustersBar data={clustersG} /></Card>
              <Card title="Clusters getting worse" note="Apr–Jun vs Jan–Mar · hover for why"><ChangeList rows={clustersG.filter((c) => c.trend === "worsening").sort((a, b) => (b.delta_pct || 0) - (a.delta_pct || 0)).slice(0, 6)} onPick={(c) => drill("cluster", c.cluster)} /></Card>
            </div>

            <Card title="Top 15 worst sites" note={`Event-confirmed · dead sites excluded · ${rangeLabel}`}>
              <DataTable columns={siteCols} rows={sites} maxRows={15} initialSort={{ key: "power_dt_hours", dir: "desc" }} onRowClick={setSel} />
            </Card>
          </>
        )}

        {tab === "Sites" && (
          <>
            <Filters {...{ f, setF, q, setQ, thr, setThr, m, evOnly, setEvOnly, lang }} count={sites.length} total={rankSites.length}
              onClear={() => { setF({ pattern: "", repeat: "", backup: "", trend: "", fault: "", minOut: "", minDt: "", badgrid: false }); setQ(""); }}
              onExport={() => exportCsv(sites.slice(0, 5000), CSV_COLS, `sites_${Date.now()}.csv`)} />
            <div className="grid md:grid-cols-2 gap-6">
              <Card title="Pattern × repeat of selection" tip="pattern" lang={lang}><PatternMatrix sites={sites} onPick={(p, r) => setF((x) => ({ ...x, pattern: p, repeat: r }))} /></Card>
              <Card title="Top clusters in selection"><GroupBars rows={clustersG} labelKey="cluster" n={10} onPick={(r) => r && setG((x) => ({ ...x, cluster: clustersG.find((c) => c.cluster.replace(/^TO /, "") === r.name)?.cluster || "" }))} /></Card>
            </div>
            <DataTable columns={siteCols} rows={sites} maxRows={500} initialSort={{ key: "power_dt_hours", dir: "desc" }} onRowClick={setSel} />
          </>
        )}
        {tab === "Clusters" && (
          <>
            <Card title="Clusters (TO) by power site-dark" note={`${scopeLabel} · ${rangeLabel}`}><GroupBars rows={clustersG} labelKey="cluster" n={14} onPick={(r) => r && drill("cluster", clustersG.find((c) => c.cluster.replace(/^TO /, "") === r.name)?.cluster || r.cluster)} /></Card>
            <Card title="All clusters" note="Click a row to drill into its sites"><DataTable columns={grpCols("cluster", clustersG)} rows={clustersG} maxRows={100} initialSort={{ key: "power_dt_hours", dir: "desc" }} onRowClick={(r) => drill("cluster", r.cluster)} /></Card>
          </>
        )}
        {tab === "NOPs" && (
          <>
            <Card title="NOPs by power site-dark" note={`${scopeLabel} · ${rangeLabel}`}><GroupBars rows={nopsG} labelKey="nop" n={14} onPick={(r) => r && drill("nop", nopsG.find((c) => c.nop.replace(/^NOP /, "") === r.name)?.nop || r.nop)} /></Card>
            <Card title="All NOPs" note="Click a row to drill into its sites"><DataTable columns={grpCols("nop", nopsG)} rows={nopsG} maxRows={100} initialSort={{ key: "power_dt_hours", dir: "desc" }} onRowClick={(r) => drill("nop", r.nop)} /></Card>
          </>
        )}
        {tab === "Worklist" && (
          <Card title="Verification worklist" note={`${fmtInt(worklist.length)} sites: no event data or likely-dead (excluded from ranking)`} tip="worklist" lang={lang}>
            <div className="flex justify-between items-center mb-3 gap-3 flex-wrap">
              <p className="text-[13px] text-slate max-w-2xl">Sites with measured downtime but no PLN-event record, or that appear permanently dark (likely decommissioned/misconfigured). Field-verify before drawing any power conclusion.</p>
              <button onClick={() => exportCsv(worklist, CSV_COLS, `worklist_${Date.now()}.csv`)} className="shrink-0 bg-navy text-white text-[12px] rounded px-3 py-1.5 hover:bg-navy/90">Export CSV</button>
            </div>
            <DataTable columns={siteCols.filter((c) => !["repeat", "trend"].includes(c.key)).concat([{ key: "flag", label: "Flag", sortable: false, render: (r) => r.likely_dead ? <Tag tone="crit">likely dead</Tag> : <Tag tone="mut">no event</Tag> }])} rows={worklist} maxRows={500} initialSort={{ key: "power_dt_hours", dir: "desc" }} onRowClick={setSel} />
          </Card>
        )}
        {tab === "Map" && (
          <Card title="Power site-dark geography" note="OpenStreetMap · colour & size = site-dark · click a site">
            <LeafletMap sites={gSites} onPick={setSel} />
          </Card>
        )}
        {tab === "Docs" && <DocsView lang={lang} />}
      </main>

      <footer className="max-w-[1360px] mx-auto px-4 sm:px-6 py-6 text-[11px] text-mut">
        KPI = site availability (INAP). Power site-dark = Σ(1−ava_power)×24h per day (site-level, honest — NE-summed hours shown only as severity in the drawer). Cause shares from duration_power/transport/ran/other. “Fault: backup” = went down despite backup (CAPEX-addressable); “PLN” = grid issue, backup held (escalate); “unverified” = no event record. Ranking excludes likely-dead sites and (by default) unverified. Trend compares Apr–Jun vs Jan–Mar. Data as of {m.generated}.
      </footer>
      <Drawer site={sel} months={m.months} onClose={() => setSel(null)} />
    </div>
  );
}

function groupRows(sites, level, data, rdt, thr, sliceSum, full) {
  if (!data) return [];
  const T = thr ?? data.meta.bad_grid_threshold_h;
  const metaLook = Object.fromEntries((level === "cluster" ? data.clusters : data.nops).map((o) => [o[level], o]));
  const map = new Map();
  sites.forEach((s) => {
    const k = s[level]; if (!k) return;
    const d = map.get(k) || { [level]: k, nop: s.nop, region: s.region, n_sites: 0, pln_down_h: 0, ne_dark_h: 0, power_dt_hours: 0, bad_grid_sites: 0, insuff_sites: 0, fault_backup_h: 0, av_sum: 0, tg_sum: 0, ac: 0 };
    d.n_sites++; d.pln_down_h += s.pln_down_h; d.ne_dark_h += s.ne_dark_h; d.power_dt_hours += s._rdt;
    d.bad_grid_sites += (s._rdt >= T && s._rdt > 0) ? 1 : 0; d.insuff_sites += s.backup_insufficient === true ? 1 : 0;
    d.fault_backup_h += s.fault === "backup" ? s._rdt : 0;
    if (s.avail_pct != null) { d.av_sum += s.avail_pct; d.tg_sum += s.target_pct; d.ac++; }
    map.set(k, d);
  });
  return [...map.values()].map((d) => {
    const meta = metaLook[d[level]] || {};
    return { ...d, power_dt_hours: Math.round(d.power_dt_hours), pln_down_h: Math.round(d.pln_down_h), ne_dark_h: Math.round(d.ne_dark_h), fault_backup_h: Math.round(d.fault_backup_h),
      avail_pct: d.ac ? d.av_sum / d.ac : null, avail_gap: d.ac ? (d.tg_sum - d.av_sum) / d.ac : null,
      trend: meta.trend || "stable", earlier_h: meta.earlier_h, recent_h: meta.recent_h, delta_pct: meta.delta_pct };
  }).sort((a, b) => b.power_dt_hours - a.power_dt_hours);
}

function GeoBar({ g, setG, opts, saveRegion }) {
  const Sel = ({ k, label, list, reset, onChange }) => (
    <select value={g[k]} onChange={(e) => { setG((x) => ({ ...x, [k]: e.target.value, ...reset })); onChange && onChange(e.target.value); }}
      className="bg-white/10 text-white border border-white/20 rounded px-2 py-1 text-[12px]">
      <option value="" className="text-navy">{label}</option>
      {list.map((o) => <option key={o} value={o} className="text-navy">{o.replace(/^(TO|NOP) /, "")}</option>)}
    </select>
  );
  const anyGeo = g.region || g.nop || g.cluster || g.city;
  return (
    <div className="flex flex-wrap items-center gap-2 text-white">
      <span className="text-[10px] uppercase tracking-wide text-white/50 font-semibold">Area</span>
      <span className="bg-white/10 rounded px-2 py-1 text-[12px]">AREA1</span><span className="text-white/30">›</span>
      <Sel k="region" label="All regions" list={opts.regions} reset={{ nop: "", cluster: "", city: "" }} onChange={saveRegion} />
      <Sel k="nop" label="All NOPs" list={opts.nops} reset={{ cluster: "", city: "" }} />
      <Sel k="cluster" label="All clusters" list={opts.clusters} reset={{ city: "" }} />
      <Sel k="city" label="All cities" list={opts.cities} reset={{}} />
      {anyGeo ? <button onClick={() => setG({ region: "", nop: "", cluster: "", city: "" })} className="text-amber text-[12px] hover:underline ml-1">Reset</button> : null}
    </div>
  );
}
function Filters({ f, setF, q, setQ, thr, setThr, m, evOnly, setEvOnly, lang, count, total, onClear, onExport }) {
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
        <Sel k="fault" label="Any fault" opts={[{ v: "backup", l: "Backup (CAPEX)" }, { v: "pln", l: "PLN grid" }, { v: "unverified", l: "Unverified" }]} />
        <Sel k="pattern" label="Any pattern" opts={Object.keys(PATTERN).map((k) => ({ v: k, l: PATTERN[k].label }))} />
        <Sel k="repeat" label="Any repeat" opts={[{ v: "chronic", l: "Chronic" }, { v: "intermittent", l: "Intermittent" }, { v: "one_off", l: "One-off" }]} />
        <Sel k="trend" label="Any trend" opts={[{ v: "worsening", l: "Worsening" }, { v: "improving", l: "Improving" }, { v: "stable", l: "Stable" }]} />
        <span className="text-mut">Min PLN-h</span><input type="number" value={f.minOut} onChange={(e) => set("minOut", e.target.value)} className="border border-line rounded px-1.5 py-1 w-14 text-[12px]" placeholder="0" />
        <span className="text-mut">Min dt(h)</span><input type="number" value={f.minDt} onChange={(e) => set("minDt", e.target.value)} className="border border-line rounded px-1.5 py-1 w-14 text-[12px]" placeholder="0" />
        <label className="flex items-center gap-1.5 text-slate cursor-pointer text-[12px]"><input type="checkbox" checked={evOnly} onChange={(e) => setEvOnly(e.target.checked)} className="accent-amber" />Event-confirmed only</label><InfoTip id="evonly" lang={lang} />
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
        <div key={c.cluster} onClick={() => onPick(c)} title={`${c.cluster}: Jan–Mar ${fmtInt(c.earlier_h)}h → Apr–Jun ${fmtInt(c.recent_h)}h (${c.delta_pct > 0 ? "+" : ""}${c.delta_pct}%).`}
          className="flex items-center justify-between py-2 cursor-pointer hover:bg-surface px-1 rounded">
          <div><div className="font-medium text-navy text-[13px]">{c.cluster.replace(/^TO /, "")}</div>
            <div className="text-[11px] text-mut">{c.nop?.replace(/^NOP /, "")} · {fmtInt(c.n_sites)} sites · {fmtInt(c.earlier_h)}→{fmtInt(c.recent_h)}h</div></div>
          <div className="text-right"><div className="text-[13px] font-semibold text-crit">{c.delta_pct > 0 ? "+" : ""}{c.delta_pct ?? "—"}%</div><TrendTag t={c.trend} /></div>
        </div>
      ))}
    </div>
  );
}
const Card = ({ title, note, tip, lang, children }) => (
  <section className="bg-card border border-line rounded-lg">
    <div className="px-4 py-3 border-b border-line flex items-baseline justify-between gap-2 flex-wrap">
      <h3 className="text-[14px] font-semibold text-navy flex items-center">{title}{tip && <InfoTip id={tip} lang={lang} />}</h3>{note && <span className="text-[11px] text-mut">{note}</span>}
    </div>
    <div className="p-4">{children}</div>
  </section>
);
const Center = ({ children }) => <div className="min-h-screen flex items-center justify-center text-slate text-sm gap-2 px-6 text-center">{children}</div>;
const Spinner = () => <span className="inline-block w-4 h-4 border-2 border-amber border-t-transparent rounded-full animate-spin" />;
