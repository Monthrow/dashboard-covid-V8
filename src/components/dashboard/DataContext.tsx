import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { buildDataset, type Dataset, type Filters } from "@/lib/covid-data";
import { DASHBOARD_COLUMNS, recordToRaw } from "@/lib/etl";
import { fetchActiveRun, fetchRunRecords, type EtlRun } from "@/lib/etl-data";

export interface WhatIfParams { casesPct: number; deathsPct: number; recoveredPct: number; days: 7 | 14 | 30; region: string }
export const DEFAULT_WHATIF: WhatIfParams = { casesPct: 0, deathsPct: 0, recoveredPct: 0, days: 14, region: "" };

interface Ctx {
  /** "empty" = no ETL dataset has been loaded yet */
  status: "loading" | "ready" | "error" | "empty";
  progress: string;
  error: string | null;
  ds: Dataset | null;
  /** The ETL load the dashboard is reading from */
  run: EtlRun | null;
  filters: Filters; // applied
  draft: Filters;
  setDraft: (f: Partial<Filters>) => void;
  apply: () => void;
  reset: () => void;
  /** cross-filter: applies immediately */
  select: (f: Partial<Filters>) => void;
  whatIf: WhatIfParams;
  setWhatIf: (p: Partial<WhatIfParams>) => void;
}

const C = createContext<Ctx | null>(null);
export const useData = () => { const c = useContext(C); if (!c) throw new Error("DataProvider missing"); return c; };

const blank: Filters = { start: "", end: "", level: "Country", province: "", island: "", indicator: "nc" };

/** Reads the dataset produced by the latest successful ETL load. */
export function DataProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Ctx["status"]>("loading");
  const [progress, setProgress] = useState("Memeriksa dataset hasil ETL…");
  const [error, setError] = useState<string | null>(null);
  const [ds, setDs] = useState<Dataset | null>(null);
  const [run, setRun] = useState<EtlRun | null>(null);
  const [filters, setFilters] = useState<Filters>(blank);
  const [draft, setDraftState] = useState<Filters>(blank);
  const [whatIf, setWhatIfState] = useState<WhatIfParams>(DEFAULT_WHATIF);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const active = await fetchActiveRun();
        if (dead) return;
        if (!active) { setStatus("empty"); return; }
        setRun(active);
        const recs = await fetchRunRecords(active, (d, t) => !dead && setProgress(`Memuat data hasil ETL… ${Math.round((d / Math.max(1, t)) * 100)}%`));
        if (dead) return;
        setProgress("Menyiapkan data…");
        const d = buildDataset(active.file_name, recs.map(recordToRaw), DASHBOARD_COLUMNS);
        const f: Filters = { ...blank, start: d.minKey, end: d.maxKey };
        setDs(d); setFilters(f); setDraftState(f); setWhatIfState(DEFAULT_WHATIF); setStatus("ready");
      } catch (e) {
        if (dead) return;
        setError(e instanceof Error ? e.message : String(e)); setStatus("error");
      }
    })();
    return () => { dead = true; };
  }, []);

  const value = useMemo<Ctx>(() => ({
    status, progress, error, ds, run, filters, draft, whatIf,
    setDraft: (p) => setDraftState((d) => normalize({ ...d, ...p })),
    apply: () => setFilters(draft),
    reset: () => { if (!ds) return; const f = { ...blank, start: ds.minKey, end: ds.maxKey }; setFilters(f); setDraftState(f); },
    select: (p) => { const f = normalize({ ...filters, ...p }); setFilters(f); setDraftState(f); },
    setWhatIf: (p) => setWhatIfState((w) => ({ ...w, ...p })),
  }), [status, progress, error, ds, run, filters, draft, whatIf]);

  return <C.Provider value={value}>{children}</C.Provider>;
}

function normalize(f: Filters): Filters {
  const n = { ...f };
  if (n.province) n.level = "Province";
  if (n.level === "Country") n.province = "";
  if (n.start > n.end) [n.start, n.end] = [n.end, n.start];
  return n;
}
