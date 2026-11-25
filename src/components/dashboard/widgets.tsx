import { useMemo, useState } from "react";
import {
  Bar, BarChart, Brush, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Activity, HeartPulse, Info, ShieldCheck, Skull, TrendingDown, TrendingUp, X } from "lucide-react";
import { useData } from "./DataContext";
import { Empty, Panel, Seg } from "./Shell";
import {
  METRICS, addDays, change, daysBetween, fmt, fmtCompact, fmtDate, fmtDec, fmtPct, pointAt, provinceValues,
  scopeLabel, scopeLocations, series, sumOf, type MetricKey,
} from "@/lib/covid-data";
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const COLORS: Record<MetricKey, string> = { nc: "var(--chart-1)", nd: "var(--chart-4)", nr: "var(--chart-5)", tc: "var(--chart-1)", td: "var(--chart-4)", tr: "var(--chart-5)", ta: "var(--chart-3)" };

export function useScope() {
  const { ds, filters } = useData();
  return useMemo(() => {
    if (!ds) return { locs: [], s: [], end: null, prev: null, prevEndKey: "", len: 0, label: "" };
    const locs = scopeLocations(ds, filters);
    const s = series(ds, locs, filters.start, filters.end);
    const end = s[s.length - 1] ?? null;
    const len = daysBetween(filters.start, filters.end) + 1;
    const prevEndKey = addDays(end?.key ?? filters.end, -len);
    const prev = prevEndKey >= ds.minKey ? pointAt(ds, locs, prevEndKey) : null;
    return { locs, s, end, prev, prevEndKey, len, label: scopeLabel(ds, filters) };
  }, [ds, filters]);
}

// ---------------- KPI ----------------
const KPI = [
  { k: "tc", label: "Total Kasus", icon: Activity, def: "Jumlah kumulatif kasus terkonfirmasi (Total Cases) pada tanggal akhir periode.", tone: "text-primary bg-primary/10" },
  { k: "td", label: "Total Kematian", icon: Skull, def: "Jumlah kumulatif kematian (Total Deaths) pada tanggal akhir periode.", tone: "text-destructive bg-destructive/10" },
  { k: "tr", label: "Total Kesembuhan", icon: ShieldCheck, def: "Jumlah kumulatif pasien sembuh (Total Recovered) pada tanggal akhir periode.", tone: "text-success bg-success/10" },
  { k: "ta", label: "Kasus Aktif", icon: HeartPulse, def: "Total Active Cases pada tanggal akhir: kasus − sembuh − meninggal (nilai dataset).", tone: "text-orange bg-orange/10" },
] as const;

