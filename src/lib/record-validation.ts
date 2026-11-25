// Validation + automatic normalisation for rows typed into "Tambah Data".
// The PHP backend (api/lib/validator.php) applies the same rules again before saving.
import { rowIdentity, type ColumnDef } from "@/lib/covid-schema";

export type CellValue = string | number | null;
export type NormalizedRow = Record<string, CellValue>;

export interface CellError { row: number; field: string; header: string; message: string; hint: string }

export interface ValidationResult {
  rows: NormalizedRow[];
  errors: CellError[];
  /** Number of cells whose text was corrected (capitalisation, spaces, number/date format). */
  normalizedCells: number;
}

const blank = (v: unknown) => v == null || (typeof v === "string" && v.trim() === "");
export const cleanSpaces = (s: string) => s.replace(/\s+/g, " ").trim();

/** "jAwA bArAt" → "Jawa Barat"; keeps acronyms such as DKI that the dataset writes in capitals. */
export function titleCase(s: string, acronyms: Set<string> = new Set()): string {
  return cleanSpaces(s)
    .toLowerCase()
    .replace(/(^|[\s\-/(.])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase())
    .split(" ")
    .map((w) => (acronyms.has(w.toUpperCase()) ? w.toUpperCase() : w))
    .join(" ");
}

/** Words written fully in capitals in the known values (e.g. "DKI"). */
export function acronymsOf(values: string[]): Set<string> {
  const out = new Set<string>();
  for (const v of values) for (const w of v.split(/\s+/)) if (w.length >= 2 && /^[A-Z]+$/.test(w)) out.add(w);
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");
function isoDate(y: number, m: number, d: number): string | null {
  if (y < 2019 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Accepts YYYY-MM-DD, YYYY/MM/DD, DD/MM/YYYY, DD-MM-YYYY (and an Excel date number); returns YYYY-MM-DD. */
export function normalizeDate(v: unknown): string | null {
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const dt = new Date(Math.round((v - 25569) * 86400000));
    return isoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return isoDate(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

/** Text → number. Understands "1.234.567", "1,234", "90,54" (decimal comma) and "1.234,5". */
export function parseNumber(v: unknown, integer: boolean): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v ?? "").replace(/\s+/g, "");
  if (!s) return null;
  if (integer && /^[-+]?\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, "");
  else if (s.includes(".") && s.includes(",")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (s.includes(",")) s = s.replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "utc+7" → "UTC+07:00" */
function normalizeTimeZone(s: string): string {
  const m = s.match(/^utc\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i);
  return m ? `UTC${m[1]}${pad(Number(m[2]))}:${m[3] ?? "00"}` : s;
}

const fmtRange = (d: ColumnDef) =>
  d.min != null && d.max != null && d.max < 1e9 ? `antara ${d.min} dan ${d.max}` : d.min != null && d.min >= 0 ? "minimal 0 (tidak boleh negatif)" : "";

/** Normalise one cell; returns the value or an error (message + hint). */
export function normalizeCell(raw: unknown, def: ColumnDef): { value: CellValue } | { error: string; hint: string } {
  if (blank(raw)) {
    return def.required ? { error: "wajib diisi", hint: `Isi kolom ${def.header}, contoh: ${def.example}` } : { value: null };
  }
  switch (def.kind) {
    case "date": {
      const d = normalizeDate(raw);
      return d ? { value: d } : { error: "format tanggal tidak valid", hint: `Gunakan format YYYY-MM-DD atau DD/MM/YYYY, contoh: ${def.example}` };
    }
    case "int":
    case "decimal": {
      const n = parseNumber(raw, def.kind === "int");
      if (n == null) return { error: "harus berupa angka", hint: `Isi angka tanpa huruf atau simbol, contoh: ${def.example}` };
      if (def.kind === "int" && !Number.isInteger(n)) return { error: "harus bilangan bulat", hint: `Hilangkan angka desimal, contoh: ${def.example}` };
      if ((def.min != null && n < def.min) || (def.max != null && n > def.max)) {
        const r = fmtRange(def);
        return { error: `nilai di luar rentang yang diizinkan${r ? ` (${r})` : ""}`, hint: `Periksa kembali nilainya, contoh: ${def.example}` };
      }
      return { value: n };
    }
    case "category": {
      let s = cleanSpaces(String(raw));
      if (def.field === "time_zone") s = normalizeTimeZone(s);
      const lower = s.toLowerCase();
      let hit = def.values?.find((v) => v.toLowerCase() === lower);
      if (!hit && lower.length >= 4) {
        // Unique whole-word match, e.g. "JAKARTA" → "DKI Jakarta" (only when exactly one value fits).
        const cands = (def.values ?? []).filter((v) => ` ${v.toLowerCase()} `.includes(` ${lower} `));
        if (cands.length === 1) hit = cands[0];
      }
      if (!hit) {
        const list = (def.values ?? []).slice(0, 8).join(", ");
        return { error: `“${s}” bukan nilai yang dikenal pada dataset`, hint: `Pilih salah satu: ${list}${(def.values?.length ?? 0) > 8 ? ", …" : ""}` };
      }
      return { value: hit };
    }
    default: {
      let s = cleanSpaces(String(raw));
      if (def.upper) s = s.toUpperCase();
      else if (def.titleCase) {
        const known = def.values?.find((v) => v.toLowerCase() === s.toLowerCase());
        s = known ?? titleCase(s, acronymsOf(def.values ?? []));
      }
      if (def.maxLength && s.length > def.maxLength) return { error: `terlalu panjang (maks. ${def.maxLength} karakter)`, hint: "Persingkat teksnya" };
      if (def.field === "location_iso_code" && !/^[A-Z]{2,3}(-[A-Z0-9]{1,3})?$/.test(s)) return { error: "format kode ISO tidak valid", hint: `Contoh: ${def.example} atau IDN` };
      return { value: s };
    }
  }
}

/**
 * Validates and normalises rows. Row numbers in errors start at 1.
 * `existingKeys` = identities already stored in the active dataset (duplicates are rejected).
 */
export function validateRows(input: Record<string, unknown>[], defs: ColumnDef[], existingKeys: Set<string> = new Set()): ValidationResult {
  const rows: NormalizedRow[] = [];
  const errors: CellError[] = [];
  const seen = new Map<string, number>();
  let normalizedCells = 0;
  input.forEach((raw, i) => {
    const rowNo = i + 1;
    const out: NormalizedRow = {};
    if (defs.every((d) => blank(raw[d.field]))) {
      errors.push({ row: rowNo, field: "", header: "—", message: "baris masih kosong", hint: "Isi data pada baris ini atau hapus barisnya" });
      rows.push(Object.fromEntries(defs.map((d) => [d.field, null])));
      return;
    }
    let rowOk = true;
    for (const d of defs) {
      const r = normalizeCell(raw[d.field], d);
      if ("error" in r) {
        rowOk = false;
        out[d.field] = raw[d.field] == null ? null : String(raw[d.field]);
        errors.push({ row: rowNo, field: d.field, header: d.header, message: r.error, hint: r.hint });
      } else {
        out[d.field] = r.value;
        if (!blank(raw[d.field]) && String(r.value) !== String(raw[d.field])) normalizedCells++;
      }
    }
    if (rowOk) {
      const key = rowIdentity(String(out["record_date"]), String(out["location"]), out["location_level"] as string | null, out["city_or_regency"] as string | null);
      const first = seen.get(key);
      if (first != null) {
        errors.push({ row: rowNo, field: "record_date", header: "Date", message: `duplikat dengan baris ${first} (tanggal, lokasi, dan kota sama)`, hint: "Ubah tanggal/lokasi/kota atau hapus salah satu baris" });
      } else if (existingKeys.has(key)) {
        errors.push({ row: rowNo, field: "record_date", header: "Date", message: "data dengan tanggal, lokasi, dan kota yang sama sudah ada di database", hint: "Data lama tidak ditimpa — ubah tanggal/lokasi/kota atau hapus baris ini" });
      } else seen.set(key, rowNo);
    }
    rows.push(out);
  });
  return { rows, errors, normalizedCells };
}
