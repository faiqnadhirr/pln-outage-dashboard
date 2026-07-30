"use client";
import React, { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from "recharts";

/* ---------- format helpers ---------- */
export const fmtInt = (n) => (n == null ? "—" : Math.round(n).toLocaleString("en-US"));
export const fmtH = (n) => (n == null ? "—" : Math.round(n).toLocaleString("en-US") + "h");
export const fmt1 = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 1 }));

/* ---------- severity impact bar (signature element) ---------- */
export function ImpactBar({ value, max, critical }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  const ratio = max ? value / max : 0;
  const color = critical ?? (ratio > 0.66 ? "#B23A2E" : ratio > 0.33 ? "#C8862B" : "#8B97AC");
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="h-[7px] flex-1 rounded-full bg-line overflow-hidden">
        <div className="h-full rounded-full" style={{ width: pct + "%", background: color }} />
      </div>
      <span className="tabular text-[12px] text-navy w-14 text-right">{fmtH(value)}</span>
    </div>
  );
}

export function Tag({ children, tone = "slate" }) {
  const tones = {
    slate: "bg-slate/10 text-slate", amber: "bg-amber/15 text-amber",
    crit: "bg-crit/12 text-crit", ok: "bg-ok/12 text-ok", mut: "bg-line text-mut",
  };
  return <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

export function UnderDim({ v }) {
  if (v === true) return <Tag tone="crit">under-dim</Tag>;
  if (v === false) return <Tag tone="ok">held</Tag>;
  return <Tag tone="mut">no data</Tag>;
}

/* ---------- KPI tile ---------- */
export function Kpi({ label, value, sub, tone = "navy" }) {
  const c = { navy: "text-navy", amber: "text-amber", crit: "text-crit", ok: "text-ok", slate: "text-slate" }[tone];
  return (
    <div className="bg-card border border-line rounded-lg px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-mut font-semibold">{label}</div>
      <div className={`text-[26px] leading-tight font-bold tabular ${c}`}>{value}</div>
      {sub && <div className="text-[11px] text-mut mt-0.5">{sub}</div>}
    </div>
  );
}

/* ---------- generic sortable table ---------- */
export function DataTable({ columns, rows, onRowClick, initialSort, rankMax, maxRows = 500 }) {
  const [sort, setSort] = useState(initialSort || { key: columns[0].key, dir: "desc" });
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort.key);
    const acc = col?.sortAccessor || ((r) => r[sort.key]);
    const arr = [...rows].sort((a, b) => {
      const va = acc(a), vb = acc(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1; if (vb == null) return -1;
      if (typeof va === "number") return sort.dir === "desc" ? vb - va : va - vb;
      return sort.dir === "desc" ? String(vb).localeCompare(String(va)) : String(va).localeCompare(String(vb));
    });
    return arr.slice(0, maxRows);
  }, [rows, sort, columns, maxRows]);
  const head = (c) => {
    const active = sort.key === c.key;
    return (
      <th key={c.key}
        onClick={() => c.sortable !== false && setSort((s) => ({ key: c.key, dir: active && s.dir === "desc" ? "asc" : "desc" }))}
        className={`px-3 py-2 text-[11px] uppercase tracking-wide font-semibold text-mut select-none ${c.sortable === false ? "" : "cursor-pointer hover:text-navy"} ${c.align === "right" ? "text-right" : "text-left"}`}>
        {c.label}{active ? (sort.dir === "desc" ? " ↓" : " ↑") : ""}
      </th>
    );
  };
  return (
    <div className="overflow-auto border border-line rounded-lg bg-card">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-surface border-b border-line z-10"><tr>{columns.map(head)}</tr></thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.__id ?? i}
              onClick={() => onRowClick && onRowClick(r)}
              className={`border-b border-line/70 ${onRowClick ? "cursor-pointer hover:bg-surface" : ""}`}>
              {columns.map((c) => (
                <td key={c.key} className={`px-3 py-1.5 text-[13px] ${c.align === "right" ? "text-right tabular" : ""}`}>
                  {c.render ? c.render(r, i, rankMax) : (r[c.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
          {sorted.length === 0 && <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-mut text-sm">No rows match the current filters.</td></tr>}
        </tbody>
      </table>
      {rows.length > maxRows && <div className="px-3 py-2 text-[11px] text-mut border-t border-line">Showing top {maxRows} of {fmtInt(rows.length)} — narrow the filters to see more.</div>}
    </div>
  );
}

/* ---------- charts ---------- */
export function TopClustersBar({ data }) {
  const d = data.slice(0, 10).map((c) => ({ name: c.cluster.replace(/^TO /, ""), hours: Math.round(c.power_dt_hours), bad: c.bad_grid_sites }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={d} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <XAxis type="number" tick={{ fontSize: 11, fill: "#7A8598" }} tickFormatter={(v) => (v >= 1000 ? v / 1000 + "k" : v)} />
        <YAxis type="category" dataKey="name" width={116} tick={{ fontSize: 11, fill: "#141821" }} />
        <Tooltip formatter={(v) => [fmtInt(v) + " h", "Power downtime"]} labelStyle={{ color: "#141821" }} />
        <Bar dataKey="hours" radius={[0, 3, 3, 0]}>
          {d.map((e, i) => <Cell key={i} fill={i === 0 ? "#B23A2E" : i < 3 ? "#C8862B" : "#1F2A44"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function QualityMix({ meta }) {
  const held = meta.total_outages - meta.total_ne_down;
  const d = [
    { name: "Backup held (no NE down)", value: held, fill: "#2E7D32" },
    { name: "Site went down (NE down)", value: meta.total_ne_down, fill: "#B23A2E" },
  ];
  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width={150} height={150}>
        <PieChart>
          <Pie data={d} dataKey="value" innerRadius={42} outerRadius={68} paddingAngle={2}>
            {d.map((e, i) => <Cell key={i} fill={e.fill} />)}
          </Pie>
          <Tooltip formatter={(v) => fmtInt(v) + " events"} />
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-2">
        {d.map((e) => (
          <div key={e.name} className="flex items-center gap-2 text-[13px]">
            <span className="w-3 h-3 rounded-sm" style={{ background: e.fill }} />
            <span className="text-navy font-medium tabular">{fmtInt(e.value)}</span>
            <span className="text-mut">{e.name}</span>
          </div>
        ))}
        <div className="text-[11px] text-mut pt-1">Genset/battery covered {Math.round((held / meta.total_outages) * 100)}% of PLN outages.</div>
      </div>
    </div>
  );
}

/* ---------- bad-grid coordinate scatter (self-contained SVG) ---------- */
export function MapScatter({ sites, onPick }) {
  const pts = sites.filter((s) => s.lat && s.lng && s.lat > -12 && s.lat < 8 && s.lng > 90 && s.lng < 120);
  if (pts.length === 0) return <div className="text-mut text-sm p-6">No coordinates available for the current filter.</div>;
  const xs = pts.map((p) => p.lng), ys = pts.map((p) => p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const W = 760, H = 460, pad = 20;
  const max = Math.max(...pts.map((p) => p.power_dt_hours || 0)) || 1;
  const px = (lng) => pad + ((lng - minX) / (maxX - minX || 1)) * (W - 2 * pad);
  const py = (lat) => H - pad - ((lat - minY) / (maxY - minY || 1)) * (H - 2 * pad);
  const [hover, setHover] = useState(null);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-navy/[0.03] rounded-lg border border-line">
        {pts.map((p, i) => {
          const r = p.power_dt_hours > 0 ? 2.2 + (p.power_dt_hours / max) * 6 : 1.6;
          const ratio = (p.power_dt_hours || 0) / max;
          const fill = ratio > 0.66 ? "#B23A2E" : ratio > 0.33 ? "#C8862B" : "#55627A";
          return (
            <circle key={i} cx={px(p.lng)} cy={py(p.lat)} r={r} fill={fill}
              fillOpacity={0.72} stroke="#fff" strokeWidth={0.4}
              onMouseEnter={() => setHover({ p, x: px(p.lng), y: py(p.lat) })}
              onMouseLeave={() => setHover(null)}
              onClick={() => onPick && onPick(p)} style={{ cursor: "pointer" }} />
          );
        })}
      </svg>
      {hover && (
        <div className="absolute pointer-events-none bg-ink text-white text-[11px] rounded px-2 py-1 shadow-lg"
          style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / H) * 100}%`, transform: "translate(-50%,-130%)" }}>
          <div className="font-semibold">{hover.p.site_id}</div>
          <div>{fmtH(hover.p.power_dt_hours)} · {hover.p.n_outage} outages</div>
        </div>
      )}
      <div className="flex items-center gap-4 text-[11px] text-mut mt-2">
        <span>{fmtInt(pts.length)} sites plotted</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-crit inline-block" /> high</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber inline-block" /> medium</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate inline-block" /> low</span>
        <span>· dot size = power downtime · click a site for detail</span>
      </div>
    </div>
  );
}

/* ---------- site detail drawer ---------- */
export function Drawer({ site, onClose }) {
  if (!site) return null;
  const Row = ({ k, v }) => (
    <div className="flex justify-between py-1.5 border-b border-line/70 text-[13px]">
      <span className="text-mut">{k}</span><span className="text-navy font-medium tabular text-right">{v}</span>
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-ink/40" />
      <div className="relative w-full max-w-md bg-card h-full overflow-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-navy text-white px-5 py-4 flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-white/60">Site detail</div>
            <div className="text-xl font-bold">{site.site_id}</div>
            <div className="text-[12px] text-white/70">{site.cluster} · {site.nop} · {site.region}</div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-lg leading-none">✕</button>
        </div>
        <div className="p-5 space-y-5">
          <div className="flex gap-2 flex-wrap">
            {site.class && <Tag tone="slate">{site.class}</Tag>}
            {site.vip && site.vip !== "Not VIP" && <Tag tone="amber">VIP</Tag>}
            {site.bad_grid && <Tag tone="crit">bad grid</Tag>}
            <UnderDim v={site.under_dim} />
            {site.vendor && <Tag tone="mut">{site.vendor}</Tag>}
          </div>
          <section>
            <h4 className="text-[11px] uppercase tracking-wide text-mut font-semibold mb-1">v1 · PLN outage & impact</h4>
            <Row k="PLN outages (H1)" v={fmtInt(site.n_outage)} />
            <Row k="Led to network down (NE down)" v={fmtInt(site.n_ne_down)} />
            <Row k="Backup held (only mains fail)" v={fmtInt(site.n_only_mains)} />
            <Row k="Power downtime (wall-clock)" v={fmtH(site.power_dt_hours)} />
            <Row k="Power downtime (NE-hours, severity)" v={fmtH(site.power_ne_hours)} />
            <Row k="Days with power incident" v={fmtInt(site.power_days)} />
            <Row k="Min power availability" v={site.min_ava_power == null ? "—" : site.min_ava_power + "%"} />
          </section>
          <section>
            <h4 className="text-[11px] uppercase tracking-wide text-mut font-semibold mb-1">v2 · Backup dimensioning & battery</h4>
            <Row k="Backup verdict" v={site.under_dim === true ? "Under-dimensioned (site went down)" : site.under_dim === false ? "Held" : "No event data"} />
            <Row k="Battery age (yr)" v={site.batt_age_yr ?? "—"} />
            <Row k="Battery type" v={site.batt_type ?? "—"} />
            <Row k="Battery qty" v={site.batt_qty ?? "—"} />
            <Row k="Genset" v={site.genset_fix ?? "—"} />
            <Row k="Target max downtime/yr (h)" v={site.target_max_h ?? "—"} />
          </section>
          <section>
            <h4 className="text-[11px] uppercase tracking-wide text-mut font-semibold mb-1">v3 · Traffic exposure</h4>
            <Row k="Payload (GB, Jan–Apr)" v={fmtInt(site.payload_gb)} />
            <Row k="Lost-GB proxy" v={fmtInt(site.lost_gb)} />
          </section>
          <div className="text-[11px] text-mut">
            Data provenance: {[site.in_avail && "availability", site.in_events && "events", site.in_config && "config"].filter(Boolean).join(" · ") || "—"}
          </div>
        </div>
      </div>
    </div>
  );
}
