import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, Plus, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ColumnDef } from "@/lib/covid-schema";
import { addRecords, fetchCitiesByLocation, fetchDeriveContext, validateOnServer } from "@/lib/etl-data";
import { deriveRows, normalizeSimpleRows, simpleColumns } from "@/lib/record-derive";
import { ApiError } from "@/lib/api-client";
import { validateRows, type CellError, type NormalizedRow } from "@/lib/record-validation";

type Draft = { id: number; cells: Record<string, string> };
type Mode = "simple" | "full";

const KIND_LABEL: Record<ColumnDef["kind"], string> = { date: "Tanggal", int: "Bilangan bulat", decimal: "Desimal", text: "Teks", category: "Kategori" };

let nextId = 1;
const emptyRow = (defs: ColumnDef[]): Draft => ({ id: nextId++, cells: Object.fromEntries(defs.map((d) => [d.field, ""])) });
const toCell = (v: unknown) => (v == null ? "" : String(v));

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Column structure of the active dataset (from the database). */
  columns: ColumnDef[];
  datasetName: string;
  onSaved: () => void;
}

/**
 * Spreadsheet-style "Enter Data" modal. Simple mode (default) asks for 6 columns and derives the rest from the
 * previous stored row; full mode shows all dataset columns. OK validates, Selesai saves.
 */
