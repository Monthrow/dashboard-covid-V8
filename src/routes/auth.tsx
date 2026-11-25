import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { BarChart3, Eye, EyeOff, Loader2, LockKeyhole, LogIn, ShieldCheck, SlidersHorizontal, UserRound, Workflow } from "lucide-react";
import { AppLogo } from "@/components/brand/AppLogo";
import { Blobs, VirusGlyph } from "@/components/brand/Decor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAdminStatus, verifyAdmin } from "@/lib/admin.functions";
import illustrationUrl from "@/assets/covid-login-illustration.jpg";
const illustration = illustrationUrl;

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Login Admin — COVID-19 Indonesia" },
      { name: "description", content: "Masuk sebagai Admin untuk mengelola dataset dan dashboard analitik COVID-19 Indonesia." },
      { property: "og:title", content: "Login Admin — COVID-19 Indonesia" },
      { property: "og:description", content: "Masuk sebagai Admin untuk mengelola dataset dan dashboard analitik COVID-19 Indonesia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const verify = useServerFn(verifyAdmin);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminStatus().then(({ admin }) => { if (admin) navigate({ to: "/", replace: true }); }).catch(() => {});
  }, [navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) { setError("Username dan password wajib diisi."); return; }
    setBusy(true);
    try {
      const r = await verify({ data: { username: username.trim(), password } });
      if (!r.ok) { setError(r.error); return; }
      navigate({ to: "/", replace: true });
    } catch {
      setError("Login gagal. Periksa koneksi lalu coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-background font-sans lg:grid-cols-[minmax(460px,5fr)_7fr]">
      <section className="bg-mesh relative isolate flex flex-col overflow-hidden px-6 py-8 sm:px-12">
        <Blobs />
        <VirusGlyph className="spin-slow pointer-events-none absolute -left-16 top-24 -z-10 h-48 w-48 text-primary/10" />
        <VirusGlyph className="spin-slow pointer-events-none absolute -right-8 bottom-28 -z-10 h-28 w-28 text-teal/15" />
        <VirusGlyph className="pointer-events-none absolute right-16 top-10 -z-10 h-10 w-10 text-orange/25" />

        <AppLogo size="lg" subtitle="Analytics Dashboard" />

        <div className="mx-auto my-auto w-full max-w-sm py-10">
          <span className="tone-teal tone-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
            <ShieldCheck className="h-3.5 w-3.5" />KHUSUS ADMIN
          </span>
          <p className="mt-4 text-sm font-semibold text-muted-foreground">Selamat datang kembali</p>
          <h1 className="text-gradient text-4xl font-extrabold leading-tight tracking-tight">Login Admin</h1>
          <p className="mt-2 text-sm text-muted-foreground">Masuk untuk mengelola dataset dan membuka dashboard analitik COVID-19 Indonesia.</p>

          <form onSubmit={onSubmit} className="glass mt-7 space-y-4 rounded-2xl p-6" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
                <Input id="username" autoComplete="username" value={username} maxLength={100} onChange={(e) => setUsername(e.target.value)} placeholder="Masukkan username" className="h-11 bg-card pl-9" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
                <Input id="password" type={show ? "text" : "password"} autoComplete="current-password" value={password} maxLength={200}
                  onChange={(e) => setPassword(e.target.value)} placeholder="Masukkan password" className="h-11 bg-card pl-9 pr-10" />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Sembunyikan password" : "Tampilkan password"}
                  className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <Button type="submit" size="lg" className="btn-gradient h-11 w-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}Login
            </Button>
          </form>
        </div>

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" />Akses khusus Admmin · COVID-19 Indonesia Analytics</p>
      </section>

      <section className="bg-header relative isolate hidden overflow-hidden lg:flex lg:items-center lg:justify-center">
        <img src={illustration} alt="" aria-hidden="true" width={1024} height={1024} className="absolute inset-0 -z-10 h-full w-full object-cover opacity-90" />
        <div className="login-info-overlay absolute inset-0 -z-10" />
        <VirusGlyph className="spin-slow pointer-events-none absolute right-10 top-10 -z-10 h-24 w-24 text-primary-foreground/10" />
        <VirusGlyph className="pointer-events-none absolute bottom-16 left-12 -z-10 h-14 w-14 text-teal/40" />
        <div className="max-w-lg px-10 text-primary-foreground">
          <span className="rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-semibold tracking-wide">MENGENAL COVID-19</span>
          <h2 className="mt-5 text-4xl font-extrabold leading-tight">Apa Itu COVID-19?</h2>
          <p className="mt-4 text-base leading-relaxed opacity-90">
            COVID-19 merupakan penyakit menular yang disebabkan oleh virus SARS-CoV-2. Penyakit ini pertama kali teridentifikasi pada akhir tahun 2019 dan kemudian menyebar ke berbagai negara, termasuk Indonesia. Pandemi COVID-19 memberikan dampak besar terhadap kesehatan masyarakat dan berbagai sektor kehidupan. Oleh karena itu, pemantauan data kasus, kematian, dan kesembuhan menjadi penting untuk memahami perkembangan pandemi.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3 text-center text-xs">
            {[["Virus", "SARS-CoV-2"], ["Teridentifikasi", "Akhir 2019"], ["Dipantau", "Kasus · Kematian · Sembuh"]].map(([k, v], i) => (
              <div key={k} style={{ animationDelay: `${i * -2}s` }} className="float-card rounded-xl border border-primary-foreground/15 bg-primary-foreground/10 p-3 backdrop-blur-sm">
                <div className="opacity-75">{k}</div>
                <div className="mt-1 font-semibold">{v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
