// Pure ETL transform: raw workbook rows → validated records ready to store and visualise.
import { REQUIRED_COLUMNS, keyOf, parseDate } from "@/lib/covid-data";
import { COVID_COLUMNS, COVID_HEADERS, rowIdentity } from "@/lib/covid-schema";

/** One stored row: every Excel column, keyed by its MySQL column name (see covid-schema). */
export interface EtlRecord {
  record_date: string;
  location_iso_code: string | null;
  location: string;
  new_cases: number; new_deaths: number; new_recovered: number; new_active_cases: number | null;
  total_cases: number; total_deaths: number; total_recovered: number; total_active_cases: number;
  location_level: "Country" | "Province";
  city_or_regency: string | null;
  province: string | null;
  country: string | null;
  continent: string | null;
  island: string | null;
  time_zone: string | null;
  special_status: string | null;
  total_regencies: number | null;
  total_cities: number | null;
  total_districts: number | null;
  total_urban_villages: number | null;
  total_rural_villages: number | null;
  area_km2: number | null;
  population: number | null;
  population_density: number | null;
  longitude: number | null;
  latitude: number | null;
  new_cases_per_million: number | null;
  total_cases_per_million: number | null;
  new_deaths_per_million: number | null;
  total_deaths_per_million: number | null;
  total_deaths_per_100k: number | null;
  case_fatality_rate: number | null;
  case_recovered_rate: number | null;
  growth_factor_new_cases: number | null;
  growth_factor_new_deaths: number | null;
}

