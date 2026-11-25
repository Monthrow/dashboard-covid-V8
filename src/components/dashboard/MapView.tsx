import { useEffect, useMemo, useRef, useState } from "react";
import type * as LType from "leaflet";
import type { Feature, FeatureCollection } from "geojson";
import { useData } from "./DataContext";
import { Panel, Seg } from "./Shell";
import geoUrl from "@/assets/indonesia-provinces.geojson?url";
import { fmt, fmtCompact, fmtDate, fmtDec, heatBreaks, heatClass, provinceValues } from "@/lib/covid-data";

type MapMetric = "tc" | "nc" | "td" | "cfr";
const LABEL: Record<MapMetric, string> = { tc: "Total Kasus", nc: "Kasus Baru (periode)", td: "Total Kematian", cfr: "Tingkat Fatalitas (%)" };
const HEAT = ["bg-heat-1", "bg-heat-2", "bg-heat-3", "bg-heat-4", "bg-heat-5"];

let geoPromise: Promise<FeatureCollection> | null = null;
const loadGeo = () =>
  (geoPromise ??= fetch(geoUrl).then((r) => {
    if (!r.ok) throw new Error(`Batas provinsi gagal dimuat (HTTP ${r.status})`);
    return r.json() as Promise<FeatureCollection>;
  }));

export function MapView({ height = 460 }: { height?: number }) {
  const { ds, filters, select } = useData();
  const [metric, setMetric] = useState<MapMetric>("tc");
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LType.Map | null>(null);
  const layer = useRef<LType.GeoJSON | null>(null);
  const L = useRef<typeof LType | null>(null);
  const [geo, setGeo] = useState<FeatureCollection | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const all = useMemo(() => provinceValues(ds!, filters, metric), [ds, filters, metric]);
  const byName = useMemo(() => new Map(all.map((p) => [p.province, p])), [all]);
  const breaks = useMemo(() => heatBreaks(all.map((p) => p.value)), [all]);
  const fmtV = (v: number) => (metric === "cfr" ? `${fmtDec(v)}%` : fmt(v));
  const fmtB = (v: number) => (metric === "cfr" ? `${fmtDec(v)}%` : fmtCompact(v));

  useEffect(() => {
    let dead = false;
    loadGeo().then((g) => !dead && setGeo(g)).catch((e) => !dead && setGeoError(e.message));
    (async () => {
      const mod = await import("leaflet");
      await import("leaflet/dist/leaflet.css");
      if (dead || !el.current || map.current) return;
      L.current = (mod as unknown as { default: typeof LType }).default ?? mod;
      map.current = L.current.map(el.current, { center: [-2.5, 118], zoom: 5, minZoom: 4, scrollWheelZoom: true });
      L.current.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors", maxZoom: 12, opacity: 0.6 }).addTo(map.current);
      setReady(true);
    })();
    return () => { dead = true; map.current?.remove(); map.current = null; layer.current = null; };
  }, []);

  useEffect(() => {
    if (!ready || !geo || !L.current || !map.current) return;
    layer.current?.remove();
    const cls = (f?: Feature) => {
      const name = String(f?.properties?.["name"] ?? "");
      const p = byName.get(name);
      const sel = name === filters.province;
      return `heat-shape ${p ? `heat-${heatClass(p.value, breaks)}` : "heat-none"}${sel ? " heat-selected" : ""}`;
    };
    const gj = L.current.geoJSON(geo, {
      style: (f) => ({ className: cls(f), weight: String(f?.properties?.["name"]) === filters.province ? 3 : 1, fillOpacity: 0.85 }),
      onEachFeature: (f, lyr) => {
        const name = String(f.properties?.["name"] ?? "");
        const p = byName.get(name);
        lyr.bindTooltip(p ? `<b>${name}</b><br/>${LABEL[metric]}: ${fmtV(p.value)}` : `<b>${name}</b><br/>Di luar filter aktif`, { sticky: true });
        if (p) lyr.bindPopup(`<div style="font-size:12px"><b>${name}</b><br/>Tanggal data: ${fmtDate(p.date)}<br/>${LABEL[metric]}: <b>${fmtV(p.value)}</b><br/>Total kasus: ${fmt(p.tc)} · Kematian: ${fmt(p.td)}<br/><i>Klik provinsi memfilter dashboard.</i></div>`);
        lyr.on({
          mouseover: () => { (lyr as LType.Path).setStyle({ weight: 3 }); (lyr as LType.Path).bringToFront(); },
          mouseout: () => { (lyr as LType.Path).setStyle({ weight: name === filters.province ? 3 : 1 }); },
          click: () => { if (p) select({ province: name, level: "Province" }); },
        });
      },
    }).addTo(map.current);
    layer.current = gj;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, geo, byName, breaks, metric, filters.province, select]);

  const lower = (i: number) => (i === 0 ? Math.min(...all.map((p) => p.value)) : breaks[i - 1]!);

  return (
    <Panel title="Peta Persebaran COVID-19" subtitle={`Heatmap per provinsi · warna = kelas kuantil ${LABEL[metric]} · ${byName.size} dari 34 provinsi dalam filter. Klik provinsi untuk memfilter.`}
      actions={<Seg value={metric} onChange={setMetric} options={(Object.keys(LABEL) as MapMetric[]).map((k) => ({ v: k, l: LABEL[k] }))} />}>
      <div ref={el} style={{ height }} className="relative z-0 overflow-hidden rounded-md border bg-muted" />
      {geoError && <p className="mt-2 text-xs text-destructive">{geoError}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{LABEL[metric]}</span>
        <div className="flex flex-wrap items-center gap-2">
          {breaks.map((b, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className={`inline-block h-3 w-5 rounded-sm ${HEAT[i]}`} />
              <span className="num">{fmtB(lower(i))} – {fmtB(b)}</span>
            </span>
          ))}
        </div>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-5 rounded-sm bg-muted ring-1 ring-border" />Di luar filter</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-5 rounded-sm ring-2 ring-orange" />Provinsi terpilih</span>
      </div>
    </Panel>
  );
}
