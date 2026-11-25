import { useMemo, useState } from "react";
import { ArrowDownUp, Download } from "lucide-react";
import { useData } from "./DataContext";
import { Panel } from "./Shell";
import { Button } from "@/components/ui/button";
import { fmt, fmtDate, fmtDec, rowToExport, scopeLocations, toCsv, type Row } from "@/lib/covid-data";
import { downloadCsv } from "@/lib/export";

const COLS: { k: keyof Row; l: string; n?: boolean }[] = [
  { k: "key", l: "Tanggal" }, { k: "location", l: "Lokasi" }, { k: "level", l: "Level" }, { k: "island", l: "Pulau" },
  { k: "nc", l: "Kasus Baru", n: true }, { k: "nd", l: "Kematian Baru", n: true }, { k: "nr", l: "Sembuh Baru", n: true },
  { k: "tc", l: "Total Kasus", n: true }, { k: "td", l: "Total Kematian", n: true }, { k: "tr", l: "Total Sembuh", n: true }, { k: "ta", l: "Kasus Aktif", n: true },
  { k: "cfr", l: "CFR", n: true },
];

export function DataInfo() {
  const { ds } = useData();
  const d = ds!;
  const lat = d.rows.filter((r) => r.lat == null).length;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="Sumber & Kualitas Data">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">File sumber</dt><dd className="font-medium">{d.fileName}</dd>
          <dt className="text-muted-foreground">Baris dibaca</dt><dd className="num">{fmt(d.rawRowCount)} baris · {d.columns.length} kolom</dd>
          <dt className="text-muted-foreground">Baris valid</dt><dd className="num">{fmt(d.rows.length)}</dd>
          <dt className="text-muted-foreground">Baris tidak valid</dt><dd className="num">{fmt(d.invalidRows)} {Object.entries(d.invalidReasons).map(([k, v]) => `(${k}: ${fmt(v)})`).join(" ")}</dd>
          <dt className="text-muted-foreground">Rentang tanggal</dt><dd>{fmtDate(d.minKey)} – {fmtDate(d.maxKey)} ({fmt(d.dates.length)} tanggal)</dd>
          <dt className="text-muted-foreground">Tingkat wilayah</dt><dd>{d.levels.join(", ")} · {d.provinces.length} provinsi · {d.islands.length} pulau{d.cityMode ? ` · ${[...d.cities.values()].reduce((a, c) => a + c.length, 0)} kota/kabupaten` : ""}</dd>
          <dt className="text-muted-foreground">Koordinat kosong</dt><dd className="num">{fmt(lat)} baris (tidak ditampilkan di peta)</dd>
        </dl>
      </Panel>
      <Panel title="Metode & Keterbatasan">
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          <li><b>Tanggal:</b> kolom Date berisi campuran teks “M/D/YYYY” dan tanggal Excel yang hari/bulannya tertukar; keduanya dinormalisasi ke tanggal yang benar.</li>
          <li><b>Indikator kumulatif</b> (Total …): diambil pada tanggal akhir, tidak pernah dijumlahkan antartanggal.</li>
          <li><b>Indikator harian</b> (New …): dijumlahkan dalam rentang periode.</li>
          <li><b>Rasio</b> (CFR, tingkat kesembuhan): dihitung ulang dari pembilang/penyebut (Total Deaths ÷ Total Cases), bukan dijumlahkan.</li>
          <li><b>Tanpa penghitungan ganda:</b> baris nasional (Country) dan provinsi tidak pernah dicampur. Agregasi pulau = penjumlahan provinsi pada tanggal yang sama, hanya untuk tanggal saat semua provinsi melapor.</li>
          <li><b>Missing values:</b> kolom opsional kosong (mis. koordinat, Growth Factor) dibiarkan kosong, bukan diisi nol; baris tanpa nilai utama dikeluarkan dan dihitung sebagai tidak valid.</li>
          {ds!.cityMode ? (
            <li><b>Kota/kabupaten:</b> tiap baris provinsi mencatat bagian satu kota sesuai porsi populasinya. Nilai provinsi dihitung ulang (nilai ÷ porsi populasi kota), sedangkan level kota memakai baris kota itu sendiri — nilai kumulatif dari tanggal terakhir kota tersebut tercatat.</li>
          ) : (
            <li><b>Keterbatasan:</b> data kabupaten/kota tidak tersedia di file ini.</li>
          )}
          <li><b>Catatan:</b> nilai Total Active Cases di awal data dapat negatif karena koreksi pelaporan sumber.</li>
          <li><b>Aktual vs simulasi:</b> semua KPI & grafik berasal dari data aktual; halaman What-If menampilkan estimasi berbasis asumsi.</li>
        </ul>
      </Panel>
      <DataTable />
    </div>
  );
}

function DataTable() {
  const { ds, filters } = useData();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ k: keyof Row; desc: boolean }>({ k: "key", desc: true });
  const [page, setPage] = useState(0);
  const PER = 25;
  const rows = useMemo(() => {
    const locs = new Set(scopeLocations(ds!, filters));
    const ql = q.toLowerCase();
    const r = ds!.rows.filter((x) => locs.has(x.location) && x.key >= filters.start && x.key <= filters.end && (!ql || x.location.toLowerCase().includes(ql) || fmtDate(x.key).includes(ql)));
    const dir = sort.desc ? -1 : 1;
    return r.sort((a, b) => { const av = a[sort.k] ?? -Infinity, bv = b[sort.k] ?? -Infinity; return (av < bv ? -1 : av > bv ? 1 : 0) * dir; });
  }, [ds, filters, q, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / PER));
  const p = Math.min(page, pages - 1);
  return (
    <Panel className="lg:col-span-2" title="Tabel Data" subtitle={`${fmt(rows.length)} baris sesuai filter aktif`}
      actions={<>
        <input className="field" placeholder="Cari lokasi / tanggal…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        <Button size="sm" variant="outline" onClick={() => downloadCsv(toCsv(rows.map(rowToExport)), "covid19-tabel.csv")} disabled={!rows.length}><Download className="h-4 w-4" />Export CSV</Button>
      </>}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-xs">
          <thead><tr className="border-b bg-muted text-left">
            {COLS.map((c) => (
              <th key={c.k} className={`px-2 py-2 ${c.n ? "text-right" : ""}`}>
                <button className="inline-flex items-center gap-1 font-semibold" onClick={() => setSort((s) => ({ k: c.k, desc: s.k === c.k ? !s.desc : true }))}>
                  {c.l}<ArrowDownUp className={`h-3 w-3 ${sort.k === c.k ? "text-primary" : "opacity-40"}`} />
                </button>
              </th>
            ))}
          </tr></thead>
          <tbody className="num">
            {rows.slice(p * PER, p * PER + PER).map((r) => (
              <tr key={r.location + r.key} className="border-b hover:bg-muted/50">
                {COLS.map((c) => {
                  const v = r[c.k];
                  return <td key={c.k} className={`px-2 py-1.5 ${c.n ? "text-right" : ""}`}>{c.k === "key" ? fmtDate(r.key) : c.k === "cfr" ? (v == null ? "—" : `${fmtDec((v as number) * 100)}%`) : c.n ? fmt(v as number) : (v as string) ?? "—"}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 text-xs">
        <Button size="sm" variant="outline" disabled={p === 0} onClick={() => setPage(p - 1)}>Sebelumnya</Button>
        <span>Halaman {p + 1} / {pages}</span>
        <Button size="sm" variant="outline" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>Berikutnya</Button>
      </div>
    </Panel>
  );
}
