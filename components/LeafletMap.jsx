"use client";
import React, { useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip as LTooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

function FitBounds({ pts }) {
  const map = useMap();
  React.useEffect(() => {
    if (!pts.length) return;
    const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng);
    map.fitBounds([[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]], { padding: [24, 24] });
  }, [pts, map]);
  return null;
}

export default function LeafletMap({ sites, onPick, valueKey = "power_dt_hours" }) {
  const all = useMemo(
    () => sites.filter((s) => s.lat && s.lng && s.lat > -12 && s.lat < 8 && s.lng > 90 && s.lng < 120),
    [sites]
  );
  const pts = useMemo(() => [...all].sort((a, b) => ((b._rdt!=null?b._rdt:b[valueKey])||0) - ((a._rdt!=null?a._rdt:a[valueKey])||0)).slice(0, 3000), [all, valueKey]);
  const val = (p) => (p._rdt != null ? p._rdt : (p[valueKey] || 0));
  const max = useMemo(() => Math.max(1, ...pts.map(val)), [pts, valueKey]);
  if (!all.length) return <div className="text-mut text-sm p-6">No coordinates for the current filter.</div>;
  return (
    <div>
      <MapContainer center={[-1.5, 102]} zoom={6} scrollWheelZoom preferCanvas style={{ height: 520, borderRadius: 8, border: "1px solid #E3E7ED" }}>
        <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitBounds pts={pts} />
        {pts.map((p, i) => {
          const v = val(p), ratio = v / max;
          const color = ratio > 0.66 ? "#B23A2E" : ratio > 0.33 ? "#C8862B" : "#3E4C63";
          const r = 3 + Math.sqrt(ratio) * 9;
          return (
            <CircleMarker key={i} center={[p.lat, p.lng]} radius={r}
              pathOptions={{ color: "#fff", weight: 0.6, fillColor: color, fillOpacity: 0.72 }}
              eventHandlers={{ click: () => onPick && onPick(p) }}>
              <LTooltip><div style={{ fontSize: 12 }}><b>{p.site_id}</b><br />{Math.round(v).toLocaleString()}h · {p.n_outage} outages<br />{p.cluster}</div></LTooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
      <div className="flex items-center gap-4 text-[11px] text-mut mt-2 flex-wrap">
        <span>{pts.length.toLocaleString()}{all.length > pts.length ? ` of ${all.length.toLocaleString()}` : ""} sites plotted (worst first)</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-crit inline-block" /> high</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber inline-block" /> medium</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate inline-block" /> low</span>
        <span>· dot size = downtime · click a site for detail · scroll to zoom</span>
      </div>
    </div>
  );
}
