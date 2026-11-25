// "Tambah Data" simple mode: the user types only Date, Location, City or Regency and the three daily
// numbers; every other Excel column is derived from the location's previous stored row.
import type { ColumnDef } from "@/lib/covid-schema";
import { normalizeCell, type CellError, type NormalizedRow } from "@/lib/record-validation";

export const SIMPLE_FIELDS = ["record_date", "location", "city_or_regency", "new_cases", "new_deaths", "new_recovered"] as const;

/** Columns copied unchanged from a stored row of the same location / city. */
const FIXED_TEXT = ["location_iso_code", "location_level", "province", "country", "continent", "island", "time_zone", "special_status"] as const;
const FIXED_NUMBERS = [
  "total_regencies", "total_cities", "total_districts", "total_urban_villages", "total_rural_villages",
  "area_km2", "population", "population_density", "longitude", "latitude",
] as const;

export interface SimpleRow {
  record_date: string;
  location: string;
  city_or_regency: string | null;
  new_cases: number;
  new_deaths: number;
  new_recovered: number;
}

type Stored = Record<string, unknown>;
export interface DeriveContext { prev: Stored | null; template: Stored | null; city_pops: Record<string, number> }

/** Column definitions for the simple form (City or Regency stays optional). */
export function simpleColumns(columns: ColumnDef[]): ColumnDef[] {
  return SIMPLE_FIELDS.map((f) => columns.find((c) => c.field === f)).filter((c): c is ColumnDef => !!c).map((c) => ({ ...c, required: c.field === "city_or_regency" ? false : c.required }));
}

const blank = (v: unknown) => v == null || (typeof v === "string" && v.trim() === "");

