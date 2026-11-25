import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  Activity, BarChart3, Database, Download, FileUp, Filter, Image as ImageIcon, LayoutDashboard, Layers, Loader2, Map as MapIcon,
  Home, Menu, RotateCcw, SlidersHorizontal, TrendingUp, TriangleAlert, X,
} from "lucide-react";
import { useData } from "./DataContext";
import { Button } from "@/components/ui/button";
import { METRICS, fmt, fmtDate, rowToExport, scopeLabel, scopeLocations, toCsv, type MetricKey } from "@/lib/covid-data";
import { downloadCsv, exportCharts } from "@/lib/export";
import { toast } from "sonner";
import covidBackgroundUrl from "@/assets/covid-background.jpg";
const covidBackground = covidBackgroundUrl;

const NAV = [
  { to: "/dashboard", label: "Overview Dashboard", icon: LayoutDashboard },
  { to: "/dashboard/trend", label: "Trend Analysis", icon: TrendingUp },
  { to: "/dashboard/provinces", label: "Provincial Comparison", icon: BarChart3 },
  { to: "/dashboard/map", label: "Geographic Distribution", icon: MapIcon },
  { to: "/dashboard/drilldown", label: "Drill-Down Explorer", icon: Layers },
  { to: "/dashboard/whatif", label: "What-If Analysis", icon: SlidersHorizontal },
  { to: "/dashboard/data", label: "Data Information", icon: Database },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const { status, ds, run, progress, error } = useData();
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-screen bg-background font-sans text-foreground">
      <aside className={`fixed inset-y-0 left-0 z-[1100] w-64 transform bg-sidebar text-sidebar-foreground transition-transform lg:static lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center gap-2 border-b border-sidebar-border px-5 py-5">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground"><Activity className="h-5 w-5" /></div>
          <div className="leading-tight">
            <div className="text-sm font-bold text-sidebar-accent-foreground">COVID-19 ID</div>
            <div className="text-[11px] opacity-70">Executive Analytics</div>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setOpen(false)} aria-label="Tutup menu"><X className="h-5 w-5" /></button>
        </div>
        <nav className="space-y-1 p-3">
          <Link to="/" className="mb-2 flex items-center gap-3 rounded-md border border-sidebar-border px-3 py-2.5 text-sm hover:bg-sidebar-accent/60">
            <Home className="h-4 w-4" />Kembali ke Beranda
          </Link>
          {NAV.map((n) => {
            const active = path === n.to || path === `${n.to}/`;
            return (
              <Link key={n.to} to={n.to} onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${active ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground shadow-[inset_3px_0_0_var(--sidebar-primary)]" : "hover:bg-sidebar-accent/60"}`}>
                <n.icon className="h-4 w-4" />{n.label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute bottom-0 w-full border-t border-sidebar-border p-4 text-[11px] leading-relaxed opacity-70">
          Alat analisis historis &amp; simulasi — bukan sistem diagnosis atau prediksi resmi pemerintah.
        </div>
      </aside>

      <div className="relative isolate flex min-w-0 flex-1 flex-col">
        <img src={covidBackground} alt="" aria-hidden="true" width={1536} height={1024} className="covid-backdrop pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover" />
        <header className="bg-header relative isolate overflow-hidden px-4 py-6 text-primary-foreground md:px-6">
          <img src={covidBackground} alt="" aria-hidden="true" width={1536} height={1024} className="covid-header-image pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover" />
          <div className="flex flex-wrap items-center gap-3">
            <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Buka menu"><Menu className="h-6 w-6" /></button>
            <div className="min-w-0">
              <h1 className="text-lg font-extrabold tracking-wide md:text-xl">COVID-19 INDONESIA ANALYTICS DASHBOARD</h1>
              <p className="text-xs italic opacity-85 md:text-sm">Interactive Executive Dashboard for Pandemic Monitoring and What-If Scenario Analysis</p>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
              {status === "ready" && ds && (
                <>
                  <span className="rounded-full bg-primary-foreground/15 px-3 py-1">Periode: {fmtDate(ds.minKey)} – {fmtDate(ds.maxKey)}</span>
                  <span className="rounded-full bg-primary-foreground/15 px-3 py-1">✓ {fmt(ds.rows.length)} baris valid</span>
                </>
              )}
              {status === "loading" && <span className="flex items-center gap-1 rounded-full bg-primary-foreground/15 px-3 py-1"><Loader2 className="h-3 w-3 animate-spin" />{progress}</span>}
              {status === "error" && <span className="rounded-full bg-destructive px-3 py-1">Gagal memuat</span>}
              {run && <span className="rounded-full bg-primary-foreground/15 px-3 py-1">Diperbarui: {fmtDateTime(run.finished_at ?? run.created_at)}</span>}
              <Link to="/etl" className="flex items-center gap-1 rounded-full bg-primary-foreground/15 px-3 py-1 hover:bg-primary-foreground/25">
                <FileUp className="h-3 w-3" /> Kelola dataset (ETL)
              </Link>
            </div>
          </div>
        </header>

        {status === "ready" && ds ? (
          <>
            <FilterBar />
            <main id="dashboard-main" className="flex-1 space-y-5 p-4 md:p-6">{children}</main>
          </>
        ) : status === "error" ? (
          <div className="m-6 panel flex items-start gap-3 p-6">
            <TriangleAlert className="h-6 w-6 text-destructive" />
            <div>
              <div className="font-semibold">Dataset tidak dapat diproses</div>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
              <p className="mt-2 text-sm text-muted-foreground">Muat ulang dataset melalui halaman ETL.</p>
            </div>
          </div>
        ) : status === "empty" ? (
          <div className="grid flex-1 place-items-center p-10">
            <div className="panel max-w-md p-8 text-center">
              <Database className="mx-auto h-10 w-10 text-primary" />
              <div className="mt-3 text-lg font-bold">Belum ada dataset hasil ETL</div>
              <p className="mt-1 text-sm text-muted-foreground">Dashboard membaca data yang sudah melalui proses ETL. Unggah dan muat dataset terlebih dahulu.</p>
              <Button asChild className="mt-5"><Link to="/etl">Buka ETL</Link></Button>
            </div>
          </div>
        ) : (
          <div className="grid flex-1 place-items-center p-10">
            <div className="text-center">
              <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
              <p className="mt-3 font-medium">{progress}</p>
              <p className="text-sm text-muted-foreground">Membaca dataset hasil ETL terakhir.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterBar() {
  const { ds, draft, setDraft, apply, reset, filters } = useData();
  if (!ds) return null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(filters);
  const exportData = () => {
    const locs = scopeLocations(ds, filters);
    const rows = locs.flatMap((l) => (ds.byLocation.get(l) ?? []).filter((r) => r.key >= filters.start && r.key <= filters.end)).sort((a, b) => a.t - b.t);
    if (!rows.length) { toast.error("Tidak ada data untuk filter aktif."); return; }
    downloadCsv(toCsv(rows.map(rowToExport)), `covid19-${filters.start}_${filters.end}.csv`);
    toast.success(`${fmt(rows.length)} baris diekspor.`);
  };
  const exportChart = async () => {
    const n = await exportCharts(document.getElementById("dashboard-main") ?? document, "covid19-chart");
    n ? toast.success(`${n} grafik diekspor sebagai PNG.`) : toast.error("Tidak ada grafik pada halaman ini.");
  };
  return (
    <div className="border-b bg-card px-4 py-3 md:px-6">
      <div className="flex flex-wrap items-end gap-3">
        <F label="Tanggal awal"><input type="date" className="field" min={ds.minKey} max={ds.maxKey} value={draft.start} onChange={(e) => e.target.value && setDraft({ start: e.target.value })} /></F>
        <F label="Tanggal akhir"><input type="date" className="field" min={ds.minKey} max={ds.maxKey} value={draft.end} onChange={(e) => e.target.value && setDraft({ end: e.target.value })} /></F>
        <F label="Tingkat wilayah">
          <select className="field" value={draft.level} onChange={(e) => setDraft({ level: e.target.value as "Country" | "Province" })}>
            {ds.levels.includes("Country") && <option value="Country">Nasional (Country)</option>}
            {ds.levels.includes("Province") && <option value="Province">Provinsi (Province)</option>}
          </select>
        </F>
        <F label="Pulau">
          <select className="field" value={draft.island} onChange={(e) => setDraft({ island: e.target.value, province: "" })}>
            <option value="">Semua pulau</option>
            {ds.islands.map((i) => <option key={i}>{i}</option>)}
          </select>
        </F>
        <F label="Provinsi">
          <select className="field max-w-48" value={draft.province} onChange={(e) => setDraft({ province: e.target.value })}>
            <option value="">Semua provinsi</option>
            {ds.provinces.filter((p) => !draft.island || ds.byLocation.get(p)?.[0]?.island === draft.island).map((p) => <option key={p}>{p}</option>)}
          </select>
        </F>
        <F label="Indikator">
          <select className="field" value={draft.indicator} onChange={(e) => setDraft({ indicator: e.target.value as MetricKey })}>
            {(Object.keys(METRICS) as MetricKey[]).map((k) => <option key={k} value={k}>{METRICS[k].label}</option>)}
          </select>
        </F>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={apply} variant={dirty ? "default" : "secondary"}><Filter className="h-4 w-4" />Apply Filter</Button>
          <Button size="sm" variant="outline" onClick={reset}><RotateCcw className="h-4 w-4" />Reset Filter</Button>
          <Button size="sm" variant="outline" onClick={exportData}><Download className="h-4 w-4" />Export Data</Button>
          <Button size="sm" variant="outline" onClick={exportChart}><ImageIcon className="h-4 w-4" />Export Chart</Button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-muted-foreground">Filter aktif:</span>
        <Chip>{fmtDate(filters.start)} – {fmtDate(filters.end)}</Chip>
        <Chip>{scopeLabel(ds, filters)}</Chip>
        {filters.island && <Chip>Pulau: {filters.island}</Chip>}
        <Chip>Indikator: {METRICS[filters.indicator].label}</Chip>
        {dirty && <span className="rounded bg-orange-soft px-2 py-0.5 font-medium text-foreground">Perubahan belum diterapkan — klik Apply Filter</span>}
      </div>
    </div>
  );
}

const F = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}{children}</label>
);
const Chip = ({ children }: { children: ReactNode }) => <span className="rounded-full bg-secondary px-2.5 py-0.5 font-medium text-secondary-foreground">{children}</span>;

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function Panel({ title, subtitle, actions, children, className = "" }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel p-4 md:p-5 ${className}`}>
      <div className="mb-3 flex flex-wrap items-start gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-bold">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export const Empty = ({ text = "Tidak ada data untuk filter yang dipilih." }: { text?: string }) => (
  <div className="grid h-48 place-items-center rounded-md border border-dashed text-sm text-muted-foreground">{text}</div>
);

export function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-md border bg-muted p-0.5">
      {options.map((o) => (
        <button key={String(o.v)} onClick={() => onChange(o.v)} className={`rounded px-2.5 py-1 text-xs font-medium ${value === o.v ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{o.l}</button>
      ))}
    </div>
  );
}
