import { useMemo } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { DEFAULT_WHATIF, useData } from "./DataContext";
import { Empty, Panel, Seg } from "./Shell";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { addDays, fmt, fmtCompact, fmtDate, fmtPct, series, sumOf } from "@/lib/covid-data";
import { simulate } from "@/lib/whatif";

export function WhatIf() {
  const { ds, filters, whatIf: w, setWhatIf } = useData();
  const region = w.region || ds!.nationalName;
  const ref = useMemo(() => {
    const refStart = addDays(filters.end, -(w.days - 1));
    const s = series(ds!, [region], refStart < filters.start ? filters.start : refStart, filters.end);
    return s;
  }, [ds, region, filters, w.days]);
  const end = ref[ref.length - 1];
  const r = useMemo(() => {
    if (!end) return null;
    const n = ref.length;
    return simulate({
      avgCases: sumOf(ref, "nc") / n, avgDeaths: sumOf(ref, "nd") / n, avgRecovered: sumOf(ref, "nr") / n,
      startActive: end.ta, startTotalCases: end.tc, startTotalDeaths: end.td, startTotalRecovered: end.tr,
      casesPct: w.casesPct, deathsPct: w.deathsPct, recoveredPct: w.recoveredPct, days: w.days,
    });
  }, [ref, end, w]);

  const sliders = [
    { k: "casesPct", l: "Perubahan Kasus Baru" },
    { k: "deathsPct", l: "Perubahan Kematian Baru" },
    { k: "recoveredPct", l: "Perubahan Kesembuhan Baru" },
  ] as const;

  const rows = r ? [
    { l: "Kasus baru (selama simulasi)", b: r.baseline.cases, s: r.scenario.cases },
    { l: "Kematian baru (selama simulasi)", b: r.baseline.deaths, s: r.scenario.deaths },
    { l: "Kesembuhan baru (selama simulasi)", b: r.baseline.recovered, s: r.scenario.recovered },
    { l: "Total kasus di akhir simulasi", b: r.baseline.endTotalCases, s: r.scenario.endTotalCases },
    { l: "Estimasi kasus aktif di akhir simulasi*", b: r.baseline.endActive, s: r.scenario.endActive },
  ] : [];

  return (
    <div className="space-y-5">
      <Panel title="What-If Scenario Analysis" subtitle="Simulasi berbasis asumsi pengguna — ilustrasi matematis, bukan prediksi epidemiologis resmi."
        actions={<Button size="sm" variant="outline" onClick={() => setWhatIf({ ...DEFAULT_WHATIF, region: w.region })}><RotateCcw className="h-4 w-4" />Reset skenario</Button>}>
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-5">
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase text-muted-foreground">Wilayah simulasi
              <select className="field" value={w.region} onChange={(e) => setWhatIf({ region: e.target.value })}>
                <option value="">{ds!.nationalName} (nasional)</option>
                {ds!.provinces.map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
            <div className="flex items-center gap-3 text-xs font-semibold uppercase text-muted-foreground">Durasi simulasi
              <Seg value={w.days} onChange={(d) => setWhatIf({ days: d })} options={[{ v: 7, l: "7 hari" }, { v: 14, l: "14 hari" }, { v: 30, l: "30 hari" }]} />
            </div>
            {sliders.map((s) => (
              <div key={s.k}>
                <div className="mb-2 flex justify-between text-sm"><span className="font-medium">{s.l} (%)</span><span className="num font-bold text-primary">{fmtPct(w[s.k])}</span></div>
                <Slider min={-50} max={100} step={5} value={[w[s.k]]} onValueChange={([v]) => setWhatIf({ [s.k]: v })} aria-label={s.l} />
                <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>-50%</span><span>0%</span><span>+100%</span></div>
              </div>
            ))}
          </div>
          <div className="rounded-md bg-secondary p-4 text-sm leading-relaxed">
            <div className="font-semibold">Mekanisme perhitungan</div>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs">
              <li><b>Baseline</b> = rata-rata harian kasus/kematian/kesembuhan baru pada <b>{ref.length} hari terakhir</b> periode terpilih ({fmtDate(ref[0]?.key ?? "")} – {fmtDate(end?.key ?? "")}), wilayah {region}.</li>
              <li>Persentase perubahan diterapkan <b>sekali</b> ke rata-rata harian tersebut; nilai harian hasil penyesuaian dipakai <b>sama untuk setiap hari</b> simulasi (tanpa efek majemuk).</li>
              <li>Nilai simulasi = baseline harian × (1 + % perubahan) × {w.days} hari.</li>
              <li>*Estimasi kasus aktif = kasus aktif awal ({fmt(end?.ta)}) + Σ kasus baru − Σ kesembuhan − Σ kematian (neraca sederhana).</li>
            </ol>
            <p className="mt-3 flex gap-2 text-xs text-muted-foreground"><TriangleAlert className="h-4 w-4 shrink-0 text-orange" />Model tidak memperhitungkan penularan, perilaku masyarakat, kebijakan kesehatan, maupun faktor epidemiologi lain.</p>
          </div>
        </div>
      </Panel>

      {!r ? <Empty text="Tidak ada data baseline untuk wilayah/periode ini." /> : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {rows.slice(0, 3).map((x) => <Compare key={x.l} {...x} />)}
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <Panel title="Baseline vs Skenario — Estimasi Kasus Aktif" subtitle="Per hari simulasi (estimasi, bukan nilai aktual)">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={r.daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="day" tickFormatter={(d) => `H+${d}`} tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11 }} width={60} domain={["auto", "auto"]} />
                  <Tooltip labelFormatter={(d) => `Hari ke-${d}`} formatter={(v, n) => [fmt(Number(v)), String(n)]} />
                  <Legend />
                  <Line dataKey="baseActive" name="Baseline" stroke="var(--chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line dataKey="scenActive" name="Skenario" stroke="var(--chart-3)" strokeWidth={2} strokeDasharray="6 3" dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </Panel>
            <Panel title="Ringkasan Hasil & Asumsi">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2">Indikator</th><th className="text-right">Baseline</th><th className="text-right">Skenario</th><th className="text-right">Selisih</th><th className="text-right">%</th></tr></thead>
                <tbody className="num">
                  {rows.map((x) => (
                    <tr key={x.l} className="border-b"><td className="py-2">{x.l}</td><td className="text-right">{fmt(x.b)}</td><td className="text-right font-semibold">{fmt(x.s)}</td><td className="text-right">{x.s - x.b > 0 ? "+" : ""}{fmt(x.s - x.b)}</td><td className="text-right">{x.b ? fmtPct(((x.s - x.b) / Math.abs(x.b)) * 100) : "—"}</td></tr>
                  ))}
                </tbody>
              </table>
              <table className="mt-4 w-full text-xs">
                <tbody>
                  <tr className="border-b"><td className="py-1.5 text-muted-foreground">Wilayah</td><td>{region}</td></tr>
                  <tr className="border-b"><td className="py-1.5 text-muted-foreground">Periode referensi</td><td>{fmtDate(ref[0]!.key)} – {fmtDate(end!.key)} ({ref.length} hari)</td></tr>
                  <tr className="border-b"><td className="py-1.5 text-muted-foreground">Durasi simulasi</td><td>{w.days} hari setelah {fmtDate(end!.key)}</td></tr>
                  <tr><td className="py-1.5 text-muted-foreground">Asumsi perubahan</td><td>Kasus {fmtPct(w.casesPct)} · Kematian {fmtPct(w.deathsPct)} · Kesembuhan {fmtPct(w.recoveredPct)}</td></tr>
                </tbody>
              </table>
              <p className="mt-3 text-xs italic text-muted-foreground">
                Jika kasus baru diasumsikan berubah {fmtPct(w.casesPct)} dari baseline historis, simulasi menghasilkan {fmt(r.scenario.cases)} kasus baru dalam {w.days} hari (baseline {fmt(r.baseline.cases)}). Hasil ini ilustrasi matematis berdasarkan asumsi pengguna, bukan ramalan jumlah kasus aktual.
              </p>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function Compare({ l, b, s }: { l: string; b: number; s: number }) {
  const d = s - b;
  return (
    <div className="panel p-4">
      <div className="text-xs font-semibold uppercase text-muted-foreground">{l}</div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div><div className="text-[11px] text-muted-foreground">Baseline</div><div className="num text-lg font-bold">{fmt(b)}</div></div>
        <div className="text-right"><div className="text-[11px] text-muted-foreground">Skenario</div><div className="num text-2xl font-extrabold text-primary">{fmt(s)}</div></div>
      </div>
      <div className="num mt-2 border-t pt-2 text-xs">Selisih {d > 0 ? "+" : ""}{fmt(d)} ({b ? fmtPct((d / Math.abs(b)) * 100) : "—"})</div>
    </div>
  );
}