/** Normalises the typed simple cells. Row numbers start at 1; `null` marks a row with errors. */
export function normalizeSimpleRows(input: Record<string, unknown>[], defs: ColumnDef[]): { rows: (SimpleRow | null)[]; cells: Record<string, unknown>[]; errors: CellError[] } {
  const errors: CellError[] = [];
  const cells: Record<string, unknown>[] = [];
  const rows = input.map((raw, i) => {
    const out: Record<string, unknown> = {};
    if (defs.every((d) => blank(raw[d.field]))) {
      errors.push({ row: i + 1, field: "", header: "—", message: "baris masih kosong", hint: "Isi data pada baris ini atau hapus barisnya" });
      cells.push(raw);
      return null;
    }
    let ok = true;
    for (const d of defs) {
      const r = normalizeCell(raw[d.field], d);
      if ("error" in r) { ok = false; out[d.field] = raw[d.field]; errors.push({ row: i + 1, field: d.field, header: d.header, message: r.error, hint: r.hint }); }
      else out[d.field] = r.value;
    }
    cells.push(out);
    return ok ? (out as unknown as SimpleRow) : null;
  });
  return { rows, cells, errors };
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const round = (n: number, d: number) => { const f = 10 ** d; return Math.round(n * f) / f; };
const low = (s: unknown) => String(s ?? "").trim().toLowerCase();
const isSplitCity = (row: Stored) => row["location_level"] === "Province" && !blank(row["city_or_regency"]) && !/^seluruh/i.test(String(row["city_or_regency"]).trim());

/** A city's share of its province (city population ÷ all cities' population); 1 when the file is not split per city. */
export function cityShare(row: Stored, cityPops: Record<string, number>): number {
  if (!isSplitCity(row)) return 1;
  const pops = new Map(Object.entries(cityPops).filter(([c]) => !/^seluruh/i.test(c)).map(([c, p]) => [low(c), p]));
  const total = [...pops.values()].reduce((a, b) => a + b, 0);
  const own = pops.get(low(row["city_or_regency"])) ?? num(row["population"]) ?? 0;
  return total > 0 && own > 0 ? own / total : 1;
}

const err = (row: number, field: string, header: string, message: string, hint: string): CellError => ({ row, field, header, message, hint });

/**
 * Builds full 38-column rows. Totals = previous totals (rescaled to the chosen city's share) + the typed new numbers;
 * active cases, per-million figures, CFR/recovery rate and growth factors are recalculated; fixed columns are copied.
 * Rows of the same location in one batch chain on each other in date order.
 */
export function deriveRows(input: SimpleRow[], ctx: DeriveContext[]): { rows: (NormalizedRow | null)[]; errors: CellError[] } {
  const rows: (NormalizedRow | null)[] = input.map(() => null);
  const errors: CellError[] = [];
  const order = input.map((_, i) => i).sort((a, b) => input[a]!.record_date.localeCompare(input[b]!.record_date));
  for (const i of order) {
    const r = input[i]!;
    const c = ctx[i] ?? { prev: null, template: null, city_pops: {} };
    const rowNo = i + 1;
    // Latest earlier row: the stored one, or a row typed above for the same location if it is newer.
    let prev: Stored | null = c.prev;
    for (const j of order) {
      const d = rows[j];
      if (!d || j === i || low(d["location"]) !== low(r.location) || String(d["record_date"]) >= r.record_date) continue;
      if (!prev || String(d["record_date"]) >= String(prev["record_date"])) prev = d;
    }
    if (!prev) {
      errors.push(err(rowNo, "record_date", "Date", "belum ada data sebelumnya untuk lokasi ini sebelum tanggal tersebut", "Mode sederhana melanjutkan data lama — gunakan Mode lengkap (38 kolom) untuk data pertama lokasi ini"));
      continue;
    }
    const city = r.city_or_regency ?? (blank(prev["city_or_regency"]) ? null : String(prev["city_or_regency"]));
    let template: Stored | null = r.city_or_regency == null ? prev : c.template;
    if (!template || low(template["city_or_regency"]) !== low(city)) {
      template = [prev, ...rows.filter((d): d is NormalizedRow => !!d)].find((d) => low(d["location"]) === low(r.location) && low(d["city_or_regency"]) === low(city)) ?? null;
    }
    if (!template) {
      errors.push(err(rowNo, "city_or_regency", "City or Regency", `“${city}” belum ada di dataset untuk ${r.location}`, "Pilih kota/kabupaten dari daftar atau kosongkan agar memakai kota pada data terakhir"));
      continue;
    }
    const target: Stored = { ...template, city_or_regency: city };
    const sPrev = cityShare(prev, c.city_pops);
    const sNew = cityShare(target, c.city_pops);
    const carry = (f: string) => Math.round(((num(prev[f]) ?? 0) / sPrev) * sNew);
    const nc = r.new_cases, nd = r.new_deaths, nr = r.new_recovered;
    const tc = carry("total_cases") + nc;
    const td = carry("total_deaths") + nd;
    const tr = carry("total_recovered") + nr;
    const pop = num(template["population"]);
    const perPop = (v: number, k: number) => (pop && pop > 0 ? round((v / pop) * k, 2) : null);
    const growth = (cur: number, before: unknown) => {
      const b = (num(before) ?? 0) / sPrev;
      const n = cur / sNew;
      return b > 0 ? round(n / b, 2) : n === 0 ? 1 : null;
    };
    const out: NormalizedRow = {};
    for (const f of FIXED_TEXT) out[f] = blank(template[f]) ? null : String(template[f]);
    for (const f of FIXED_NUMBERS) out[f] = num(template[f]);
    Object.assign(out, {
      record_date: r.record_date, location: r.location, city_or_regency: city,
      new_cases: nc, new_deaths: nd, new_recovered: nr, new_active_cases: nc - nd - nr,
      total_cases: tc, total_deaths: td, total_recovered: tr, total_active_cases: tc - td - tr,
      new_cases_per_million: perPop(nc, 1e6), total_cases_per_million: perPop(tc, 1e6),
      new_deaths_per_million: perPop(nd, 1e6), total_deaths_per_million: perPop(td, 1e6), total_deaths_per_100k: perPop(td, 1e5),
      case_fatality_rate: tc > 0 ? round(td / tc, 4) : 0, case_recovered_rate: tc > 0 ? round(tr / tc, 4) : 0,
      growth_factor_new_cases: growth(nc, prev["new_cases"]), growth_factor_new_deaths: growth(nd, prev["new_deaths"]),
    });
    rows[i] = out;
  }
  errors.sort((a, b) => a.row - b.row);
  return { rows, errors };
}
