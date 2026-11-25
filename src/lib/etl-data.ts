// Penyimpanan hasil ETL di MySQL (XAMPP) lewat API PHP Native — sumber data utama dashboard.
import { api } from "@/lib/api-client";
import type { ColumnDef } from "@/lib/covid-schema";
import type { EtlRecord, EtlReport } from "@/lib/etl";
import type { CellError, NormalizedRow } from "@/lib/record-validation";

export interface EtlRun {
  id: string;
  dataset_id?: number | null;
  dataset_name?: string;
  source?: "etl" | "manual" | "dataset";
  file_name: string;
  file_hash: string;
  file_size: number;
  status: string;
  rows_read: number;
  rows_valid: number;
  rows_invalid: number;
  duplicates_removed: number;
  rows_existing?: number;
  rows_loaded: number;
  column_count: number;
  period_start: string | null;
  period_end: string | null;
  summary: unknown;
  message: string | null;
  is_active: boolean;
  created_at: string;
  finished_at: string | null;
}

export async function sha256Hex(buf: ArrayBuffer) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface DatasetMeta { dataset: EtlRun | null; columns: ColumnDef[]; history: EtlRun[] }

export const fetchMetadata = (history = 15) => api<DatasetMeta>(`dataset/metadata.php?history=${history}`);

export async function fetchActiveRun(): Promise<EtlRun | null> {
  return (await fetchMetadata(1)).dataset;
}

export async function fetchRuns(limit = 15): Promise<EtlRun[]> {
  return (await fetchMetadata(limit)).history;
}

const PAGE = 5000;

/** Reads every row of the active dataset from MySQL, page by page. */
export async function fetchRunRecords(_run: EtlRun, onProgress?: (done: number, total: number) => void): Promise<EtlRecord[]> {
  const out: EtlRecord[] = [];
  let offset = 0;
  for (;;) {
    const page = await api<{ columns: string[]; rows: unknown[][]; total: number }>(`dataset/get.php?offset=${offset}&limit=${PAGE}`);
    for (const r of page.rows) {
      const rec: Record<string, unknown> = {};
      page.columns.forEach((c, i) => { rec[c] = r[i]; });
      out.push(rec as unknown as EtlRecord);
    }
    offset += page.rows.length;
    onProgress?.(Math.min(offset, page.total), page.total);
    if (page.rows.length < PAGE) break;
  }
  return out;
}

export interface LoadResult { status: "success" | "skipped"; run: EtlRun; message: string }

const CHUNK = 2000;

/**
 * Load step: sends the transformed rows to MySQL in parts. Rows already stored are skipped (never overwritten);
 * an identical active file is not loaded again. If any part fails, the backend removes every row of this load.
 */
export async function loadRecords(
  meta: { fileName: string; fileSize: number; fileHash: string; columnCount: number },
  records: EtlRecord[],
  report: EtlReport,
  onProgress?: (done: number, total: number) => void,
): Promise<LoadResult> {
  const begin = await api<{ status: "loading" | "skipped"; load_id?: number; run?: EtlRun; message?: string }>("dataset/upload.php", {
    body: {
      action: "begin", file_name: meta.fileName, file_hash: meta.fileHash, file_size: meta.fileSize, column_count: meta.columnCount,
      rows_read: report.before.rows, rows_valid: records.length, rows_invalid: report.dropped,
      duplicates_removed: report.steps.find((s) => s.name === "Duplikasi")?.count ?? 0,
      period_start: report.after.periodStart, period_end: report.after.periodEnd, summary: report,
    },
  });
  if (begin.status === "skipped") return { status: "skipped", run: begin.run!, message: begin.message ?? "" };
  const loadId = begin.load_id!;
  onProgress?.(0, records.length);
  try {
    for (let i = 0; i < records.length; i += CHUNK) {
      await api("dataset/upload.php", { body: { action: "chunk", load_id: loadId, offset: i, rows: records.slice(i, i + CHUNK) } });
      onProgress?.(Math.min(i + CHUNK, records.length), records.length);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await api("dataset/upload.php", { body: { action: "finish", load_id: loadId, success: false, message: msg } }).catch(() => {});
    throw new Error(`${msg} Tidak ada data yang tersimpan sebagian.`);
  }
  const fin = await api<{ status: "success" | "skipped"; run: EtlRun; message: string }>("dataset/upload.php", {
    body: { action: "finish", load_id: loadId, success: true, expected_rows: records.length },
  });
  return { status: fin.status, run: fin.run, message: fin.message };
}

export interface ServerValidation { valid: boolean; errors: CellError[]; rows: Record<string, NormalizedRow> }

/** Re-checks rows on the backend (types, categories, duplicates against MySQL) without saving. */
export const validateOnServer = (rows: NormalizedRow[]) => api<ServerValidation>("records/validate.php", { body: { rows } });

/** Saves rows in one database transaction; nothing is stored if any row fails. */
export const addRecords = (rows: NormalizedRow[]) =>
  api<{ inserted: number; message: string; dataset: EtlRun | null }>("records/bulk-add.php", { body: { rows } });

export interface DeriveContextItem {
  /** Latest stored row of the location before the entered date. */
  prev: Record<string, unknown> | null;
  /** Stored row of the same city/regency (or the location) that supplies the fixed columns. */
  template: Record<string, unknown> | null;
  /** Population of every city/regency of the location (for city-split workbooks). */
  city_pops: Record<string, number>;
}

/** Reference rows for the simple "Tambah Data" mode (read-only). */
export const fetchDeriveContext = (items: { location: string; city: string; date: string }[]) =>
  api<{ items: DeriveContextItem[] }>("records/context.php", { body: { items } });

/** Cities/regencies per location stored in the active dataset. */
export const fetchCitiesByLocation = () => api<{ cities: Record<string, string[]> }>("records/context.php");
