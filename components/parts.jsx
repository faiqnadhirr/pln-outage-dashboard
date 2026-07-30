"use client";
import React, { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid, Legend,
} from "recharts";

/* ---------- format ---------- */
export const fmtInt = (n) => (n == null ? "—" : Math.round(n).toLocaleString("en-US"));
export const fmtH = (n) => (n == null ? "—" : Math.round(n).toLocaleString("en-US") + "h");
export const fmt1 = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 1 }));

/* ---------- labels ---------- */
export const PATTERN = {
  both: { label: "Grid + backup", tone: "crit", action: "Highest priority — PLN unreliable and backup insufficient. Pursue grid escalation and backup upgrade together." },
  grid_backup_ok: { label: "Grid bad · backup OK", tone: "amber", action: "Escalate to PLN — grid is unreliable but backup holds. Avoid spending battery CAPEX here." },
  backup_fail: { label: "Backup insufficient", tone: "crit", action: "Fix backup — few outages but the site drops. Check battery dimensioning and age." },
  minimal: { label: "Minimal", tone: "ok", action: "Monitor — no material power issue this period." },
  no_data: { label: "No event data", tone: "mut", action: "Verify — site is absent from the event feed. Manual check needed to confirm backup behaviour." },
};
export const REPEAT = {
  chronic: { label: "Chronic", tone: "crit" }, intermittent: { label: "Intermittent", tone: "amber" },
  one_off: { label: "One-off", tone: "slate" }, none: { label: "—", tone: "mut" },
};