export function KpiCards() {
  const { end, prev, len } = useScope();
  if (!end) return <Empty />;
  return (
    <TooltipProvider>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {KPI.map((c) => {
          const v = end[c.k];
          const ch = change(v, prev?.[c.k]);
          const up = (ch?.diff ?? 0) >= 0;
          return (
            <div key={c.k} className={`panel kpi-card ${c.k === "tc" ? "kpi-cases" : c.k === "td" ? "kpi-deaths" : c.k === "tr" ? "kpi-recovered" : "kpi-active"} p-4`}>
              <div className="flex items-center gap-2">
                <div className={`grid h-9 w-9 place-items-center rounded-md ${c.tone}`}><c.icon className="h-5 w-5" /></div>
                <span className="text-sm font-semibold text-muted-foreground">{c.label}</span>
                <UiTooltip>
                  <TooltipTrigger className="ml-auto text-muted-foreground" aria-label={`Definisi ${c.label}`}><Info className="h-4 w-4" /></TooltipTrigger>
                  <TooltipContent className="max-w-60">{c.def}</TooltipContent>
                </UiTooltip>
              </div>
              <div className="num mt-3 text-2xl font-extrabold tracking-tight md:text-3xl">{fmt(v)}</div>
              <div className="mt-1 text-xs text-muted-foreground">per {fmtDate(end.key)}</div>
              <div className="mt-2 border-t pt-2 text-xs">
                {ch ? (
                  <span className="flex items-center gap-1">
                    {up ? <TrendingUp className="h-3.5 w-3.5 text-orange" /> : <TrendingDown className="h-3.5 w-3.5 text-teal" />}
                    <span className="num font-semibold">{ch.diff > 0 ? "+" : ""}{fmt(ch.diff)}</span>
                    <span className="num font-semibold">({ch.pct == null ? "pembanding 0" : fmtPct(ch.pct)})</span>
                    <span className="text-muted-foreground">vs {fmtDate(prev?.key ?? "")} ({len} hari sebelumnya)</span>
                  </span>
                ) : <span className="text-muted-foreground">Pembanding periode setara tidak tersedia (di luar rentang data).</span>}
              </div>
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

// ---------------- Trend ----------------
const tickDate = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}/${k.slice(2, 4)}`;
const DAILY: MetricKey[] = ["nc", "nd", "nr"];
const CUMUL: MetricKey[] = ["tc", "ta", "td", "tr"];

export function TrendChart({ height = 340 }: { height?: number }) {
  const { filters } = useData();
  const { s, label } = useScope();
  const [mode, setMode] = useState<"daily" | "cumulative">(METRICS[filters.indicator].cumulative ? "cumulative" : "daily");
  const [metric, setMetric] = useState<MetricKey>(filters.indicator);
  const [multi, setMulti] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const list = mode === "daily" ? DAILY : CUMUL;
  const m = list.includes(metric) ? metric : mode === "daily" ? "nc" : "tc";
  const keys = multi ? (mode === "daily" ? DAILY : ["tc", "ta", "tr", "td"] as MetricKey[]) : [m];
  const fp = focus ? s.find((p) => p.key === focus) : null;
  return (
    <Panel title="Tren Perkembangan COVID-19 Indonesia" subtitle={`${label} · ${fmtDate(s[0]?.key ?? "")} – ${fmtDate(s[s.length - 1]?.key ?? "")}`}
      actions={<>
        <Seg value={mode} onChange={setMode} options={[{ v: "daily", l: "Daily Trend" }, { v: "cumulative", l: "Cumulative Trend" }]} />
        <select className="field" value={m} onChange={(e) => setMetric(e.target.value as MetricKey)} disabled={multi}>
          {list.map((k) => <option key={k} value={k}>{METRICS[k].label} ({METRICS[k].col})</option>)}
        </select>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} />Multi-seri</label>
      </>}>
      <p className="mb-2 text-xs text-muted-foreground">
        {mode === "daily" ? "Daily Trend: pertambahan per hari (New Cases/Deaths/Recovered) — memperlihatkan gelombang & lonjakan." : "Cumulative Trend: nilai akumulasi sampai tanggal tersebut (Total …) — selalu naik kecuali kasus aktif."}
        {" "}Seret pegangan di bawah grafik untuk memperbesar rentang; klik titik untuk melihat konteks tanggal.
      </p>
      {s.length === 0 ? <Empty /> : (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={s} margin={{ left: 8, right: 16, top: 8 }} onClick={(e) => e?.activeLabel && setFocus(String(e.activeLabel))}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="key" tickFormatter={tickDate} tick={{ fontSize: 11 }} minTickGap={30} />
            <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11 }} width={56} />
            <Tooltip labelFormatter={(k) => fmtDate(String(k))} formatter={(v, n) => [fmt(Number(v)), String(n)]} />
            {multi && <Legend />}
            {keys.map((k) => <Line key={k} dataKey={k} name={METRICS[k].label} stroke={COLORS[k]} dot={false} strokeWidth={2} isAnimationActive={false} />)}
            <Brush dataKey="key" height={24} tickFormatter={tickDate} stroke="var(--primary)" />
          </LineChart>
        </ResponsiveContainer>
      )}
      {fp && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground">
          <b>Konteks {fmtDate(fp.key)}:</b>
          <span>Kasus baru {fmt(fp.nc)}</span><span>Kematian baru {fmt(fp.nd)}</span><span>Sembuh baru {fmt(fp.nr)}</span>
          <span>Total kasus {fmt(fp.tc)}</span><span>Aktif {fmt(fp.ta)}</span>
          <button className="ml-auto" onClick={() => setFocus(null)} aria-label="Tutup"><X className="h-4 w-4" /></button>
        </div>
      )}
    </Panel>
  );
}

// ---------------- Province bar ----------------
type BarMetric = "tc" | "nc" | "td" | "tr";
export function ProvinceBar({ defaultTop = 10 }: { defaultTop?: number }) {
  const { ds, filters, select } = useData();
  const [metric, setMetric] = useState<BarMetric>("tc");
  const [desc, setDesc] = useState(true);
  const [top, setTop] = useState(defaultTop);
  const data = useMemo(() => {
    const v = ds ? provinceValues(ds, filters, metric).sort((a, b) => (desc ? b.value - a.value : a.value - b.value)) : [];
    return v.slice(0, top);
  }, [ds, filters, metric, desc, top]);
  const cum = METRICS[metric].cumulative;
  return (
    <Panel title="Perbandingan Kasus COVID-19 Antarprovinsi"
      subtitle={`${cum ? `Nilai kumulatif per ${fmtDate(filters.end)}` : `Jumlah selama ${fmtDate(filters.start)} – ${fmtDate(filters.end)}`}${filters.island ? ` · Pulau ${filters.island}` : ""} · Hanya baris tingkat provinsi. Klik bar untuk memfilter.`}
      actions={<>
        <select className="field" value={metric} onChange={(e) => setMetric(e.target.value as BarMetric)}>
          <option value="tc">Total Kasus</option><option value="nc">Kasus Baru (periode)</option><option value="td">Total Kematian</option><option value="tr">Total Kesembuhan</option>
        </select>
        <Seg value={desc ? "d" : "a"} onChange={(v) => setDesc(v === "d")} options={[{ v: "d", l: "Tertinggi" }, { v: "a", l: "Terendah" }]} />
        <select className="field" value={top} onChange={(e) => setTop(+e.target.value)}>
          {[5, 10, 15, 20, 34].map((n) => <option key={n} value={n}>{n === 34 ? "Semua" : `Top ${n}`}</option>)}
        </select>
      </>}>
      {data.length === 0 ? <Empty /> : (
        <ResponsiveContainer width="100%" height={Math.max(220, data.length * 28 + 40)}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis type="number" tickFormatter={fmtCompact} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="province" width={150} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => [fmt(Number(v)), METRICS[metric].label]} cursor={{ fill: "var(--muted)" }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} cursor="pointer" isAnimationActive={false}
              onClick={(d) => { const p = (d as unknown as { province: string }).province; select({ province: filters.province === p ? "" : p, level: "Province" }); }}>
              {data.map((d) => <Cell key={d.province} fill={d.province === filters.province ? "var(--orange)" : "var(--teal)"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}

// ---------------- Executive summary ----------------
export function ExecutiveSummary() {
  const { ds, filters, whatIf } = useData();
  const { s, end, label } = useScope();
  const first = s[0];
  if (!ds || !end || !first) return null;
  const cases = sumOf(s, "nc"), deaths = sumOf(s, "nd"), rec = sumOf(s, "nr");
  const half = Math.floor(s.length / 2);
  const a = half ? sumOf(s.slice(0, half), "nc") / half : 0;
  const b = s.length - half ? sumOf(s.slice(half), "nc") / (s.length - half) : 0;
  const trendPct = a > 0 ? ((b - a) / a) * 100 : null;
  const topP = provinceValues(ds, filters, "tc").sort((x, y) => y.value - x.value)[0];
  const topNew = provinceValues(ds, filters, "nc").sort((x, y) => y.value - x.value)[0];
  const peak = s.reduce((m, p) => (p.nc > m.nc ? p : m), first);
  const cfr = end.tc > 0 ? (end.td / end.tc) * 100 : null;
  const crr = end.tc > 0 ? (end.tr / end.tc) * 100 : null;
  const wiActive = whatIf.casesPct || whatIf.deathsPct || whatIf.recoveredPct;
  return (
    <Panel title="Executive Summary" subtitle={`Dihitung otomatis dari data aktual · ${label}`}>
      <ul className="grid gap-2 text-sm md:grid-cols-2">
        <li>• Selama {fmtDate(first.key)} – {fmtDate(end.key)} ({s.length} hari data) tercatat <b>{fmt(cases)}</b> kasus baru, <b>{fmt(deaths)}</b> kematian baru, dan <b>{fmt(rec)}</b> kesembuhan baru.</li>
        <li>• Total kasus naik dari {fmt(first.tc)} menjadi <b>{fmt(end.tc)}</b>; kasus aktif pada akhir periode {fmt(end.ta)}.</li>
        <li>• Puncak kasus baru harian: <b>{fmt(peak.nc)}</b> pada {fmtDate(peak.key)}.</li>
        <li>• {trendPct == null ? "Perbandingan paruh periode tidak dapat dihitung (data paruh pertama nol/kurang)." : <>Rata-rata kasus baru harian paruh kedua periode <b>{fmtPct(trendPct)}</b> {trendPct >= 0 ? "lebih tinggi" : "lebih rendah"} dibanding paruh pertama ({fmt(a)} → {fmt(b)}/hari).</>}</li>
        <li>• Rasio kumulatif: fatalitas (CFR) <b>{fmtDec(cfr)}%</b>, kesembuhan <b>{fmtDec(crr)}%</b> dari total kasus.</li>
        {topP && <li>• Provinsi dengan total kasus tertinggi{filters.island ? ` di ${filters.island}` : ""}: <b>{topP.province}</b> ({fmt(topP.value)}); kasus baru terbanyak pada periode: <b>{topNew?.province}</b> ({fmt(topNew?.value)}).</li>}
        <li className="md:col-span-2">• What-If: {wiActive ? <>skenario aktif — kasus {fmtPct(whatIf.casesPct)}, kematian {fmtPct(whatIf.deathsPct)}, kesembuhan {fmtPct(whatIf.recoveredPct)} selama {whatIf.days} hari (lihat halaman What-If untuk hasil). Ilustrasi matematis, bukan prediksi.</> : "belum ada asumsi perubahan (semua slider 0%)."}</li>
      </ul>
    </Panel>
  );
}
