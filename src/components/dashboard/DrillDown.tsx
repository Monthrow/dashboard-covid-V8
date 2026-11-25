import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useData } from "./DataContext";
import { Empty, Panel, Seg } from "./Shell";
import { Button } from "@/components/ui/button";
import { METRICS, bucketize, cityValues, citySeries, fmt, fmtCompact, fmtDate, islandValues, monthName, provinceValues, series, type MetricKey, type RegionMetric } from "@/lib/covid-data";
import { COLORS, useScope } from "./widgets";

export function TimeDrill() {
  const { ds, filters } = useData();
  const { locs, label } = useScope();
  const [year, setYear] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [metric, setMetric] = useState<MetricKey>(filters.indicator);
  const s = useMemo(() => series(ds!, locs, filters.start, filters.end), [ds, locs, filters]);
  const level = month ? "day" : year ? "month" : "year";
  const data = useMemo(() => {
    const sub = s.filter((p) => (!year || p.key.startsWith(year)) && (!month || p.key.startsWith(month)));
    return bucketize(sub, level);
  }, [s, year, month, level]);
  const drill = (id: string) => { if (level === "year") setYear(id); else if (level === "month") setMonth(id); };
  const back = () => (month ? setMonth(null) : setYear(null));
  const cum = METRICS[metric].cumulative;
  return (
    <Panel title="Drill-Down Waktu: Tahun → Bulan → Tanggal" subtitle={`${label} · ${cum ? "Nilai kumulatif = nilai tanggal terakhir di tiap periode" : "Nilai harian dijumlahkan per periode"}. Klik bar untuk turun level.`}
      actions={<>
        <select className="field" value={metric} onChange={(e) => setMetric(e.target.value as MetricKey)}>
          {(Object.keys(METRICS) as MetricKey[]).map((k) => <option key={k} value={k}>{METRICS[k].label}</option>)}
        </select>
        <Button size="sm" variant="outline" disabled={!year} onClick={back}><ChevronLeft className="h-4 w-4" />Kembali</Button>
        <Button size="sm" variant="outline" disabled={!year} onClick={() => { setYear(null); setMonth(null); }}><RotateCcw className="h-4 w-4" />Reset hierarki</Button>
      </>}>
      <div className="mb-3 flex items-center gap-1 text-sm">
        <button className="font-semibold text-primary" onClick={() => { setYear(null); setMonth(null); }}>Semua tahun</button>
        {year && <><ChevronRight className="h-4 w-4" /><button className="font-semibold text-primary" onClick={() => setMonth(null)}>{year}</button></>}
        {month && <><ChevronRight className="h-4 w-4" /><span className="font-semibold">{monthName(+month.slice(5, 7))} {month.slice(0, 4)}</span></>}
        <span className="ml-2 rounded bg-secondary px-2 py-0.5 text-xs">Level: {level === "year" ? "Tahun" : level === "month" ? "Bulan" : "Tanggal"}</span>
      </div>
      {data.length === 0 ? <Empty /> : (
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={level === "day" ? 2 : 0} />
            <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11 }} width={56} />
            <Tooltip formatter={(v) => [fmt(Number(v)), METRICS[metric].label]} labelFormatter={(l, p) => (p?.[0]?.payload?.lastKey ? `${l} (data s.d. ${fmtDate(p[0].payload.lastKey)})` : String(l))} cursor={{ fill: "var(--muted)" }} />
            <Bar dataKey={metric} fill={COLORS[metric]} radius={[4, 4, 0, 0]} cursor={level !== "day" ? "pointer" : "default"} isAnimationActive={false}
              onClick={(d) => drill((d as unknown as { id: string }).id)} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}

const REGION_LABEL: Record<RegionMetric, string> = { tc: "Total Kasus", nc: "Kasus Baru (periode)", td: "Total Kematian" };
const LEVEL_NAME = ["Indonesia", "Pulau", "Provinsi", "Kota/Kabupaten"];

interface Summary { title: string; date: string; tc?: number | undefined; td?: number | undefined; tr?: number | undefined; ta?: number | undefined; extra?: string | undefined; hint?: string | undefined }
function SummaryCard({ s }: { s: Summary }) {
  return (
    <div className="rounded-md bg-secondary p-4 text-sm">
      <div className="text-xs uppercase text-muted-foreground">{s.title} per {fmtDate(s.date)}</div>
      <div className="mt-2 space-y-1">
        <div>Total kasus: <b className="num">{fmt(s.tc)}</b></div>
        <div>Total kematian: <b className="num">{fmt(s.td)}</b></div>
        <div>Total sembuh: <b className="num">{fmt(s.tr)}</b></div>
        <div>Kasus aktif: <b className="num">{fmt(s.ta)}</b></div>
        {s.extra && <div className="pt-1 text-xs text-muted-foreground">{s.extra}</div>}
      </div>
      {s.hint && <p className="mt-3 text-xs text-muted-foreground">{s.hint}</p>}
    </div>
  );
}

function RegionBars({ data, metric, onPick, color }: { data: { name: string; value: number }[]; metric: RegionMetric; onPick?: (name: string) => void; color: string }) {
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(260, data.length * 26)}>
      <BarChart data={data} layout="vertical" margin={{ right: 30 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" tickFormatter={fmtCompact} tick={{ fontSize: 10 }} />
        <YAxis type="category" dataKey="name" width={230} tick={{ fontSize: 10 }} interval={0} />
        <Tooltip formatter={(v) => [fmt(Number(v)), REGION_LABEL[metric]]} cursor={{ fill: "var(--muted)" }} />
        <Bar dataKey="value" cursor={onPick ? "pointer" : "default"} isAnimationActive={false} radius={[0, 4, 4, 0]}
          onClick={(d) => onPick?.((d as unknown as { name: string }).name)}>
          {data.map((d) => <Cell key={d.name} fill={color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RegionDrill() {
  const { ds, filters } = useData();
  const d = ds!;
  const [island, setIsland] = useState<string | null>(null);
  const [prov, setProv] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [metric, setMetric] = useState<RegionMetric>("tc");
  const level = city ? 3 : prov ? 2 : island ? 1 : 0;
  const range = { start: filters.start, end: filters.end };
  const sortDesc = <T extends { value: number }>(a: T[]) => [...a].sort((x, y) => y.value - x.value);

  const national = useMemo(() => series(d, [d.nationalName], filters.start, filters.end).at(-1), [d, filters]);
  const islands = useMemo(() => sortDesc(islandValues(d, filters, metric).map((x) => ({ name: x.island, value: x.value }))), [d, filters, metric]);
  const islandProvs = useMemo(() => d.provinces.filter((p) => d.byLocation.get(p)?.[0]?.island === island), [d, island]);
  const islandEnd = useMemo(() => (island ? series(d, islandProvs, filters.start, filters.end).at(-1) : undefined), [d, island, islandProvs, filters]);
  const provs = useMemo(() => (island ? sortDesc(provinceValues(d, { ...filters, island }, metric).map((p) => ({ name: p.province, value: p.value }))) : []), [d, filters, island, metric]);
  const provEnd = useMemo(() => (prov ? series(d, [prov], filters.start, filters.end).at(-1) : undefined), [d, prov, filters]);
  const cities = useMemo(() => (prov ? cityValues(d, prov, range, metric) : []), [d, prov, filters, metric]); // eslint-disable-line react-hooks/exhaustive-deps
  const cityBars = useMemo(() => sortDesc(cities.map((c) => ({ name: c.city, value: c.value }))), [cities]);
  const cityNow = cities.find((c) => c.city === city);
  const cityRows = useMemo(() => (prov && city ? citySeries(d, prov, city, filters.start, filters.end) : []), [d, prov, city, filters]);
  const lineKey = metric === "nc" ? "tc" : metric;

  const goTo = (lvl: number) => { if (lvl < 1) setIsland(null); if (lvl < 2) setProv(null); if (lvl < 3) setCity(null); };
  const crumbs = [d.nationalName, island, prov, city].slice(0, level + 1);

  return (
    <Panel title="Drill-Down Wilayah: Indonesia → Pulau → Provinsi → Kota"
      subtitle={`${d.cityMode ? "Level kota/kabupaten memakai kolom City or Regency dari dataset." : "File ini tidak berisi kolom kota/kabupaten, sehingga level kota kosong."} Klik bar untuk turun level.`}
      actions={<>
        <Seg value={metric} onChange={setMetric} options={(Object.keys(REGION_LABEL) as RegionMetric[]).map((k) => ({ v: k, l: REGION_LABEL[k] }))} />
        {level > 0 && <Button size="sm" variant="outline" onClick={() => goTo(level - 1)}><ChevronLeft className="h-4 w-4" />Kembali</Button>}
        {level > 0 && <Button size="sm" variant="outline" onClick={() => goTo(0)}><RotateCcw className="h-4 w-4" />Reset</Button>}
      </>}>
      <div className="mb-3 flex flex-wrap items-center gap-1 text-sm">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-4 w-4" />}
            {i < level
              ? <button className="font-semibold text-primary" onClick={() => goTo(i)}>{c}</button>
              : <span className="font-semibold">{c}</span>}
          </span>
        ))}
        <span className="ml-2 rounded bg-secondary px-2 py-0.5 text-xs">Level {level + 1}: {LEVEL_NAME[level]}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {level === 0 && <>
          <SummaryCard s={{ title: `${d.nationalName} (nasional)`, date: national?.key ?? "", ...national, hint: "Klik pulau untuk melihat provinsinya." }} />
          <div className="lg:col-span-2"><RegionBars data={islands} metric={metric} color="var(--primary)" onPick={setIsland} /></div>
        </>}
        {level === 1 && <>
          <SummaryCard s={{ title: `Pulau ${island}`, date: islandEnd?.key ?? "", ...islandEnd, extra: `${islandProvs.length} provinsi · ${national?.tc && islandEnd ? ((islandEnd.tc / national.tc) * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 }) : "—"}% kasus nasional`, hint: "Klik provinsi untuk melihat kota/kabupatennya." }} />
          <div className="lg:col-span-2"><RegionBars data={provs} metric={metric} color="var(--teal)" onPick={setProv} /></div>
        </>}
        {level === 2 && <>
          <SummaryCard s={{ title: prov!, date: provEnd?.key ?? "", ...provEnd, extra: `${cities.length} kota/kabupaten dalam dataset`, hint: d.cityMode ? "Klik kota/kabupaten untuk melihat detailnya." : undefined }} />
          <div className="lg:col-span-2">
            {d.cityMode ? <RegionBars data={cityBars} metric={metric} color="var(--chart-3)" onPick={setCity} />
              : <Empty />}
          </div>
        </>}
        {level === 3 && (cityNow ? <>
          <SummaryCard s={{ title: `${city} (${prov})`, date: cityNow.date, tc: cityNow.tc, td: cityNow.td, tr: cityNow.tr, ta: cityNow.ta,
            extra: `Populasi ${fmt(cityNow.pop)} jiwa · ${(cityNow.share * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}% populasi kota dalam provinsi${metric === "nc" ? ` · kasus baru periode: ${fmt(cityNow.value)}` : ""}` }} />
          <div className="lg:col-span-2">
            {cityRows.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={cityRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="key" tickFormatter={(k) => fmtDate(k)} tick={{ fontSize: 10 }} minTickGap={40} />
                  <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11 }} width={56} />
                  <Tooltip labelFormatter={(k) => fmtDate(String(k))} formatter={(v) => [fmt(Number(v)), METRICS[lineKey].label]} />
                  <Line dataKey={lineKey} stroke={COLORS[lineKey]} dot={false} strokeWidth={2} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
            <p className="mt-1 text-xs text-muted-foreground">{METRICS[lineKey].label} kota dari tanggal-tanggal saat kota ini tercatat di dataset.</p>
          </div>
        </> : <div className="lg:col-span-3"><Empty /></div>)}
      </div>
    </Panel>
  );
}