/* ---------- tags ---------- */
export function Tag({ children, tone = "slate" }) {
  const t = { slate: "bg-slate/10 text-slate", amber: "bg-amber/15 text-amber", crit: "bg-crit/12 text-crit", ok: "bg-ok/12 text-ok", mut: "bg-line text-mut" };
  return <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium ${t[tone]}`}>{children}</span>;
}
export const PatternTag = ({ p }) => p ? <Tag tone={PATTERN[p]?.tone}>{PATTERN[p]?.label}</Tag> : "—";
export const RepeatTag = ({ r }) => r && r !== "none" ? <Tag tone={REPEAT[r]?.tone}>{REPEAT[r]?.label}</Tag> : <span className="text-mut">—</span>;
export function TrendTag({ t }) {
  if (t === "worsening") return <span className="text-crit text-[12px] font-semibold">▲ worsening</span>;
  if (t === "improving") return <span className="text-ok text-[12px] font-semibold">▼ improving</span>;
  return <span className="text-mut text-[12px]">◦ stable</span>;
}

/* ---------- impact bar ---------- */
export function ImpactBar({ value, max }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0, ratio = max ? value / max : 0;
  const color = ratio > 0.66 ? "#B23A2E" : ratio > 0.33 ? "#C8862B" : "#8B97AC";
  return (
    <div className="flex items-center gap-2 min-w-[110px]">
      <div className="h-[7px] flex-1 rounded-full bg-line overflow-hidden"><div className="h-full rounded-full" style={{ width: pct + "%", background: color }} /></div>
      <span className="tabular text-[12px] text-navy w-14 text-right">{fmtH(value)}</span>
    </div>
  );
}

/* ---------- KPI ---------- */
export function Kpi({ label, value, sub, tone = "navy" }) {
  const c = { navy: "text-navy", amber: "text-amber", crit: "text-crit", ok: "text-ok", slate: "text-slate" }[tone];
  return (
    <div className="bg-card border border-line rounded-lg px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-mut font-semibold">{label}</div>
      <div className={`text-[24px] leading-tight font-bold tabular ${c}`}>{value}</div>
      {sub && <div className="text-[11px] text-mut mt-0.5">{sub}</div>}
    </div>
  );
}

/* ---------- monthly sparkline ---------- */
export function Sparkline({ m, months }) {
  if (!m || !m.length) return null;
  const max = Math.max(...m, 1), W = 150, H = 34, step = W / (m.length - 1);
  const pts = m.map((v, i) => `${i * step},${H - (v / max) * (H - 4) - 2}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H + 12}`} className="w-full">
      <polyline points={pts} fill="none" stroke="#C8862B" strokeWidth="1.6" />
      {m.map((v, i) => <circle key={i} cx={i * step} cy={H - (v / max) * (H - 4) - 2} r="1.8" fill="#1F2A44" />)}
      {(months || []).map((mo, i) => <text key={i} x={i * step} y={H + 10} fontSize="7" fill="#7A8598" textAnchor="middle">{mo}</text>)}
    </svg>
  );
}

/* ---------- time-series with D/W/M/Q ---------- */
function bucketize(dates, dt, out, gran) {
  const MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const keyOf = (d) => {
    const y = d.slice(0, 4), mo = d.slice(4, 6), da = +d.slice(6, 8);
    if (gran === "Daily") return { k: d, l: `${mo}/${d.slice(6, 8)}` };
    if (gran === "Monthly") return { k: y + mo, l: MN[+mo - 1] };
    if (gran === "Quarterly") return { k: y + "Q" + Math.ceil(+mo / 3), l: "Q" + Math.ceil(+mo / 3) };
    const date = new Date(+y, +mo - 1, da), onejan = new Date(+y, 0, 1);
    const wk = Math.ceil((((date - onejan) / 86400000) + onejan.getDay() + 1) / 7);
    return { k: y + "W" + String(wk).padStart(2, "0"), l: "W" + wk };
  };
  const map = new Map();
  dates.forEach((d, i) => {
    const { k, l } = keyOf(d);
    const e = map.get(k) || { key: k, label: l, dt: 0, out: 0 };
    e.dt += dt[i] || 0; e.out += (out ? out[i] : 0) || 0; map.set(k, e);
  });
  return [...map.values()].sort((a, b) => a.key < b.key ? -1 : 1).map((e) => ({ label: e.label, dt: Math.round(e.dt), out: e.out }));
}
export function TimeSeries({ dates, dt, out, height = 240 }) {
  const [gran, setGran] = useState("Weekly");
  const data = useMemo(() => bucketize(dates, dt, out, gran), [dates, dt, out, gran]);
  return (
    <div>
      <div className="flex gap-1 mb-2">
        {["Daily", "Weekly", "Monthly", "Quarterly"].map((g) => (
          <button key={g} onClick={() => setGran(g)}
            className={`px-2.5 py-1 text-[11px] rounded border ${gran === g ? "bg-navy text-white border-navy" : "border-line text-slate hover:bg-surface"}`}>{g}</button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ left: 4, right: 8, top: 6, bottom: 4 }}>
          <CartesianGrid strokeDasharray="2 3" stroke="#EEF2F7" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#7A8598" }} interval="preserveStartEnd" minTickGap={16} />
          <YAxis yAxisId="l" tick={{ fontSize: 10, fill: "#7A8598" }} tickFormatter={(v) => v >= 1000 ? (v / 1000) + "k" : v} width={40} />
          <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: "#C8862B" }} tickFormatter={(v) => v >= 1000 ? (v / 1000) + "k" : v} width={40} />
          <Tooltip labelStyle={{ color: "#141821" }} formatter={(v, n) => [fmtInt(v), n === "dt" ? "Power downtime (NE-h)" : "PLN outages"]} />
          <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => v === "dt" ? "Power downtime (NE-h)" : "PLN outages"} />
          <Line yAxisId="l" type="monotone" dataKey="dt" stroke="#1F2A44" strokeWidth={2} dot={false} />
          <Line yAxisId="r" type="monotone" dataKey="out" stroke="#C8862B" strokeWidth={1.6} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- charts ---------- */
export function TopClustersBar({ data }) {
  const d = data.slice(0, 10).map((c) => ({ name: c.cluster.replace(/^TO /, ""), hours: Math.round(c.power_dt_hours) }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={d} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <XAxis type="number" tick={{ fontSize: 10, fill: "#7A8598" }} tickFormatter={(v) => v >= 1000 ? v / 1000 + "k" : v} />
        <YAxis type="category" dataKey="name" width={112} tick={{ fontSize: 10, fill: "#141821" }} />
        <Tooltip formatter={(v) => [fmtInt(v) + " h", "Power downtime"]} />
        <Bar dataKey="hours" radius={[0, 3, 3, 0]}>{d.map((e, i) => <Cell key={i} fill={i === 0 ? "#B23A2E" : i < 3 ? "#C8862B" : "#1F2A44"} />)}</Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
export function PatternMix({ counts, onPick }) {
  const order = ["both", "backup_fail", "grid_backup_ok", "minimal", "no_data"];
  const total = order.reduce((a, k) => a + (counts[k] || 0), 0);
  return (
    <div className="space-y-1.5">
      {order.map((k) => {
        const v = counts[k] || 0, pct = total ? (v / total) * 100 : 0;
        const col = { both: "#B23A2E", backup_fail: "#C8862B", grid_backup_ok: "#55627A", minimal: "#2E7D32", no_data: "#9aa4b2" }[k];
        return (
          <div key={k} className={`flex items-center gap-2 ${onPick ? "cursor-pointer" : ""}`} onClick={() => onPick && onPick(k)}>
            <span className="w-[132px] text-[12px] text-slate">{PATTERN[k].label}</span>
            <div className="flex-1 h-4 bg-line rounded overflow-hidden"><div className="h-full rounded" style={{ width: pct + "%", background: col }} /></div>
            <span className="tabular text-[12px] text-navy w-12 text-right">{fmtInt(v)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- CSV export ---------- */
export function exportCsv(rows, columns, filename) {
  const head = columns.map((c) => `"${c.label}"`).join(",");
  const body = rows.map((r) => columns.map((c) => {
    let v = c.get ? c.get(r) : r[c.key]; if (v == null) v = "";
    return `"${String(v).replace(/"/g, '""')}"`;
  }).join(",")).join("\n");
  const blob = new Blob([head + "\n" + body], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- generic table ---------- */
export function DataTable({ columns, rows, onRowClick, initialSort, rankMax, maxRows = 500 }) {
  const [sort, setSort] = useState(initialSort || { key: columns[0].key, dir: "desc" });
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort.key); const acc = col?.sortAccessor || ((r) => r[sort.key]);
    return [...rows].sort((a, b) => {
      const va = acc(a), vb = acc(b);
      if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1;
      if (typeof va === "number") return sort.dir === "desc" ? vb - va : va - vb;
      return sort.dir === "desc" ? String(vb).localeCompare(String(va)) : String(va).localeCompare(String(vb));
    }).slice(0, maxRows);
  }, [rows, sort, columns, maxRows]);
  return (
    <div className="overflow-auto border border-line rounded-lg bg-card">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-surface border-b border-line z-10"><tr>{columns.map((c) => {
          const active = sort.key === c.key;
          return <th key={c.key} onClick={() => c.sortable !== false && setSort((s) => ({ key: c.key, dir: active && s.dir === "desc" ? "asc" : "desc" }))}
            className={`px-3 py-2 text-[11px] uppercase tracking-wide font-semibold text-mut select-none whitespace-nowrap ${c.sortable === false ? "" : "cursor-pointer hover:text-navy"} ${c.align === "right" ? "text-right" : "text-left"}`}>
            {c.label}{active ? (sort.dir === "desc" ? " ↓" : " ↑") : ""}</th>;
        })}</tr></thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.__id ?? i} onClick={() => onRowClick && onRowClick(r)}
              className={`border-b border-line/70 ${onRowClick ? "cursor-pointer hover:bg-surface" : ""}`}>
              {columns.map((c) => <td key={c.key} className={`px-3 py-1.5 text-[13px] ${c.align === "right" ? "text-right tabular" : ""}`}>{c.render ? c.render(r, i, rankMax) : (r[c.key] ?? "—")}</td>)}
            </tr>
          ))}
          {sorted.length === 0 && <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-mut text-sm">No rows match the current filters.</td></tr>}
        </tbody>
      </table>
      {rows.length > maxRows && <div className="px-3 py-2 text-[11px] text-mut border-t border-line">Showing top {maxRows} of {fmtInt(rows.length)} — narrow the filters to see more.</div>}
    </div>
  );
}

