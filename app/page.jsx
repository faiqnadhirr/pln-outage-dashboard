"use client";
import React, { useEffect, useMemo, useState } from "react";
import {
  fmtInt, fmtH, ImpactBar, Tag, UnderDim, Kpi, DataTable,
  TopClustersBar, QualityMix, MapScatter, Drawer,
} from "@/components/parts";

const TABS = ["Overview", "Sites", "Clusters", "NOPs", "Bad-grid map"];

export default function Page() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState("Overview");
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState("");
  const [f, setF] = useState({ region: "", nop: "", cluster: "", cls: "", underdim: false, badgrid: false, haspayload: false });

  useEffect(() => {
    fetch("/data.json").then((r) => { if (!r.ok) throw new Error("data.json not found"); return r.json(); })
      .then((d) => { d.sites.forEach((s, i) => (s.__id = s.site_id + i)); setData(d); })
      .catch((e) => setErr(e.message));
  }, []);

  const options = useMemo(() => {
    if (!data) return { regions: [], nops: [], clusters: [], classes: [] };
    const u = (k) => [...new Set(data.sites.map((s) => s[k]).filter(Boolean))].sort();
    return { regions: u("region"), nops: u("nop"), clusters: u("cluster"), classes: u("class") };
  }, [data]);

  const sites = useMemo(() => {
    if (!data) return [];
    const t = q.trim().toLowerCase();
    return data.sites.filter((s) =>
      (!t || s.site_id.toLowerCase().includes(t)) &&
      (!f.region || s.region === f.region) && (!f.nop || s.nop === f.nop) &&
      (!f.cluster || s.cluster === f.cluster) && (!f.cls || s.class === f.cls) &&
      (!f.underdim || s.under_dim === true) && (!f.badgrid || s.bad_grid) &&
      (!f.haspayload || s.payload_gb)
    );
  }, [data, q, f]);

  const siteMax = data ? data.meta.bad_grid_threshold_h * 3 : 1;
  const drillCluster = (row) => { setF((x) => ({ ...x, cluster: row.cluster, nop: "", region: "" })); setTab("Sites"); };
  const drillNop = (row) => { setF((x) => ({ ...x, nop: row.nop, cluster: "", region: "" })); setTab("Sites"); };

  if (err) return <Center>Could not load data: {err}. Run the engine to generate <code>public/data.json</code>.</Center>;
  if (!data) return <Center><Spinner /> Loading AREA1 H1 dataset…</Center>;
  const m = data.meta;

  const siteCols = [
    { key: "rank", label: "#", sortable: false, render: (r, i) => <span className="text-mut tabular">{i + 1}</span> },
    { key: "site_id", label: "Site", render: (r) => <span className="font-semibold text-navy">{r.site_id}</span> },
    { key: "cluster", label: "Cluster (TO)", render: (r) => <span className="text-slate">{(r.cluster || "—").replace(/^TO /, "")}</span> },
    { key: "nop", label: "NOP", render: (r) => <span className="text-slate">{(r.nop || "—").replace(/^NOP /, "")}</span> },
    { key: "class", label: "Class", render: (r) => r.class ? <Tag tone="mut">{r.class}</Tag> : "—" },
    { key: "n_outage", label: "Outages", align: "right", render: (r) => <span className="tabular">{fmtInt(r.n_outage)}</span> },
    { key: "n_ne_down", label: "NE down", align: "right", render: (r) => <span className="tabular text-crit">{fmtInt(r.n_ne_down)}</span> },
    { key: "power_dt_hours", label: "Power downtime", render: (r) => <ImpactBar value={r.power_dt_hours} max={siteMax} /> },
    { key: "lost_gb", label: "Lost-GB", align: "right", render: (r) => <span className="tabular text-mut">{fmtInt(r.lost_gb)}</span> },
    { key: "under_dim", label: "Backup", sortAccessor: (r) => (r.under_dim === true ? 2 : r.under_dim === false ? 1 : 0), render: (r) => <UnderDim v={r.under_dim} /> },
  ];
  const clusterCols = [
    { key: "cluster", label: "Cluster (TO)", render: (r) => <span className="font-semibold text-navy">{r.cluster?.replace(/^TO /, "")}</span> },
    { key: "nop", label: "NOP", render: (r) => <span className="text-slate">{(r.nop || "—").replace(/^NOP /, "")}</span> },
    { key: "n_sites", label: "Sites", align: "right", render: (r) => <span className="tabular">{fmtInt(r.n_sites)}</span> },
    { key: "n_outage", label: "Outages", align: "right", render: (r) => <span className="tabular">{fmtInt(r.n_outage)}</span> },
    { key: "power_dt_hours", label: "Power downtime", render: (r) => <ImpactBar value={r.power_dt_hours} max={data.clusters[0].power_dt_hours} /> },
    { key: "bad_grid_sites", label: "Bad-grid sites", align: "right", render: (r) => <span className="tabular text-crit">{fmtInt(r.bad_grid_sites)}</span> },
    { key: "under_dim_sites", label: "Under-dim sites", align: "right", render: (r) => <span className="tabular text-amber">{fmtInt(r.under_dim_sites)}</span> },
    { key: "go", label: "", sortable: false, render: () => <span className="text-mut text-[12px]">view sites →</span> },
  ];
  const nopCols = clusterCols.map((c) => c.key === "cluster" ? { key: "nop", label: "NOP", render: (r) => <span className="font-semibold text-navy">{r.nop?.replace(/^NOP /, "")}</span> } : c.key === "nop" ? { key: "region", label: "Region", render: (r) => <span className="text-slate">{r.region}</span> } : c.key === "power_dt_hours" ? { ...c, render: (r) => <ImpactBar value={r.power_dt_hours} max={data.nops[0].power_dt_hours} /> } : c.key === "go" ? { ...c, render: () => <span className="text-mut text-[12px]">view sites →</span> } : c);

  return (
    <div className="min-h-screen">
      {/* header */}
      <header className="bg-navy text-white">
        <div className="max-w-[1360px] mx-auto px-6 py-4 flex items-end justify-between flex-wrap gap-2">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-amber font-semibold">Power Operations Intelligence</div>
            <h1 className="text-2xl font-bold leading-tight">PLN Outage — Top-Site Analysis</h1>
            <div className="text-[12px] text-white/60">AREA1 · H1 2026 (Jan–Jun) · generated {m.generated?.slice(0, 10)}</div>
          </div>
          <div className="text-right text-[12px] text-white/70">
            <div><span className="tabular font-semibold text-white">{fmtInt(m.n_sites)}</span> sites · <span className="tabular font-semibold text-white">{fmtInt(m.total_outages)}</span> outages</div>
            <div className="text-white/50">Ranking = power-attributable network downtime (genset-adjusted)</div>
          </div>
        </div>
        <nav className="max-w-[1360px] mx-auto px-6 flex gap-1">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-[13px] font-medium border-b-2 -mb-px ${tab === t ? "border-amber text-white" : "border-transparent text-white/55 hover:text-white/85"}`}>{t}</button>
          ))}
        </nav>
      </header>

      <main className="max-w-[1360px] mx-auto px-6 py-6 space-y-6">
        {tab === "Overview" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="Sites impacted" value={fmtInt(m.n_sites_impacted)} sub={`of ${fmtInt(m.n_sites)} in AREA1`} tone="navy" />
              <Kpi label="PLN outages" value={fmtInt(m.total_outages)} sub="mains-fail events, H1" tone="slate" />
              <Kpi label="Network-down events" value={fmtInt(m.total_ne_down)} sub="backup failed to hold" tone="crit" />
              <Kpi label="Power downtime" value={fmtH(m.total_power_dt_hours)} sub="wall-clock, all sites" tone="amber" />
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <Card title="Worst clusters by power downtime" note="Top 10 · red = #1">
                <TopClustersBar data={data.clusters} />
              </Card>
              <Card title="Genset-adjusted outcome" note="Did backup hold when PLN fell?">
                <QualityMix meta={m} />
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <Mini label="Under-dim sites" value={fmtInt(data.sites.filter((s) => s.under_dim === true).length)} tone="crit" />
                  <Mini label="Bad-grid sites" value={fmtInt(data.sites.filter((s) => s.bad_grid).length)} tone="amber" />
                  <Mini label="Clusters" value={fmtInt(data.clusters.length)} tone="navy" />
                </div>
              </Card>
            </div>
            <Card title="Top 15 worst sites" note="Ranked by power-attributable downtime">
              <DataTable columns={siteCols} rows={data.sites} maxRows={15} rankMax={siteMax}
                initialSort={{ key: "power_dt_hours", dir: "desc" }} onRowClick={setSel} />
              <div className="mt-2 text-[12px] text-mut">Coverage: availability {fmtInt(m.coverage.in_avail)} · events {fmtInt(m.coverage.in_events)} · config {fmtInt(m.coverage.in_config)} · payload {fmtInt(m.coverage.payload)} sites. Sites outside the event feed show backup verdict as “no data”.</div>
            </Card>
          </>
        )}

        {tab === "Sites" && (
          <>
            <Filters {...{ f, setF, q, setQ, options }} count={sites.length} total={data.sites.length} onClear={() => { setF({ region: "", nop: "", cluster: "", cls: "", underdim: false, badgrid: false, haspayload: false }); setQ(""); }} />
            <DataTable columns={siteCols} rows={sites} maxRows={500} rankMax={siteMax}
              initialSort={{ key: "power_dt_hours", dir: "desc" }} onRowClick={setSel} />
          </>
        )}
        {tab === "Clusters" && (
          <Card title="Clusters (TO) ranked by power downtime" note="Click a row to drill into its sites">
            <DataTable columns={clusterCols} rows={data.clusters} maxRows={100}
              initialSort={{ key: "power_dt_hours", dir: "desc" }} onRowClick={drillCluster} />
          </Card>
        )}
        {tab === "NOPs" && (
          <Card title="NOP ranked by power downtime" note="Click a row to drill into its sites">
            <DataTable columns={nopCols} rows={data.nops} maxRows={100}
              initialSort={{ key: "power_dt_hours", dir: "desc" }} onRowClick={drillNop} />
          </Card>
        )}
        {tab === "Bad-grid map" && (
          <Card title="Bad-grid geography" note="Sites with coordinates · colour & size = power downtime">
            <MapScatter sites={sites.length && (f.region || f.nop || f.cluster || f.cls || f.badgrid || f.underdim || q) ? sites : data.sites} onPick={setSel} />
            <div className="mt-3"><Filters {...{ f, setF, q, setQ, options }} count={sites.length} total={data.sites.length} compact onClear={() => { setF({ region: "", nop: "", cluster: "", cls: "", underdim: false, badgrid: false, haspayload: false }); setQ(""); }} /></div>
          </Card>
        )}
      </main>

      <footer className="max-w-[1360px] mx-auto px-6 py-6 text-[11px] text-mut">
        Impact = power-attributable network downtime (Avail, wall-clock capped 24h/day), inherently genset-adjusted. NE-hours shown separately as severity. Lost-GB is a payload proxy (Jan–Apr, {fmtInt(m.coverage.payload)} sites). Under-dimensioning inferred where backup failed (NE down); “no data” = site absent from the event feed. Estate-level analysis — no per-site engineering audit.
      </footer>

      <Drawer site={sel} onClose={() => setSel(null)} />
    </div>
  );
}

function Filters({ f, setF, q, setQ, options, count, total, onClear, compact }) {
  const Sel = ({ k, label, opts }) => (
    <select value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))}
      className="border border-line rounded-md px-2 py-1.5 text-[13px] bg-card text-navy">
      <option value="">{label}</option>
      {opts.map((o) => <option key={o} value={o}>{o.replace(/^(TO|NOP) /, "")}</option>)}
    </select>
  );
  const Chk = ({ k, label }) => (
    <label className="flex items-center gap-1.5 text-[13px] text-slate cursor-pointer">
      <input type="checkbox" checked={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.checked }))} className="accent-amber" />{label}
    </label>
  );
  return (
    <div className="bg-card border border-line rounded-lg px-3 py-2.5 flex flex-wrap items-center gap-2">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Site ID…"
        className="border border-line rounded-md px-2.5 py-1.5 text-[13px] w-40" />
      <Sel k="region" label="All regions" opts={options.regions} />
      <Sel k="nop" label="All NOPs" opts={options.nops} />
      <Sel k="cluster" label="All clusters" opts={options.clusters} />
      {!compact && <Sel k="cls" label="All classes" opts={options.classes} />}
      <span className="w-px h-5 bg-line mx-1" />
      <Chk k="underdim" label="Under-dim only" />
      <Chk k="badgrid" label="Bad-grid only" />
      {!compact && <Chk k="haspayload" label="Has payload" />}
      <div className="ml-auto flex items-center gap-3 text-[12px] text-mut">
        <span><span className="tabular font-semibold text-navy">{fmtInt(count)}</span> / {fmtInt(total)} sites</span>
        <button onClick={onClear} className="text-amber hover:underline">Clear</button>
      </div>
    </div>
  );
}
const Card = ({ title, note, children }) => (
  <section className="bg-card border border-line rounded-lg">
    <div className="px-4 py-3 border-b border-line flex items-baseline justify-between">
      <h3 className="text-[14px] font-semibold text-navy">{title}</h3>
      {note && <span className="text-[11px] text-mut">{note}</span>}
    </div>
    <div className="p-4">{children}</div>
  </section>
);
const Mini = ({ label, value, tone }) => (
  <div className="border border-line rounded-md py-2">
    <div className={`text-[18px] font-bold tabular ${tone === "crit" ? "text-crit" : tone === "amber" ? "text-amber" : "text-navy"}`}>{value}</div>
    <div className="text-[10px] uppercase tracking-wide text-mut">{label}</div>
  </div>
);
const Center = ({ children }) => <div className="min-h-screen flex items-center justify-center text-slate text-sm gap-2 px-6 text-center">{children}</div>;
const Spinner = () => <span className="inline-block w-4 h-4 border-2 border-amber border-t-transparent rounded-full animate-spin" />;