export function AddDataDialog({ open, onOpenChange, columns, datasetName, onSaved }: Props) {
  const [mode, setMode] = useState<Mode>("simple");
  const simpleDefs = useMemo(() => simpleColumns(columns), [columns]);
  const defs = mode === "simple" ? simpleDefs : columns;
  const [rows, setRows] = useState<Draft[]>(() => [emptyRow(simpleColumns(columns))]);
  const cities = useQuery({ queryKey: ["etl", "cities"], queryFn: fetchCitiesByLocation, enabled: open && mode === "simple", staleTime: 60_000 });
  const [errors, setErrors] = useState<CellError[] | null>(null);
  const [checked, setChecked] = useState<NormalizedRow[] | null>(null);
  const [normalized, setNormalized] = useState(0);
  const [busy, setBusy] = useState<null | "check" | "save">(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const errAt = useMemo(() => {
    const m = new Map<string, CellError>();
    for (const e of errors ?? []) if (e.field) m.set(`${e.row}|${e.field}`, e);
    return m;
  }, [errors]);

  const dirty = () => { setChecked(null); setServerError(null); };
  const reset = (m: Mode = mode) => { setRows([emptyRow(m === "simple" ? simpleDefs : columns)]); setErrors(null); setChecked(null); setNormalized(0); setServerError(null); };
  const switchMode = (m: Mode) => { if (m === mode || busy) return; setMode(m); reset(m); };

  const setCell = (id: number, field: string, value: string) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, cells: { ...r.cells, [field]: value } } : r)));
    dirty();
  };
  const addRow = () => { setRows((rs) => [...rs, emptyRow(defs)]); dirty(); };
  const removeRow = (id: number) => { setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : [emptyRow(defs)])); setErrors(null); dirty(); };

  /** Simple mode: normalise the 6 typed columns, fetch the previous rows, derive the other columns. */
  async function deriveFull(): Promise<Record<string, unknown>[] | null> {
    const simple = normalizeSimpleRows(rows.map((r) => r.cells), simpleDefs);
    const show = (cells: Record<string, unknown>[]) => setRows((rs) => rs.map((r, i) => ({ ...r, cells: Object.fromEntries(simpleDefs.map((d) => [d.field, toCell(cells[i]?.[d.field])])) })));
    show(simple.cells);
    if (simple.errors.length) { setErrors(simple.errors); setChecked(null); return null; }
    const ok = simple.rows.map((r) => r!);
    const ctx = await fetchDeriveContext(ok.map((r) => ({ location: r.location, city: r.city_or_regency ?? "", date: r.record_date })));
    const derived = deriveRows(ok, ctx.items);
    show(derived.rows.map((d, i) => d ?? simple.cells[i]!));
    if (derived.errors.length) { setErrors(derived.errors); setChecked(null); return null; }
    return derived.rows as Record<string, unknown>[];
  }

  async function check() {
    setBusy("check"); setServerError(null);
    try {
      let input: Record<string, unknown>[] = rows.map((r) => r.cells);
      if (mode === "simple") {
        const full = await deriveFull();
        if (!full) return;
        input = full;
      }
      const local = validateRows(input, columns);
      // Write the normalised values back into the cells the user sees.
      if (mode === "full") {
        setRows((rs) => rs.map((r, i) => ({ ...r, cells: Object.fromEntries(columns.map((d) => [d.field, toCell(local.rows[i]?.[d.field])])) })));
        setNormalized(local.normalizedCells);
      }
      if (local.errors.length) { setErrors(local.errors); setChecked(null); return; }
      const server = await validateOnServer(local.rows);
      setErrors(server.errors);
      setChecked(server.valid ? local.rows : null);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : String(e)); setChecked(null);
    } finally { setBusy(null); }
  }

  async function save() {
    if (!checked) return;
    setBusy("save"); setServerError(null);
    try {
      const res = await addRecords(checked);
      toast.success(`${res.inserted} baris berhasil disimpan ke database.`);
      onSaved();
      reset();
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError && Array.isArray(e.details)) setErrors(e.details as CellError[]);
      setServerError(e instanceof Error ? e.message : String(e));
      setChecked(null);
    } finally { setBusy(null); }
  }

  const cityOptions = (location: string | undefined) => {
    const map = cities.data?.cities ?? {};
    const key = Object.keys(map).find((k) => k.toLowerCase() === (location ?? "").trim().toLowerCase());
    return key ? map[key]! : [];
  };

  const errorList = errors ?? [];
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) { onOpenChange(o); if (!o) reset(); } }}>
      <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-[96vw] flex-col gap-4 overflow-hidden p-5 font-sans">
        <DialogHeader>
          <DialogTitle className="text-gradient text-xl font-extrabold">Tambah Data</DialogTitle>
          <DialogDescription>
            {mode === "simple"
              ? <>Cukup isi tanggal, lokasi, dan angka harian. Kolom lain pada dataset <b>{datasetName}</b> (total, kasus aktif, populasi, koordinat, rasio per juta, CFR, growth factor) dihitung otomatis dari data terakhir lokasi tersebut. Kosongkan <b>City or Regency</b> untuk memakai kota pada data terakhir.</>
              : <>Kolom mengikuti struktur tabel dataset aktif <b>{datasetName}</b> ({columns.length} kolom, urutan tetap).</>}{" "}
            Klik <b>OK</b> untuk memeriksa, lalu <b>Selesai</b> untuk menyimpan. Tanda * = wajib diisi.
          </DialogDescription>
        </DialogHeader>

        <div role="radiogroup" aria-label="Mode input" className="inline-flex w-fit rounded-lg border bg-muted p-1 text-sm">
          {([["simple", `Sederhana (${simpleDefs.length} kolom)`], ["full", `Lengkap (${columns.length} kolom)`]] as const).map(([m, label]) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => switchMode(m)} disabled={!!busy}
              className={`rounded-md px-3 py-1.5 font-semibold transition-colors ${mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card" role="region" aria-label="Lembar input data">
          <table className="border-separate border-spacing-0 text-xs">
            <thead className="sticky top-0 z-20 bg-secondary text-secondary-foreground">
              <tr>
                <th className="sticky left-0 z-30 border-b border-r bg-secondary px-2 py-2 text-left font-semibold">#</th>
                {defs.map((d) => (
                  <th key={d.field} className="min-w-36 whitespace-nowrap border-b border-r px-2 py-1.5 text-left align-top font-semibold">
                    <div>{d.header}{d.required && <span className="text-destructive"> *</span>}</div>
                    <div className="text-[10px] font-normal text-muted-foreground">{KIND_LABEL[d.kind]}{d.maxLength ? ` · maks. ${d.maxLength}` : ""}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td className="sticky left-0 z-10 border-b border-r bg-card px-1 py-1">
                    <div className="flex items-center gap-1">
                      <span className="num w-6 text-center text-muted-foreground">{i + 1}</span>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeRow(r.id)} aria-label={`Hapus baris ${i + 1}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                  {defs.map((d) => {
                    const err = errAt.get(`${i + 1}|${d.field}`);
                    const cityList = mode === "simple" && d.field === "city_or_regency" ? cityOptions(r.cells["location"]) : null;
                    return (
                      <td key={d.field} className="border-b border-r p-0.5">
                        <input
                          value={r.cells[d.field] ?? ""}
                          onChange={(e) => setCell(r.id, d.field, e.target.value)}
                          list={cityList ? `dl-city-${r.id}` : d.values?.length ? `dl-${d.field}` : undefined}
                          inputMode={d.kind === "int" || d.kind === "decimal" ? "decimal" : undefined}
                          placeholder={cityList ? "otomatis" : d.example}
                          aria-label={`Baris ${i + 1} ${d.header}`}
                          aria-invalid={err ? true : undefined}
                          title={err ? `${err.message} — ${err.hint}` : undefined}
                          className={`h-8 w-full min-w-32 rounded border bg-background px-2 text-xs outline-none placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-ring ${err ? "border-destructive bg-destructive/10" : "border-transparent"}`}
                        />
                        {cityList && <datalist id={`dl-city-${r.id}`}>{cityList.map((v) => <option key={v} value={v} />)}</datalist>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {defs.filter((d) => d.values?.length && !(mode === "simple" && d.field === "city_or_regency")).map((d) => (
            <datalist key={d.field} id={`dl-${d.field}`}>{d.values!.map((v) => <option key={v} value={v} />)}</datalist>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={!!busy}><Plus className="h-4 w-4" />Tambah Baris</Button>
          <span className="text-xs text-muted-foreground">{rows.length} baris{mode === "full" ? " · geser ke samping untuk melihat semua kolom" : ""}</span>
        </div>

        {serverError && <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{serverError}</div>}
        {errors && errorList.length > 0 && (
          <div role="alert" className="max-h-40 overflow-auto rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <div className="mb-1 flex items-center gap-2 font-semibold text-destructive"><AlertTriangle className="h-4 w-4" />{errorList.length} kesalahan ditemukan — perbaiki lalu klik OK lagi.</div>
            <ul className="space-y-1">
              {errorList.map((e, k) => (
                <li key={k}><b>Baris {e.row}</b>{e.field && <> · kolom <b>{e.header}</b></>}: {e.message}. <span className="text-muted-foreground">Petunjuk: {e.hint}.</span></li>
              ))}
            </ul>
          </div>
        )}
        {checked && (
          <div role="status" className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-sm">
            <CheckCircle2 className="h-4 w-4 text-success" />Semua {checked.length} baris valid{normalized ? ` · ${normalized} sel dirapikan otomatis` : ""}. Klik <b>Selesai</b> untuk menyimpan ke database.
          </div>
        )}
        {checked && mode === "simple" && <DerivedPreview rows={checked} />}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => { onOpenChange(false); reset(); }} disabled={!!busy}>Batal</Button>
          <Button type="button" variant="secondary" onClick={check} disabled={!!busy}>{busy === "check" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}OK</Button>
          <Button type="button" className="btn-gradient" onClick={save} disabled={!checked || !!busy}>{busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Selesai</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


const PREVIEW: [string, string][] = [
  ["record_date", "Date"], ["location", "Location"], ["city_or_regency", "City or Regency"], ["total_cases", "Total Cases"],
  ["total_deaths", "Total Deaths"], ["total_recovered", "Total Recovered"], ["total_active_cases", "Total Active Cases"],
  ["case_fatality_rate", "Case Fatality Rate"], ["growth_factor_new_cases", "Growth Factor of New Cases"],
];
const fmtNum = (v: unknown) => (typeof v === "number" ? v.toLocaleString("id-ID", { maximumFractionDigits: 4 }) : toCell(v) || "—");

/** Shows the main derived columns so the user can check them before saving. */
function DerivedPreview({ rows }: { rows: NormalizedRow[] }) {
  return (
    <div className="max-h-48 overflow-auto rounded-lg border bg-card">
      <div className="border-b px-3 py-2 text-xs font-semibold text-muted-foreground">Hasil hitung otomatis (semua kolom ikut disimpan)</div>
      <table className="w-full text-xs">
        <thead className="bg-secondary text-secondary-foreground"><tr>{PREVIEW.map(([, h]) => <th key={h} className="whitespace-nowrap px-2 py-1.5 text-left font-semibold">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t">{PREVIEW.map(([f]) => <td key={f} className="num whitespace-nowrap px-2 py-1.5">{fmtNum(r[f])}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