export interface EtlStats {
  rows: number;
  columns: number;
  missingCells: number;
  duplicates: number;
  invalidDates: number;
  invalidCoords: number;
  nationalRows: number;
  provinceRows: number;
  provinces: number;
  cities: number;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface EtlStep { name: string; detail: string; count: number }
export interface EtlReport { before: EtlStats; after: EtlStats; steps: EtlStep[]; dropped: number }

const KEY_COLUMNS = [...REQUIRED_COLUMNS, "Province", "Island", "Latitude", "Longitude", "Population"];

const isBlank = (v: unknown) => v == null || (typeof v === "string" && v.trim() === "");
const toNum = (v: unknown): number | null => {
  if (isBlank(v)) return null;
  const n = typeof v === "number" ? v : Number(String(v).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const toText = (v: unknown) => (isBlank(v) ? null : String(v).trim());
const normLevel = (v: unknown): "Country" | "Province" | null => {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "country" ? "Country" : s === "province" ? "Province" : null;
};
const coordOk = (lat: number | null, lng: number | null) => lat != null && lng != null && lat >= -12 && lat <= 7 && lng >= 94 && lng <= 142;
const cityOf = (v: unknown) => { const c = toText(v); return c && !/^seluruh/i.test(c) ? c : null; };
const rowKey = (date: string, loc: string, city: string | null) => rowIdentity(date, loc, "Province", city);

/** Excel serial/Date values whose stored day is ≤ 12 were saved with day and month swapped. */
function wasSwapped(v: unknown) {
  if (v instanceof Date) return v.getDate() <= 12;
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 86400000)).getUTCDate() <= 12;
  return false;
}

function statsOfRaw(raw: Record<string, unknown>[], columns: string[]): EtlStats {
  const seen = new Set<string>();
  let missing = 0, dup = 0, badDate = 0, badCoord = 0, nat = 0, prov = 0;
  const provs = new Set<string>(), cities = new Set<string>();
  let min: string | null = null, max: string | null = null;
  for (const r of raw) {
    for (const c of KEY_COLUMNS) if (columns.includes(c) && isBlank(r[c])) missing++;
    const t = parseDate(r["Date"]);
    if (t == null) badDate++;
    else { const k = keyOf(t); if (!min || k < min) min = k; if (!max || k > max) max = k; }
    const loc = String(r["Location"] ?? "").trim();
    const key = rowKey(String(r["Date"] ?? ""), loc, cityOf(r["City or Regency"]));
    if (seen.has(key)) dup++; else seen.add(key);
    const lat = toNum(r["Latitude"]), lng = toNum(r["Longitude"]);
    if ((lat != null || lng != null || !isBlank(r["Latitude"])) && !coordOk(lat, lng)) badCoord++;
    const lvl = normLevel(r["Location Level"]);
    if (lvl === "Country") nat++;
    if (lvl === "Province") { prov++; if (loc) provs.add(loc); const c = cityOf(r["City or Regency"]); if (c) cities.add(`${loc}|${c}`); }
  }
  return { rows: raw.length, columns: columns.length, missingCells: missing, duplicates: dup, invalidDates: badDate, invalidCoords: badCoord, nationalRows: nat, provinceRows: prov, provinces: provs.size, cities: cities.size, periodStart: min, periodEnd: max };
}

function statsOfRecords(recs: EtlRecord[], columns: number): EtlStats {
  let missing = 0, nat = 0, prov = 0;
  const provs = new Set<string>(), cities = new Set<string>();
  let min: string | null = null, max: string | null = null;
  for (const r of recs) {
    if (r.latitude == null) missing++;
    if (r.longitude == null) missing++;
    if (r.population == null) missing++;
    if (r.location_level === "Country") nat++; else { prov++; provs.add(r.location); const c = cityOf(r.city_or_regency); if (c) cities.add(`${r.location}|${c}`); }
    if (!min || r.record_date < min) min = r.record_date;
    if (!max || r.record_date > max) max = r.record_date;
  }
  return { rows: recs.length, columns, missingCells: missing, duplicates: 0, invalidDates: 0, invalidCoords: 0, nationalRows: nat, provinceRows: prov, provinces: provs.size, cities: cities.size, periodStart: min, periodEnd: max };
}

export function transformRows(raw: Record<string, unknown>[], columns: string[]): { records: EtlRecord[]; report: EtlReport } {
  const missingCols = REQUIRED_COLUMNS.filter((c) => !columns.includes(c));
  if (missingCols.length) throw new Error(`Kolom wajib tidak ditemukan: ${missingCols.join(", ")}`);
  const before = statsOfRaw(raw, columns);
  let badDate = 0, swapped = 0, noLoc = 0, badLevel = 0, missingReq = 0, dup = 0, coordFixed = 0, typeFixed = 0, trimmed = 0;
  const seen = new Set<string>();
  const records: EtlRecord[] = [];
  for (const r of raw) {
    const t = parseDate(r["Date"]);
    if (t == null) { badDate++; continue; }
    if (wasSwapped(r["Date"])) swapped++;
    const location = toText(r["Location"]);
    if (!location) { noLoc++; continue; }
    if (location !== r["Location"]) trimmed++;
    const level = normLevel(r["Location Level"]);
    if (!level) { badLevel++; continue; }
    const nc = toNum(r["New Cases"]), nd = toNum(r["New Deaths"]), nr = toNum(r["New Recovered"]);
    const tc = toNum(r["Total Cases"]), td = toNum(r["Total Deaths"]), tr = toNum(r["Total Recovered"]), ta = toNum(r["Total Active Cases"]);
    if (nc == null || nd == null || nr == null || tc == null || td == null || tr == null || ta == null) { missingReq++; continue; }
    const date = keyOf(t);
    const city = level === "Province" ? cityOf(r["City or Regency"]) : null;
    const key = rowKey(date, location, city);
    if (seen.has(key)) { dup++; continue; }
    seen.add(key);
    let lat = toNum(r["Latitude"]), lng = toNum(r["Longitude"]);
    if ((lat != null || lng != null) && !coordOk(lat, lng)) { coordFixed++; lat = null; lng = null; }
    const opt = (c: string) => { const v = toNum(r[c]); if (v == null && !isBlank(r[c])) typeFixed++; return v; };
    const int = (c: string) => { const v = opt(c); return v == null ? null : Math.round(v); };
    records.push({
      record_date: date,
      location_iso_code: toText(r["Location ISO Code"]),
      location,
      new_cases: Math.round(nc), new_deaths: Math.round(nd), new_recovered: Math.round(nr),
      new_active_cases: int("New Active Cases"),
      total_cases: Math.round(tc), total_deaths: Math.round(td), total_recovered: Math.round(tr), total_active_cases: Math.round(ta),
      location_level: level,
      city_or_regency: toText(r["City or Regency"]),
      province: toText(r["Province"]),
      country: toText(r["Country"]),
      continent: toText(r["Continent"]),
      island: toText(r["Island"]),
      time_zone: toText(r["Time Zone"]),
      special_status: toText(r["Special Status"]),
      total_regencies: int("Total Regencies"),
      total_cities: int("Total Cities"),
      total_districts: int("Total Districts"),
      total_urban_villages: int("Total Urban Villages"),
      total_rural_villages: int("Total Rural Villages"),
      area_km2: opt("Area (km2)"),
      population: int("Population"),
      population_density: opt("Population Density"),
      longitude: lng, latitude: lat,
      new_cases_per_million: opt("New Cases per Million"),
      total_cases_per_million: opt("Total Cases per Million"),
      new_deaths_per_million: opt("New Deaths per Million"),
      total_deaths_per_million: opt("Total Deaths per Million"),
      total_deaths_per_100k: opt("Total Deaths per 100rb"),
      case_fatality_rate: opt("Case Fatality Rate"),
      case_recovered_rate: opt("Case Recovered Rate"),
      growth_factor_new_cases: opt("Growth Factor of New Cases"),
      growth_factor_new_deaths: opt("Growth Factor of New Deaths"),
    });
  }
  records.sort((a, b) => a.record_date.localeCompare(b.record_date) || a.location.localeCompare(b.location));
  const after = statsOfRecords(records, columns.length);
  const steps: EtlStep[] = [
    { name: "Validasi tanggal", detail: "Baris dengan tanggal kosong/tidak valid dikeluarkan", count: badDate },
    { name: "Koreksi format tanggal", detail: "Tanggal Excel yang hari/bulannya tertukar diperbaiki", count: swapped },
    { name: "Missing values (kolom utama)", detail: "Baris tanpa lokasi atau nilai kasus/kematian/kesembuhan dikeluarkan", count: noLoc + missingReq },
    { name: "Tingkat wilayah", detail: "Baris dengan Location Level selain Country/Province dikeluarkan", count: badLevel },
    { name: "Duplikasi", detail: "Baris dengan tanggal + lokasi + kota yang sama dihapus (disimpan satu)", count: dup },
    { name: "Konversi tipe data", detail: "Nilai opsional yang bukan angka dikosongkan (bukan diisi nol)", count: typeFixed },
    { name: "Validasi koordinat", detail: "Koordinat di luar wilayah Indonesia dikosongkan", count: coordFixed },
    { name: "Pembersihan teks", detail: "Spasi berlebih pada nama lokasi dirapikan", count: trimmed },
    { name: "Pemisahan nasional & provinsi", detail: `${after.nationalRows} baris nasional · ${after.provinceRows} baris provinsi`, count: after.nationalRows + after.provinceRows },
  ];
  return { records, report: { before, after, steps, dropped: raw.length - records.length } };
}

/** Columns the dashboard's buildDataset receives: every Excel header, rebuilt from stored records. */
export const DASHBOARD_COLUMNS = COVID_HEADERS;

export function recordToRaw(r: EtlRecord): Record<string, unknown> {
  const rec = r as unknown as Record<string, unknown>;
  return Object.fromEntries(COVID_COLUMNS.map((c) => [c.header, rec[c.field] ?? null]));
}

export type ColType = "Tanggal" | "Bilangan bulat" | "Desimal" | "Teks" | "Kosong";
export function inferColumns(raw: Record<string, unknown>[], columns: string[]) {
  return columns.map((c) => {
    let missing = 0, ints = 0, decs = 0, texts = 0;
    for (const r of raw) {
      const v = r[c];
      if (isBlank(v)) { missing++; continue; }
      if (typeof v === "number") (Number.isInteger(v) ? ints++ : decs++);
      else if (toNum(v) != null) (Number.isInteger(toNum(v)) ? ints++ : decs++);
      else texts++;
    }
    const type: ColType = /date|tanggal/i.test(c) ? "Tanggal" : texts ? "Teks" : decs ? "Desimal" : ints ? "Bilangan bulat" : "Kosong";
    return { name: c, type, missing };
  });
}
