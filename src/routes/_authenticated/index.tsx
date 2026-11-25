import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BarChart3, Database, LayoutDashboard, LogOut, Map as MapIcon, SlidersHorizontal, Sparkles, UserRound, Users, Workflow } from "lucide-react";
import { AppLogo } from "@/components/brand/AppLogo";
import { Blobs, VirusGlyph } from "@/components/brand/Decor";
import heroUrl from "@/assets/covid-login-illustration.jpg";
const heroArt = heroUrl;
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { logoutAdmin } from "@/lib/admin.functions";
import { fetchActiveRun } from "@/lib/etl-data";
import { fmt, fmtDate } from "@/lib/covid-data";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Beranda — COVID-19 Indonesia Analytics Dashboard" },
      { name: "description", content: "Beranda Admin: buka dashboard analitik atau kelola dataset COVID-19 Indonesia melalui proses ETL." },
      { property: "og:title", content: "Beranda — COVID-19 Indonesia Analytics Dashboard" },
      { property: "og:description", content: "Beranda Admin: buka dashboard analitik atau kelola dataset COVID-19 Indonesia melalui proses ETL." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const GOALS = [
  { icon: Database, text: "Mempermudah pengolahan dataset COVID-19.", tone: "tone-blue" },
  { icon: BarChart3, text: "Menyajikan informasi melalui visualisasi interaktif.", tone: "tone-teal" },
  { icon: MapIcon, text: "Membantu analisis perkembangan kasus berdasarkan waktu dan wilayah.", tone: "tone-orange" },
  { icon: SlidersHorizontal, text: "Mendukung eksplorasi data dan simulasi skenario.", tone: "tone-green" },
];

const CONTRIBUTORS = [
  { name: "Ahmad Arif Dhuha", npm: "24082010033", tone: "tone-blue" },
  { name: "Dwiki Aulia Rahman", npm: "24082010153", tone: "tone-teal" },
  { name: "Farel Fazriel Marbela", npm: "24082010159", tone: "tone-orange" },
];

const initials = (n: string) => n.split(" ").slice(0, 2).map((w) => w[0]).join("");

function Landing() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: run } = useQuery({ queryKey: ["etl", "active"], queryFn: fetchActiveRun });

  async function logout() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await logoutAdmin();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="bg-mesh relative isolate min-h-screen font-sans">
      <Blobs fixed />
      <header className="glass sticky top-0 z-30 rounded-none border-x-0 border-t-0">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 md:px-6">
          <AppLogo />
          <div className="ml-2 hidden h-8 w-px bg-border sm:block" />
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="btn-gradient grid h-9 w-9 place-items-center rounded-full text-primary-foreground"><UserRound className="h-5 w-5" /></div>
              <span className="live-dot absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-success" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-bold">Admin</div>
              <div className="text-xs text-muted-foreground">Administrator</div>
            </div>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="ml-auto bg-card/70 hover:border-destructive/40 hover:text-destructive"><LogOut className="h-4 w-4" />Logout</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Keluar dari aplikasi?</AlertDialogTitle>
                <AlertDialogDescription>Sesi Admin akan diakhiri dan Anda kembali ke halaman Login.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Batal</AlertDialogCancel>
                <AlertDialogAction onClick={logout}>Ya, Logout</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 md:px-6">
        <section className="bg-header hero-rings relative isolate overflow-hidden rounded-3xl p-6 text-primary-foreground shadow-card md:p-10">
          <img src={heroArt} alt="" aria-hidden="true" width={1024} height={1024} className="hero-art absolute inset-y-0 right-0 -z-10 hidden h-full w-1/2 object-cover opacity-50 md:block" />
          <VirusGlyph className="spin-slow pointer-events-none absolute -bottom-10 right-1/3 -z-10 h-32 w-32 text-primary-foreground/10" />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-foreground/20 bg-primary-foreground/15 px-3 py-1 text-xs font-semibold backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5" />Selamat datang, Admin
          </span>
          <h1 className="mt-4 max-w-3xl text-3xl font-extrabold tracking-tight md:text-4xl">COVID-19 Indonesia Analytics Dashboard</h1>
          <p className="mt-3 max-w-4xl text-sm leading-relaxed opacity-90 md:text-base">
            COVID-19 Indonesia Analytics Dashboard merupakan aplikasi berbasis web yang dirancang untuk membantu proses pengolahan dan analisis data COVID-19 Indonesia. Aplikasi ini menyediakan fitur ETL (Extract, Transform, Load) untuk mengunggah, membersihkan, dan mengelola dataset, serta dashboard interaktif untuk menyajikan informasi dalam bentuk KPI, grafik tren, peta persebaran, dan perbandingan data antarprovinsi. Selain itu, tersedia fitur Drill-Down untuk analisis lebih mendalam dan What-If Analysis untuk melakukan simulasi skenario berdasarkan data historis.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {GOALS.map((g) => (
              <div key={g.text} className={`${g.tone} flex items-start gap-3 rounded-2xl border border-primary-foreground/15 bg-primary-foreground/10 p-3 text-sm backdrop-blur-md transition-colors hover:bg-primary-foreground/20`}>
                <span className="tone-tile grid h-9 w-9 shrink-0 place-items-center rounded-xl"><g.icon className="h-4 w-4" /></span>
                <span className="leading-snug">{g.text}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 inline-flex flex-wrap items-center gap-2 rounded-full bg-primary-foreground/10 px-3 py-1.5 text-xs backdrop-blur-sm">
            <span className={`live-dot h-2 w-2 shrink-0 rounded-full ${run ? "bg-success" : "bg-orange"}`} />
            <span className="opacity-90">{run === undefined ? "Memeriksa dataset…" : run
              ? <>Dataset aktif: <b>{run.file_name}</b> · {fmt(run.rows_loaded)} baris · periode {fmtDate(run.period_start ?? "")} – {fmtDate(run.period_end ?? "")} · diperbarui {new Date(run.finished_at ?? run.created_at).toLocaleString("id-ID")}</>
              : <>Belum ada dataset yang dimuat — mulai dari ETL Process.</>}</span>
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2">
          <NavCard icon={LayoutDashboard} title="Dashboard" text="Menampilkan dan menganalisis perkembangan COVID-19 Indonesia melalui visualisasi data interaktif."
            tags={["KPI", "Tren", "Peta", "Antarprovinsi", "Drill-Down", "What-If"]} to="/dashboard" cta="BUKA DASHBOARD" tone="tone-blue" />
          <NavCard icon={Workflow} title="ETL Process" text="Melakukan proses pengambilan, pembersihan, transformasi, dan penyimpanan dataset COVID-19 Indonesia."
            tags={["Extract", "Transform", "Load", "Riwayat"]} to="/etl" cta="BUKA ETL" tone="tone-teal" />
        </section>

        <section className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2">
            <span className="tone-blue tone-chip grid h-8 w-8 place-items-center rounded-lg"><Users className="h-4 w-4" /></span>
            <h2 className="text-gradient text-base font-extrabold">Project Contributors</h2>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {CONTRIBUTORS.map((c) => (
              <div key={c.npm} className={`${c.tone} tone-wash lift flex items-center gap-3 rounded-xl border bg-card p-3`}>
                <div className="tone-tile grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold ring-4 ring-card">{initials(c.name)}</div>
                <div className="min-w-0 leading-tight">
                  <div className="truncate text-sm font-semibold">{c.name}</div>
                  <div className="num text-xs text-muted-foreground">NPM {c.npm}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function NavCard({ icon: Icon, title, text, tags, to, cta, tone }: { icon: typeof LayoutDashboard; title: string; text: string; tags: string[]; to: "/dashboard" | "/etl"; cta: string; tone: string }) {
  return (
    <div className={`${tone} panel tone-card tone-wash nav-card flex flex-col rounded-2xl p-6`}>
      <Icon aria-hidden="true" className="tone-text pointer-events-none absolute -bottom-6 -right-6 h-40 w-40 opacity-[0.07]" />
      <div className="tone-tile grid h-14 w-14 place-items-center rounded-2xl"><Icon className="h-7 w-7" /></div>
      <h2 className="mt-4 text-xl font-extrabold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {tags.map((t) => <span key={t} className="tone-chip rounded-full px-2.5 py-0.5 text-xs font-semibold">{t}</span>)}
      </div>
      <Button asChild size="lg" className="tone-btn mt-6 self-start"><Link to={to}>{cta}<ArrowRight className="h-4 w-4" /></Link></Button>
    </div>
  );
}
