import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type DragEvent, type ReactNode } from "react";
import {
  ArrowLeft, CalendarRange, CheckCircle2, Columns3, Database, TableProperties, FileSpreadsheet, History, LayoutDashboard, Loader2, RotateCcw, Rows3, Sparkles, Upload, Wand2, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AppLogo } from "@/components/brand/AppLogo";
import { Blobs, VirusGlyph } from "@/components/brand/Decor";
import heroUrl from "@/assets/covid-login-illustration.jpg";
const heroArt = heroUrl;
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { fmt, fmtDate, keyOf, parseDate } from "@/lib/covid-data";
import { inferColumns, transformRows, type EtlRecord, type EtlReport, type EtlStats } from "@/lib/etl";
import { fetchMetadata, loadRecords, sha256Hex, type LoadResult } from "@/lib/etl-data";
import { API_BASE_URL } from "@/lib/api-client";
import { AddDataDialog } from "@/components/etl/AddDataDialog";

interface Extracted {
  fileName: string; fileSize: number; hash: string;
  rows: Record<string, unknown>[]; columns: string[];
  cols: ReturnType<typeof inferColumns>;
  periodStart: string | null; periodEnd: string | null;
}

const parseInWorker = (buf: ArrayBuffer) =>
  new Promise<{ rows: Record<string, unknown>[]; columns: string[] }>((resolve, reject) => {
    const w = new Worker(new URL("../../lib/parse.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e) => { w.terminate(); e.data.ok ? resolve({ rows: e.data.rows, columns: e.data.columns }) : reject(new Error(e.data.error)); };
    w.onerror = () => { w.terminate(); reject(new Error("File tidak dapat dibaca.")); };
    w.postMessage(buf, [buf]);
  });

const previewDate = (v: unknown) => { const t = parseDate(v); return t == null ? `${String(v)} (tidak valid)` : fmtDate(keyOf(t)); };

const STAGES = [
  { name: "Extract", icon: Upload, tone: "tone-blue" },
  { name: "Transform", icon: Wand2, tone: "tone-teal" },
  { name: "Load", icon: Database, tone: "tone-orange" },
];

const sizeLabel = (b: number) => (b > 1e6 ? `${(b / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 })} MB` : `${Math.round(b / 1e3)} KB`);

export function EtlPage() {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<null | "extract" | "transform" | "load">(null);
  const [ex, setEx] = useState<Extracted | null>(null);
  const [tf, setTf] = useState<{ records: EtlRecord[]; report: EtlReport } | null>(null);
  const [load, setLoad] = useState<LoadResult | null>(null);
  const [loadPct, setLoadPct] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const meta = useQuery({ queryKey: ["etl", "meta"], queryFn: () => fetchMetadata() });
  const runs = { isLoading: meta.isLoading, data: meta.data?.history };
  const active = meta.data?.dataset ?? null;
  const [addOpen, setAddOpen] = useState(false);
  const canAdd = !!active && !!meta.data?.columns.length;

  const resetAll = () => { setEx(null); setTf(null); setLoad(null); setErr(null); setLoadPct(0); if (input.current) input.current.value = ""; };

  async function extract(file: File) {
    resetAll();
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { setErr("Format tidak didukung. Gunakan file .xlsx, .xls, atau .csv."); return; }
    if (file.size > 60e6) { setErr("Ukuran file terlalu besar (maksimal 60 MB)."); return; }
    setBusy("extract");
    try {
      const buf = await file.arrayBuffer();
      const hash = await sha256Hex(buf);
      const { rows, columns } = await parseInWorker(buf);
      if (!rows.length) throw new Error("File tidak berisi baris data.");
      let min: string | null = null, max: string | null = null;
      for (const r of rows) { const t = parseDate(r["Date"]); if (t == null) continue; const k = keyOf(t); if (!min || k < min) min = k; if (!max || k > max) max = k; }
      setEx({ fileName: file.name, fileSize: file.size, hash, rows, columns, cols: inferColumns(rows, columns), periodStart: min, periodEnd: max });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  async function transform() {
    if (!ex) return;
    setBusy("transform"); setErr(null); setLoad(null);
    await new Promise((r) => setTimeout(r, 30));
    try { setTf(transformRows(ex.rows, ex.columns)); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  async function doLoad() {
    if (!ex || !tf) return;
    setBusy("load"); setErr(null); setLoadPct(0);
    try {
      const r = await loadRecords({ fileName: ex.fileName, fileSize: ex.fileSize, fileHash: ex.hash, columnCount: ex.columns.length }, tf.records, tf.report, (d, t) => setLoadPct(Math.round((d / t) * 100)));
      setLoad(r);
      r.status === "success" ? toast.success("Load selesai — dashboard memakai dataset terbaru.") : toast.info("Dataset sudah aktif, tidak dimuat ulang.");
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErr(`Load gagal: ${m}`); toast.error("Load gagal.");
    } finally {
      setBusy(null);
      qc.invalidateQueries({ queryKey: ["etl"] });
    }
  }

  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) extract(f); };
  const stage = load ? 3 : tf ? 2 : ex ? 1 : 0;

  return (
    <div className="bg-mesh relative isolate min-h-screen font-sans">
      <Blobs fixed />
      <header className="glass sticky top-0 z-30 rounded-none border-x-0 border-t-0">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 md:px-6">
          <AppLogo subtitle="ETL Process" />
          <div className="ml-auto flex gap-2">
            <Button asChild variant="outline" size="sm" className="bg-card/70"><Link to="/"><ArrowLeft className="h-4 w-4" />Beranda</Link></Button>
            <Button asChild size="sm" className="btn-gradient"><Link to="/dashboard"><LayoutDashboard className="h-4 w-4" />Dashboard</Link></Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-6">
        <section className="bg-header hero-rings relative isolate overflow-hidden rounded-3xl p-6 text-primary-foreground shadow-card md:p-8">
          <img src={heroArt} alt="" aria-hidden="true" width={1024} height={1024} className="hero-art absolute inset-y-0 right-0 -z-10 hidden h-full w-1/2 object-cover opacity-45 md:block" />
          <VirusGlyph className="spin-slow pointer-events-none absolute -bottom-8 right-1/4 -z-10 h-28 w-28 text-primary-foreground/10" />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-foreground/20 bg-primary-foreground/15 px-3 py-1 text-xs font-semibold backdrop-blur-sm"><Database className="h-3.5 w-3.5" />Pengelolaan Dataset</span>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight">ETL Process</h1>
          <p className="mt-1 max-w-3xl text-sm opacity-90">Ambil dataset (Extract), bersihkan &amp; ubah (Transform), lalu simpan sebagai sumber data dashboard (Load). Dataset utama: <b>covid_19_indonesia_time_series_all.xlsx</b> atau versi bersihnya.</p>
          <ol className="mt-6 grid gap-3 sm:grid-cols-3">
            {STAGES.map((s, i) => {
              const done = stage > i, current = stage === i;
              return (
                <li key={s.name} className={`${s.tone} flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-sm backdrop-blur-md transition-all ${done ? "border-transparent bg-card text-foreground shadow-card" : current ? "border-primary-foreground/50 bg-primary-foreground/20" : "border-primary-foreground/15 bg-primary-foreground/10"}`}>
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${done ? "tone-tile" : "bg-primary-foreground/15"}`}>{done ? <CheckCircle2 className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}</span>
                  <div className="leading-tight"><div className="font-bold">{i + 1}. {s.name}</div><div className={`text-xs ${done ? "text-muted-foreground" : "opacity-80"}`}>{done ? "Selesai" : current ? "Sedang berjalan" : "Menunggu"}</div></div>
                </li>
              );
            })}
          </ol>
        </section>

        {meta.isError && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-orange/30 bg-orange-soft p-4 text-sm">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-orange" />
            <div><b>Database MySQL belum terhubung.</b> {meta.error instanceof Error ? meta.error.message : ""} <Button variant="link" className="h-auto p-0 text-sm" onClick={() => meta.refetch()}>Coba lagi</Button></div>
          </div>
        )}
        {err && <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{err}</div>}

        {/* EXTRACT */}
        <Step n={1} tone="tone-blue" icon={Upload} title="Extract" subtitle="Unggah file Excel/CSV, lihat pratinjau, jumlah baris & kolom, periode, serta tipe data tiap kolom.">
          <div data-over={over} className="etl-drop tone-blue grid cursor-pointer place-items-center rounded-2xl px-6 py-12 text-center"
            onClick={() => input.current?.click()} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}
            role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}>
            <span className="tone-tile grid h-16 w-16 place-items-center rounded-2xl">{busy === "extract" ? <Loader2 className="h-8 w-8 animate-spin" /> : <Upload className="h-8 w-8" />}</span>
            <p className="mt-4 font-bold">{busy === "extract" ? "Membaca file…" : "Tarik & lepas file di sini, atau klik untuk memilih"}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">{[".xlsx", ".xls", ".csv", "maks. 60 MB"].map((t) => <span key={t} className="rounded-full bg-card/80 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">{t}</span>)}</div>
            <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && extract(e.target.files[0])} />
          </div>

          {ex && (
            <div className="mt-5 space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat tone="tone-blue" icon={FileSpreadsheet} label="Nama file" value={ex.fileName} sub={sizeLabel(ex.fileSize)} />
                <Stat tone="tone-teal" icon={Rows3} label="Jumlah baris" value={fmt(ex.rows.length)} />
                <Stat tone="tone-orange" icon={Columns3} label="Jumlah kolom" value={fmt(ex.columns.length)} />
                <Stat wrap tone="tone-green" icon={CalendarRange} label="Periode data" value={`${fmtDate(ex.periodStart ?? "")} – ${fmtDate(ex.periodEnd ?? "")}`} />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-bold">Identifikasi kolom &amp; tipe data</h3>
                <div className="flex flex-wrap gap-2">
                  {ex.cols.map((c) => (
                    <span key={c.name} className="rounded-lg border bg-card px-2.5 py-1 text-xs">
                      <b>{c.name}</b> · <span className="text-primary">{c.type}</span>{c.missing > 0 && <span className="text-muted-foreground"> · {fmt(c.missing)} kosong</span>}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-bold">Pratinjau 10 baris pertama</h3>
                <div className="max-h-80 overflow-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-secondary text-secondary-foreground"><tr>{ex.columns.map((c) => <th key={c} className="whitespace-nowrap px-2 py-1.5 text-left font-semibold">{c}</th>)}</tr></thead>
                    <tbody>
                      {ex.rows.slice(0, 10).map((r, i) => (
                        <tr key={i} className="border-t">{ex.columns.map((c) => <td key={c} className="num whitespace-nowrap px-2 py-1">{r[c] == null ? <span className="text-muted-foreground">—</span> : c === "Date" ? previewDate(r[c]) : String(r[c])}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <Button onClick={transform} disabled={busy !== null} size="lg" className="tone-teal tone-btn">{busy === "transform" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Jalankan Transform</Button>
            </div>
          )}
        </Step>

        {/* TRANSFORM */}
        <Step n={2} tone="tone-teal" icon={Wand2} title="Transform" subtitle="Validasi, pembersihan missing values, duplikasi, konversi tipe, tanggal, koordinat, dan pemisahan data nasional/provinsi." disabled={!tf}>
          {tf ? (
            <div className="space-y-5">
              <CompareTable before={tf.report.before} after={tf.report.after} />
              <div>
                <h3 className="mb-2 text-sm font-bold">Langkah transformasi</h3>
                <ul className="grid gap-2 md:grid-cols-2">
                  {tf.report.steps.map((s) => (
                    <li key={s.name} className="lift flex items-start gap-2 rounded-lg border bg-card p-3 text-sm">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      <div className="min-w-0 flex-1"><div className="font-semibold">{s.name}</div><div className="text-xs text-muted-foreground">{s.detail}</div></div>
                      <span className="num rounded bg-secondary px-2 py-0.5 text-xs font-semibold">{fmt(s.count)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <Button onClick={doLoad} disabled={busy !== null || !!load} size="lg" className="tone-orange tone-btn">{busy === "load" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}Load ke MySQL</Button>
            </div>
          ) : <p className="text-sm text-muted-foreground">Selesaikan tahap Extract lalu klik “Jalankan Transform”.</p>}
        </Step>

        {/* LOAD */}
        <Step n={3} tone="tone-orange" icon={Database} title="Load" subtitle="Validasi ulang di server lalu simpan ke database MySQL (tabel covid_records) sebagai sumber data dashboard. Baris yang sudah ada tidak diduplikasi." disabled={!tf}>
          {busy === "load" && (
            <div className="space-y-2"><Progress value={loadPct} /><p className="text-sm text-muted-foreground">Menyimpan data… {loadPct}%</p></div>
          )}
          {load && (
            <div className={`flex flex-wrap items-center gap-4 rounded-xl border p-4 ${load.status === "success" ? "border-success/30 bg-success/10" : "border-orange/30 bg-orange-soft"}`}>
              <CheckCircle2 className={`h-8 w-8 ${load.status === "success" ? "text-success" : "text-orange"}`} />
              <div className="min-w-0 flex-1">
                <div className="font-bold">{load.status === "success" ? "Load berhasil" : "Dataset sudah aktif"}</div>
                <div className="text-sm text-muted-foreground">{load.message}</div>
              </div>
              <div className="flex gap-2">
                <Button asChild className="btn-gradient"><Link to="/dashboard"><LayoutDashboard className="h-4 w-4" />Buka Dashboard</Link></Button>
                <Button className="tone-teal tone-btn" onClick={() => setAddOpen(true)} disabled={!canAdd}><TableProperties className="h-4 w-4" />Tambah Data</Button>
                <Button variant="outline" onClick={resetAll}><RotateCcw className="h-4 w-4" />ETL baru</Button>
              </div>
            </div>
          )}
          {!load && busy !== "load" && <p className="text-sm text-muted-foreground">{tf ? "Klik “Load ke MySQL” untuk menyimpan." : "Menunggu tahap Transform."}</p>}
          {!load && busy !== "load" && active && (
            <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4">
              <Database className="h-7 w-7 text-orange" />
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-bold">Dataset aktif di MySQL</div>
                <div className="text-muted-foreground">{active.file_name} · {fmt(active.rows_loaded)} baris · {fmtDate(active.period_start ?? "")} – {fmtDate(active.period_end ?? "")}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild className="btn-gradient"><Link to="/dashboard"><LayoutDashboard className="h-4 w-4" />Buka Dashboard</Link></Button>
                <Button className="tone-teal tone-btn" onClick={() => setAddOpen(true)} disabled={!canAdd}><TableProperties className="h-4 w-4" />Tambah Data</Button>
              </div>
            </div>
          )}
        </Step>

        {/* HISTORY */}
        <section className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2">
            <span className="tone-blue tone-chip grid h-8 w-8 place-items-center rounded-lg"><History className="h-4 w-4" /></span>
            <h2 className="text-gradient text-base font-extrabold">Riwayat ETL</h2>
          </div>
          <div className="mt-3 overflow-x-auto">
            {runs.isLoading ? <p className="text-sm text-muted-foreground">Memuat riwayat…</p> : !runs.data?.length ? <p className="text-sm text-muted-foreground">Belum ada proses ETL.</p> : (
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="py-2 pr-3">Waktu</th><th className="pr-3">File</th><th className="pr-3">Status</th><th className="pr-3 text-right">Baris dibaca</th><th className="pr-3 text-right">Disimpan</th><th className="pr-3">Periode</th></tr></thead>
                <tbody>
                  {runs.data.map((r) => (
                    <tr key={r.id} className="border-b transition-colors last:border-0 hover:bg-secondary/50">
                      <td className="whitespace-nowrap py-2 pr-3">{new Date(r.created_at).toLocaleString("id-ID")}</td>
                      <td className="max-w-56 truncate pr-3" title={r.file_name}>{r.file_name}</td>
                      <td className="pr-3"><StatusBadge status={r.status} active={r.is_active} /></td>
                      <td className="num pr-3 text-right">{fmt(r.rows_read)}</td>
                      <td className="num pr-3 text-right">{fmt(r.rows_loaded)}</td>
                      <td className="whitespace-nowrap pr-3">{r.period_start ? `${fmtDate(r.period_start)} – ${fmtDate(r.period_end ?? "")}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
        <p className="text-center text-xs text-muted-foreground">Server API: {API_BASE_URL}</p>
      </main>
      {canAdd && (
        <AddDataDialog open={addOpen} onOpenChange={setAddOpen} columns={meta.data!.columns} datasetName={active!.dataset_name ?? active!.file_name}
          onSaved={() => qc.invalidateQueries({ queryKey: ["etl"] })} />
      )}
    </div>
  );
}

function Step({ n, title, subtitle, disabled, tone, icon: Icon, children }: { n: number; title: string; subtitle: string; disabled?: boolean; tone: string; icon: typeof Upload; children: ReactNode }) {
  return (
    <section className={`${tone} panel tone-card tone-wash rounded-2xl p-5 md:p-6 ${disabled ? "opacity-75" : ""}`}>
      <Icon aria-hidden="true" className="tone-text pointer-events-none absolute -right-4 -top-4 h-28 w-28 opacity-[0.06]" />
      <div className="mb-5 flex items-start gap-3">
        <span className="tone-tile grid h-11 w-11 shrink-0 place-items-center rounded-xl text-base font-extrabold">{n}</span>
        <div><h2 className="tone-text text-xl font-extrabold">{title}</h2><p className="text-xs text-muted-foreground">{subtitle}</p></div>
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, sub, icon: Icon, tone, wrap }: { label: string; value: string; sub?: string; icon: typeof FileSpreadsheet; tone: string; wrap?: boolean }) {
  return (
    <div className={`${tone} tone-wash lift flex items-start gap-3 rounded-xl border bg-card p-3`}>
      <span className="tone-tile grid h-9 w-9 shrink-0 place-items-center rounded-lg"><Icon className="h-4 w-4" /></span>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`num mt-0.5 font-bold ${wrap ? "leading-snug" : "truncate"}`} title={value}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}

function CompareTable({ before, after }: { before: EtlStats; after: EtlStats }) {
  const rows: [string, string, string][] = [
    ["Jumlah baris", fmt(before.rows), fmt(after.rows)],
    ["Sel kosong (kolom utama)", fmt(before.missingCells), fmt(after.missingCells)],
    ["Baris duplikat", fmt(before.duplicates), fmt(after.duplicates)],
    ["Tanggal tidak valid", fmt(before.invalidDates), fmt(after.invalidDates)],
    ["Koordinat tidak valid", fmt(before.invalidCoords), fmt(after.invalidCoords)],
    ["Baris nasional / provinsi", `${fmt(before.nationalRows)} / ${fmt(before.provinceRows)}`, `${fmt(after.nationalRows)} / ${fmt(after.provinceRows)}`],
    ["Provinsi · kota/kabupaten", `${before.provinces} · ${before.cities}`, `${after.provinces} · ${after.cities}`],
    ["Periode", `${fmtDate(before.periodStart ?? "")} – ${fmtDate(before.periodEnd ?? "")}`, `${fmtDate(after.periodStart ?? "")} – ${fmtDate(after.periodEnd ?? "")}`],
  ];
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-secondary text-left text-xs uppercase"><tr><th className="px-3 py-2">Kondisi data</th><th className="px-3 py-2">Sebelum</th><th className="px-3 py-2">Sesudah</th></tr></thead>
        <tbody>{rows.map(([k, b, a]) => <tr key={k} className="border-t"><td className="px-3 py-1.5 text-muted-foreground">{k}</td><td className="num px-3 py-1.5">{b}</td><td className="num px-3 py-1.5 font-semibold">{a}</td></tr>)}</tbody>
      </table>
      <p className="border-t px-3 py-2 text-xs text-muted-foreground">Sel kosong sesudah transform = koordinat/populasi opsional yang sengaja dibiarkan kosong (tidak diisi nol).</p>
    </div>
  );
}

function StatusBadge({ status, active }: { status: string; active: boolean }) {
  const map: Record<string, [string, string]> = {
    success: ["Berhasil", "bg-success/15 text-success"], skipped: ["Dilewati (duplikat)", "bg-orange-soft text-foreground"],
    failed: ["Gagal", "bg-destructive/15 text-destructive"], loading: ["Diproses", "bg-secondary text-secondary-foreground"],
  };
  const [l, c] = map[status] ?? [status, "bg-muted"];
  return <span className="flex items-center gap-1.5"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c}`}>{l}</span>{active && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">Aktif</span>}</span>;
}