/* ---------- map scatter ---------- */
export function MapScatter({ sites, onPick }) {
  const [hover, setHover] = useState(null);
  const pts = sites.filter((s) => s.lat && s.lng && s.lat > -12 && s.lat < 8 && s.lng > 90 && s.lng < 120);
  if (pts.length === 0) return <div className="text-mut text-sm p-6">No coordinates for the current filter.</div>;
  const xs = pts.map((p) => p.lng), ys = pts.map((p) => p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const W = 760, H = 460, pad = 20, max = Math.max(...pts.map((p) => p.power_dt_hours || 0)) || 1;
  const px = (l) => pad + ((l - minX) / (maxX - minX || 1)) * (W - 2 * pad), py = (l) => H - pad - ((l - minY) / (maxY - minY || 1)) * (H - 2 * pad);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-navy/[0.03] rounded-lg border border-line">
        {pts.map((p, i) => {
          const r = p.power_dt_hours > 0 ? 2.2 + (p.power_dt_hours / max) * 6 : 1.6, ratio = (p.power_dt_hours || 0) / max;
          const fill = ratio > 0.66 ? "#B23A2E" : ratio > 0.33 ? "#C8862B" : "#55627A";
          return <circle key={i} cx={px(p.lng)} cy={py(p.lat)} r={r} fill={fill} fillOpacity={0.72} stroke="#fff" strokeWidth={0.4}
            onMouseEnter={() => setHover({ p, x: px(p.lng), y: py(p.lat) })} onMouseLeave={() => setHover(null)}
            onClick={() => onPick && onPick(p)} style={{ cursor: "pointer" }} />;
        })}
      </svg>
      {hover && <div className="absolute pointer-events-none bg-ink text-white text-[11px] rounded px-2 py-1 shadow-lg"
        style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / H) * 100}%`, transform: "translate(-50%,-130%)" }}>
        <div className="font-semibold">{hover.p.site_id}</div><div>{fmtH(hover.p.power_dt_hours)} · {hover.p.n_outage} outages</div></div>}
      <div className="flex items-center gap-4 text-[11px] text-mut mt-2 flex-wrap">
        <span>{fmtInt(pts.length)} sites plotted</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-crit inline-block" /> high</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber inline-block" /> medium</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate inline-block" /> low</span>
        <span>· dot size = downtime · click for detail</span>
      </div>
    </div>
  );
}

/* ---------- site drawer (with lazy events) ---------- */
export function Drawer({ site, months, onClose }) {
  const [events, setEvents] = useState(null); const [loading, setLoading] = useState(false);
  React.useEffect(() => {
    if (!site) return; setEvents(null);
    const slug = (site.cluster || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!slug) { setEvents([]); return; } setLoading(true);
    fetch(`/clusters/${slug}.json`).then((r) => r.ok ? r.json() : {}).then((o) => setEvents(o[site.site_id] || [])).catch(() => setEvents([])).finally(() => setLoading(false));
  }, [site]);
  if (!site) return null;
  const Row = ({ k, v }) => <div className="flex justify-between py-1.5 border-b border-line/70 text-[13px]"><span className="text-mut">{k}</span><span className="text-navy font-medium tabular text-right">{v}</span></div>;
  const pat = PATTERN[site.pattern];
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-ink/40" />
      <div className="relative w-full max-w-md bg-card h-full overflow-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-navy text-white px-5 py-4 flex items-start justify-between z-10">
          <div><div className="text-[11px] uppercase tracking-wide text-white/60">Site detail</div>
            <div className="text-xl font-bold">{site.site_id}</div>
            <div className="text-[12px] text-white/70">{site.cluster} · {site.nop} · {site.region}</div></div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-lg leading-none">✕</button>
        </div>
        <div className="p-5 space-y-5">
          <div className="flex gap-2 flex-wrap items-center">
            {site.class && <Tag tone="slate">{site.class}</Tag>}
            {site.vip && site.vip !== "Not VIP" && <Tag tone="amber">VIP</Tag>}
            {site.bad_grid && <Tag tone="crit">bad grid</Tag>}
            <PatternTag p={site.pattern} /><RepeatTag r={site.repeat} /><TrendTag t={site.trend} />
          </div>
          {pat && <div className="bg-surface border border-line rounded-md p-3 text-[12px]"><b className="text-navy">Suggested direction:</b> <span className="text-slate">{pat.action}</span></div>}
          <div>
            <h4 className="text-[11px] uppercase tracking-wide text-mut font-semibold mb-1">Monthly power downtime (h)</h4>
            <Sparkline m={site.m} months={months} />
          </div>
          <section>
            <h4 className="text-[11px] uppercase tracking-wide text-mut font-semibold mb-1">v1 · outage &amp; impact</h4>
            <Row k="PLN outages (H1)" v={fmtInt(site.n_outage)} /><Row k="Led to network down" v={fmtInt(site.n_ne_down)} />
            <Row k="Backup held (only mains fail)" v={fmtInt(site.n_only_mains)} /><Row k="Power downtime (wall-clock)" v={fmtH(site.power_dt_hours)} />
            <Row k="Power downtime (NE-hours)" v={fmtH(site.power_ne_hours)} /><Row k="Days with power incident" v={fmtInt(site.power_days)} />
            <Row k="Min power availability" v={site.min_ava_power == null ? "—" : site.min_ava_power + "%"} />
          </section>
          <section>
            <h4 className="text-[11px] uppercase tracking-wide text-mut font-semibold mb-1">v2 · backup &amp; battery</h4>
            <Row k="Backup verdict" v={site.backup_insufficient === true ? "Insufficient (site went down)" : site.backup_insufficient === false ? "Held" : "No event data"} />
            <Row k="Battery age (yr)" v={site.batt_age_yr ?? "—"} /><Row k="Battery type" v={site.batt_type ?? "—"} />
            <Row k="Battery qty" v={site.batt_qty ?? "—"} /><Row k="Genset" v={site.genset_fix ?? "—"} /><Row k="Target max downtime/yr (h)" v={site.target_max_h ?? "—"} />
          </section>
          <section>
            <h4 className="text-[11px] uppercase tracking-wide text-mut font-semibold mb-1">v3 · traffic exposure</h4>
            <Row k="Payload (GB, Jan–Apr)" v={fmtInt(site.payload_gb)} /><Row k="Lost-GB proxy" v={fmtInt(site.lost_gb)} />
          </section>
          <section>
            <h4 className="text-[11px] uppercase tracking-wide text-mut font-semibold mb-1">Recent PLN events {events ? `(${events.length})` : ""}</h4>
            {loading && <div className="text-mut text-[12px]">Loading events…</div>}
            {events && events.length === 0 && <div className="text-mut text-[12px]">No event records for this site.</div>}
            {events && events.length > 0 && (
              <div className="border border-line rounded-md overflow-hidden">
                <table className="w-full text-[11px]"><thead><tr className="bg-surface text-mut"><th className="text-left px-2 py-1">Start</th><th className="text-right px-2 py-1">Backup</th><th className="text-left px-2 py-1">Outcome</th></tr></thead>
                  <tbody>{events.slice(0, 50).map((e, i) => (
                    <tr key={i} className="border-t border-line/70"><td className="px-2 py-1 tabular">{e.t || "—"}</td>
                      <td className="px-2 py-1 text-right tabular">{Math.round(e.d / 60)}m</td>
                      <td className="px-2 py-1">{/NE Down/.test(e.f) ? <span className="text-crit">site down</span> : <span className="text-ok">held</span>}</td></tr>))}
                  </tbody></table>
              </div>
            )}
          </section>
          <div className="text-[11px] text-mut">Provenance: {[site.in_avail && "availability", site.in_events && "events", site.in_config && "config"].filter(Boolean).join(" · ") || "—"}</div>
        </div>
      </div>
    </div>
  );
}
